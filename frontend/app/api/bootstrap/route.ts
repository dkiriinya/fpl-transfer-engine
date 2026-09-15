import { NextResponse } from 'next/server'

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/'

export async function GET() {
  try {
    const res = await fetch(FPL_BOOTSTRAP_URL, {
      headers: { 'User-Agent': 'FPL-Decision-Engine/1.0' },
      next: { revalidate: 300 },
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
    
    // If current is already finished or next is defined, upcoming gameweek to plan for is next.id
    let upcomingGameweek = 4
    if (next) {
      upcomingGameweek = next.id
    } else if (current && !current.finished) {
      upcomingGameweek = current.id
    } else if (current) {
      upcomingGameweek = current.id + 1
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
      currentGameweek: upcomingGameweek,
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
