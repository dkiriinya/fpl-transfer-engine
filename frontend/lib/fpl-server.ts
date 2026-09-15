const FPL_BASE = 'https://fantasy.premierleague.com/api'

export async function fetchSquadFromFPL(teamId: string, gw: string) {
  const targetGw = parseInt(gw, 10)
  const headers = { 'User-Agent': 'FPL-Decision-Engine/1.0' }

  // 1. Try target gameweek first
  try {
    const res = await fetch(`${FPL_BASE}/entry/${teamId}/event/${targetGw}/picks/`, {
      headers,
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.picks && data.picks.length > 0) {
        return { data, status: 200 }
      }
    }
  } catch (e) {
    // Continue to fallback
  }

  // 2. Target GW is likely in the future (FPL returns 404 for unplayed GWs).
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
          // If entry_history bank is missing or 0, fallback to last_deadline_bank
          if (!data.entry_history && entryData) {
            data.entry_history = {
              bank: entryData.last_deadline_bank ?? 0,
              event_transfers: 0,
              event_transfers_cost: 0,
              points: 0,
              total_points: entryData.summary_overall_points ?? 0,
            }
          }
          return { data, status: 200 }
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

