import { NextResponse } from 'next/server'

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/'

export async function GET() {
  try {
    const res = await fetch(FPL_BOOTSTRAP_URL, {
      headers: { 'User-Agent': 'FPL-Decision-Engine/1.0' },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `FPL API error: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    const events: Array<{
      id: number
      name: string
      is_current: boolean
      is_next: boolean
      finished: boolean
    }> = data.events ?? []

    const current = events.find((e) => e.is_current)
    const next = events.find((e) => e.is_next)

    // Once a gameweek is current (in progress or finished), its transfer deadline has passed.
    // The actionable gameweek for transfers/chips is always `next.id` (or current.id + 1).
    const liveGameweek = current ? current.id : null
    let planningGameweek = 7
    if (next) {
      planningGameweek = next.id
    } else if (current) {
      planningGameweek = Math.min(38, current.id + 1)
    }

    const playerPhotos: Record<number, string> = {}
    if (Array.isArray(data.elements)) {
      for (const el of data.elements) {
        if (el && el.id) {
          const photoCode = el.photo
            ? el.photo.replace(/\.(jpg|png)$/i, '')
            : String(el.code || el.id)
          playerPhotos[el.id] = photoCode
        }
      }
    }

    return NextResponse.json({
      currentGameweek: planningGameweek,
      liveGameweek,
      planningGameweek,
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        finished: e.finished,
        is_current: e.is_current,
        is_next: e.is_next,
      })),
      playerPhotos,
    })
  } catch (err) {
    console.error('[bootstrap] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch bootstrap' }, { status: 500 })
  }
}
