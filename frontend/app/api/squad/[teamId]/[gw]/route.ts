import { NextRequest, NextResponse } from 'next/server'
import { fetchSquadFromFPL } from '@/lib/fpl-server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { teamId: string; gw: string } }
) {
  const { teamId, gw } = params

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