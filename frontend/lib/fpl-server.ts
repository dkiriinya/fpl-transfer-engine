import type { PlayerRec, ActualLineupSnapshot } from './types'

const FPL_BASE = 'https://fantasy.premierleague.com/api'
const POS_MAP: Record<number, 'GKP' | 'DEF' | 'MID' | 'FWD'> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
}

async function buildActualLineupSnapshot(
  picks: Array<{
    element: number
    position: number
    multiplier: number
    is_captain: boolean
    is_vice_captain: boolean
  }>,
  targetGw: number,
  headers: Record<string, string>
): Promise<ActualLineupSnapshot | undefined> {
  try {
    const [bootRes, liveRes] = await Promise.all([
      fetch(`${FPL_BASE}/bootstrap-static/`, { headers, cache: 'no-store' }),
      fetch(`${FPL_BASE}/event/${targetGw}/live/`, { headers, cache: 'no-store' }),
    ])

    if (!bootRes.ok) return undefined
    const bootData = await bootRes.json()
    const liveData = liveRes.ok ? await liveRes.json() : { elements: [] }

    const elementsById: Record<number, any> = {}
    for (const el of bootData.elements ?? []) {
      elementsById[el.id] = el
    }

    const teamsById: Record<number, string> = {}
    for (const t of bootData.teams ?? []) {
      teamsById[t.id] = t.short_name
    }

    const livePtsById: Record<number, number> = {}
    for (const item of liveData.elements ?? []) {
      if (item && item.id != null) {
        livePtsById[item.id] = Number(item.stats?.total_points ?? 0)
      }
    }

    const sortedPicks = [...picks].sort((a, b) => a.position - b.position)
    const starting_xi: PlayerRec[] = []
    const bench: PlayerRec[] = []

    for (const p of sortedPicks) {
      const el = elementsById[p.element]
      if (!el) continue
      const isStarter = p.position <= 11
      const rawPts = livePtsById[p.element] ?? Number(el.event_points ?? 0)
      const effectivePts = isStarter ? rawPts * Math.max(1, p.multiplier || 1) : rawPts

      const rec: PlayerRec = {
        player_id: p.element,
        web_name: el.web_name ?? `Player ${p.element}`,
        team: teamsById[el.team] ?? 'UNK',
        position: POS_MAP[el.element_type] ?? 'MID',
        price: Number(el.now_cost ?? 50) / 10,
        projected_points: effectivePts,
        is_captain: !!p.is_captain,
        is_vice_captain: !!p.is_vice_captain,
        is_starter: isStarter,
        multiplier: p.multiplier,
      }

      if (isStarter) {
        starting_xi.push(rec)
      } else {
        bench.push(rec)
      }
    }

    const captain = starting_xi.find((p) => p.is_captain) ?? null
    const vice_captain = starting_xi.find((p) => p.is_vice_captain) ?? null
    const total_points = starting_xi.reduce((acc, p) => acc + p.projected_points, 0)
    const bench_points = bench.reduce((acc, p) => acc + p.projected_points, 0)

    return {
      starting_xi,
      bench,
      captain,
      vice_captain,
      total_points,
      bench_points,
    }
  } catch (err) {
    console.warn('[fpl-server] Failed to build actual lineup snapshot:', err)
    return undefined
  }
}

