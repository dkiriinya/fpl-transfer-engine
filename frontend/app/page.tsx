'use client'

import { useEffect, useState, useCallback } from 'react'
import type { FPLSquadResponse, OptimizeResponse } from '@/lib/types'
import { fetchSquad, fetchBootstrap, runOptimize } from '@/lib/fpl-api'
import TeamSetupModal from '@/components/TeamSetupModal'
import Dashboard from '@/components/Dashboard'
import LoadingState from '@/components/LoadingState'

const DEFAULT_TEAM_ID =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FPL_TEAM_ID
    ? parseInt(process.env.NEXT_PUBLIC_FPL_TEAM_ID, 10)
    : null

export default function Home() {
  const [teamId, setTeamId] = useState<number | null>(null)
  const [gameweek, setGameweek] = useState<number | null>(null)
  const [horizon, setHorizon] = useState<number>(1)
  const [events, setEvents] = useState<
    Array<{ id: number; name: string; finished: boolean; is_current: boolean; is_next: boolean }>
  >([])
  const [playerPhotos, setPlayerPhotos] = useState<Record<number, string>>({})
  const [squad, setSquad] = useState<FPLSquadResponse | null>(null)
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  // Resolve team ID from localStorage or env constant on mount
  useEffect(() => {
    const stored = localStorage.getItem('fpl_team_id')
    if (stored) {
      setTeamId(parseInt(stored, 10))
    } else if (DEFAULT_TEAM_ID && !isNaN(DEFAULT_TEAM_ID)) {
      localStorage.setItem('fpl_team_id', String(DEFAULT_TEAM_ID))
      setTeamId(DEFAULT_TEAM_ID)
    } else {
      setShowSetup(true)
    }
    setInitialized(true)
  }, [])

  const runPipeline = useCallback(
    async (tid: number, targetGw?: number, targetHorizon: number = 1) => {
      setIsLoading(true)
      setError(null)
      try {
        // Step 1: Bootstrap current/upcoming gameweek and player photos dictionary
        const bootstrap = await fetchBootstrap()
        const resolvedGw = targetGw ?? bootstrap.currentGameweek ?? 4
        setGameweek(resolvedGw)
        setHorizon(targetHorizon)
        setEvents(bootstrap.events || [])
        setPlayerPhotos(bootstrap.playerPhotos || {})

        // Step 2: Fetch live squad from FPL API
        const squadData = await fetchSquad(tid, resolvedGw)
        setSquad(squadData)

        // Step 3: Run MILP solver with multi-gameweek horizon
        const currentSquadIds = squadData.picks.map((p) => p.element)
        const bank = squadData.entry_history.bank / 10
        const eventTransfers = squadData.entry_history.event_transfers ?? 0
        const freeTransfers = Math.max(1, 2 - eventTransfers)

        const optimizeResult = await runOptimize({
          team_id: tid,
          gameweek: resolvedGw,
          current_squad: currentSquadIds,
          bank,
          free_transfers: freeTransfers,
          wildcard_active: false,
          chip: 'none',
          horizon: targetHorizon,
        })
        setResult(optimizeResult)
      } catch (err) {
        console.error('Pipeline error:', err)
        setError(err instanceof Error ? err.message : 'An unknown error occurred')
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  // Auto-trigger pipeline when teamId resolves
  useEffect(() => {
    if (teamId && initialized) {
      runPipeline(teamId, gameweek ?? undefined, horizon)
    }
  }, [teamId, initialized])

  function handleTeamSet(id: number) {
    setTeamId(id)
    setShowSetup(false)
  }

  function handleChangeTeam() {
    localStorage.removeItem('fpl_team_id')
    setTeamId(null)
    setSquad(null)
    setResult(null)
    setGameweek(null)
    setError(null)
    setShowSetup(true)
  }

  function handleSelectGameweek(newGw: number) {
    if (teamId) {
      setGameweek(newGw)
      runPipeline(teamId, newGw, horizon)
    }
  }

  function handleSelectHorizon(newH: number) {
    if (teamId && gameweek) {
      setHorizon(newH)
      runPipeline(teamId, gameweek, newH)
    }
  }

  // SSR guard — avoid hydration mismatch from localStorage
  if (!initialized) return null

  if (showSetup) {
    return <TeamSetupModal onTeamSet={handleTeamSet} />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-surface-canvas px-4">
        <div className="border border-accent-loss bg-surface-card p-6 w-full max-w-md rounded-md">
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent-loss mb-2">
            OPTIMIZATION ERROR
          </p>
          <p className="font-mono text-xs text-text-secondary leading-relaxed">{error}</p>
          <button
            onClick={() => teamId && runPipeline(teamId, gameweek ?? undefined, horizon)}
            className="mt-4 w-full font-mono text-xs uppercase tracking-widest text-text-primary bg-surface-elevated border border-border-hard px-4 py-3 hover:border-accent-cyan hover:text-accent-cyan transition-colors rounded-sm"
            style={{ minHeight: '44px' }}
          >
            RETRY PIPELINE
          </button>
        </div>
      </div>
    )
  }

  if (isLoading || !result || !squad || !gameweek) {
    return <LoadingState />
  }

  return (
    <Dashboard
      teamId={teamId!}
      gameweek={gameweek}
      horizon={horizon}
      events={events}
      squad={squad}
      result={result}
      playerPhotos={playerPhotos}
      isLoading={isLoading}
      onSelectGameweek={handleSelectGameweek}
      onSelectHorizon={handleSelectHorizon}
      onChangeTeam={handleChangeTeam}
      onRefresh={() => teamId && runPipeline(teamId, gameweek, horizon)}
    />
  )
}
