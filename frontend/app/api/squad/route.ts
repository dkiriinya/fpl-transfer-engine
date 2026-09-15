import { NextRequest, NextResponse } from 'next/server'
import { fetchSquadFromFPL } from '@/lib/fpl-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const gw = searchParams.get('gw')

  if (!teamId || !gw) {
    return NextResponse.json(
      { error: 'Missing teamId or gw parameter' },
      { status: 400 }
    )
  }

  const result = await fetchSquadFromFPL(teamId, gw)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data)
}
