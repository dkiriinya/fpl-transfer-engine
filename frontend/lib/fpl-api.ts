import type {
  BootstrapResponse,
  FPLSquadResponse,
  OptimizeRequest,
  OptimizeResponse,
} from './types'

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  const res = await fetch('/api/bootstrap')
  if (!res.ok) {
    throw new Error(`Bootstrap failed: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchSquad(
  teamId: number,
  gameweek: number
): Promise<FPLSquadResponse> {
  const res = await fetch(`/api/squad?teamId=${teamId}&gw=${gameweek}`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to fetch squad for GW${gameweek}`)
  }
  return res.json()
}

export async function runOptimize(
  req: OptimizeRequest
): Promise<OptimizeResponse> {
  const res = await fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Optimization failed (${res.status})`)
  }
  return res.json()
}