async function calculateFreeTransfers(
  teamId: string,
  targetGw: number,
  headers: Record<string, string>,
  fallbackActiveChip?: string | null,
  fallbackEventTransfers?: number
): Promise<number> {
  if (targetGw <= 1) return 1

  try {
    const histRes = await fetch(`${FPL_BASE}/entry/${teamId}/history/`, {
      headers,
      cache: 'no-store',
    })
    if (histRes.ok) {
      const histData = await histRes.json()
      const current: Array<{ event: number; event_transfers?: number }> = Array.isArray(
        histData?.current
      )
        ? [...histData.current].sort((a, b) => a.event - b.event)
        : []

      if (current.length > 0) {
        const unlimitedChipGws = new Set<number>()
        for (const c of histData?.chips ?? []) {
          if (
            c &&
            (c.name === 'wildcard' || c.name === 'freehit') &&
            typeof c.event === 'number'
          ) {
            unlimitedChipGws.add(c.event)
          }
        }

        const firstEvent = current[0].event
        let ft = 1

        for (const ev of current) {
          if (ev.event >= targetGw) break
          if (ev.event === firstEvent) {
            // Initial gameweek squad creation; manager enters firstEvent + 1 with 1 FT
            ft = 1
            continue
          }

          if (unlimitedChipGws.has(ev.event)) {
            // Wildcard / Free Hit preserves banked free transfers but does not roll a new one
            ft = Math.max(1, Math.min(5, ft))
          } else {
            const used = ev.event_transfers ?? 0
            ft = Math.min(5, Math.max(0, ft - used) + 1)
          }
        }

        return Math.max(1, Math.min(5, ft))
      }
    }
  } catch (err) {
    console.warn('[fpl-server] Failed to calculate exact free transfers from history:', err)
  }

  // Fallback if history endpoint is unreachable
  if (fallbackActiveChip === 'wildcard' || fallbackActiveChip === 'freehit') {
    return 1
  }
  return Math.max(1, 2 - (fallbackEventTransfers ?? 0))
}

export async function fetchSquadFromFPL(teamId: string, gw: string) {
  const targetGw = parseInt(gw, 10)
  const headers = { 'User-Agent': 'FPL-Decision-Engine/1.0' }

  // 1. Try target gameweek first (succeeds for past and currently live gameweeks)
  try {
    const res = await fetch(`${FPL_BASE}/entry/${teamId}/event/${targetGw}/picks/`, {
      headers,
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.picks && data.picks.length > 0) {
        const [actualLineup, freeTransfers] = await Promise.all([
          buildActualLineupSnapshot(data.picks, targetGw, headers),
          calculateFreeTransfers(
            teamId,
            targetGw,
            headers,
            data.active_chip,
            data.entry_history?.event_transfers
          ),
        ])
        return {
          data: {
            ...data,
            is_exact_gw: true,
            free_transfers: freeTransfers,
            actual_lineup: actualLineup,
          },
          status: 200,
        }
      }
    }
  } catch (e) {
    // Continue to fallback
  }

  // 2. Target GW is in the future (FPL returns 404 for unplayed GWs).
  // Fetch entry details to find the current/latest available event
  let latestEvent = targetGw - 1
  let entryData: any = null

  try {
    const entryRes = await fetch(`${FPL_BASE}/entry/${teamId}/`, {
      headers,
      cache: 'no-store',
    })
    if (entryRes.ok) {
      entryData = await entryRes.json()
      if (entryData && entryData.current_event) {
        latestEvent = entryData.current_event
      }
    } else if (entryRes.status === 404) {
      return {
        error: `FPL Team ID ${teamId} not found. Please check your Team ID.`,
        status: 404,
      }
    }
  } catch (e) {
    // Continue with fallback decrement
  }

  // 3. Fallback: Search backwards from latestEvent down to GW 1
  for (let g = Math.min(latestEvent, targetGw); g >= 1; g--) {
    try {
      const fallbackRes = await fetch(`${FPL_BASE}/entry/${teamId}/event/${g}/picks/`, {
        headers,
        cache: 'no-store',
      })
      if (fallbackRes.ok) {
        const data = await fallbackRes.json()
        if (data && data.picks && data.picks.length > 0) {
          if (!data.entry_history && entryData) {
            data.entry_history = {
              bank: entryData.last_deadline_bank ?? 0,
              event_transfers: 0,
              event_transfers_cost: 0,
              points: 0,
              total_points: entryData.summary_overall_points ?? 0,
            }
          }
          const freeTransfers = await calculateFreeTransfers(
            teamId,
            targetGw,
            headers,
            data.active_chip,
            data.entry_history?.event_transfers
          )
          return {
            data: {
              ...data,
              is_exact_gw: false,
              free_transfers: freeTransfers,
            },
            status: 200,
          }
        }
      }
    } catch (e) {
      // Continue search
    }
  }

  return {
    error: `No squad picks found for team ${teamId}. Picks for future gameweeks are only available once the deadline passes or after gameweek 1 starts.`,
    status: 404,
  }
}
