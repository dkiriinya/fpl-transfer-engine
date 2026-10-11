'use client'

import { useState, useEffect } from 'react'
import type { OptimizeResponse, FPLSquadResponse, ChipType } from '@/lib/types'
import HeaderBar from './HeaderBar'
import TransferPanel from './TransferPanel'
import SquadPitch from './SquadPitch'
import MetricsBar from './MetricsBar'
import ChipDeck from './ChipDeck'
import LoadingState from './LoadingState'

interface DashboardProps {
  teamId: number
  gameweek: number
  horizon: number
  events?: Array<{
    id: number
    name: string
    finished: boolean
    is_current: boolean
    is_next: boolean
  }>
  squad: FPLSquadResponse
  result: OptimizeResponse | null
  playerPhotos?: Record<number, string>
  isLoading: boolean
  onSelectGameweek: (gw: number) => void
  onSelectHorizon: (h: number) => void
  onChangeTeam: () => void
  onRefresh: () => void
}

export default function Dashboard({
  teamId,
  gameweek,
  horizon,
  events = [],
  squad,
  result,
  playerPhotos = {},
  isLoading,
  onSelectGameweek,
  onSelectHorizon,
  onChangeTeam,
  onRefresh,
}: DashboardProps) {
  const [selectedChip, setSelectedChip] = useState<ChipType>(
    ((result?.chip_active as ChipType) || 'none')
  )

  useEffect(() => {
    if (result?.chip_active) {
      setSelectedChip(result.chip_active as ChipType)
    } else {
      setSelectedChip('none')
    }
  }, [result?.chip_active, gameweek])

  const currentEv = events.find((e) => e.id === gameweek)
  const nextEv = events.find((e) => e.is_next)
  const liveEv = events.find((e) => e.is_current)
  const nextGw = nextEv?.id ?? (liveEv ? Math.min(38, liveEv.id + 1) : gameweek + 1)

  // A gameweek is locked if its deadline has passed (it is finished, currently live, or FPL returned exact picks for it)
  const isLockedGw = !!(currentEv?.finished || currentEv?.is_current || squad.is_exact_gw)
  const isLiveNow = !!(currentEv?.is_current && !currentEv?.finished)

  const bankBalance = (squad.entry_history?.bank ?? 0) / 10
  const eventTransfers = squad.entry_history?.event_transfers ?? 0
  const isPrevUnlimitedChip =
    squad.active_chip === 'wildcard' || squad.active_chip === 'freehit'
  const freeTransfers =
    squad.free_transfers ?? (isPrevUnlimitedChip ? 1 : Math.max(1, 2 - eventTransfers))

  const activeEval =
    result?.chip_evaluations?.find((e) => e.chip_id === selectedChip) ?? null

  const displayTransfers = isLockedGw
    ? []
    : activeEval
    ? activeEval.transfers
    : result?.transfers ?? []

  const displayStartingXi =
    isLockedGw && squad.actual_lineup
      ? squad.actual_lineup.starting_xi
      : activeEval
      ? activeEval.starting_xi
      : result?.starting_xi ?? []

  const displayBench =
    isLockedGw && squad.actual_lineup
      ? squad.actual_lineup.bench
      : activeEval
      ? activeEval.bench
      : result?.bench ?? []

  const displayTransfersMade = activeEval ? activeEval.transfers_made : result?.transfers_made ?? 0
  const displayNetPoints = activeEval ? activeEval.net_points : result?.net_points ?? 0
  const displayTotalProj = activeEval ? activeEval.projected_points : result?.total_projected_points ?? 0
  const displayHitPenalty = activeEval ? activeEval.hit_penalty : result?.hit_penalty ?? 0
  const displayBankRemaining = activeEval ? activeEval.bank_remaining : result?.bank_remaining ?? bankBalance

  const transfersOutIds = isLockedGw ? [] : displayTransfers.map((t) => t.out.player_id)
  const transfersInIds = isLockedGw ? [] : displayTransfers.map((t) => t.in_.player_id)

  const horizonLabel = horizon === 1 ? '1 GW' : `${horizon} GWs`

  const pitchHeaderTag = isLockedGw
    ? isLiveNow
      ? `GW${gameweek} ACTUAL SQUAD · LIVE IN PROGRESS`
      : `GW${gameweek} ACTUAL SQUAD · FINAL POINTS`
    : undefined

  return (
    <div className="flex flex-col min-h-screen bg-surface-canvas text-text-primary">
      <HeaderBar
        teamId={teamId}
        gameweek={gameweek}
        horizon={horizon}
        bankBalance={bankBalance}
        isLockedGw={isLockedGw}
        events={events}
        onSelectGameweek={onSelectGameweek}
        onSelectHorizon={onSelectHorizon}
        onChangeTeam={onChangeTeam}
        isLoading={isLoading}
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-4 p-3 sm:p-4 max-w-7xl mx-auto w-full">
          {/* Top: Chip Recommendation Engine Deck (only for editable upcoming gameweeks) */}
          {!isLockedGw && result?.chip_evaluations && result.chip_evaluations.length > 0 && (
            <ChipDeck
              evaluations={result.chip_evaluations}
              activeChip={selectedChip}
              gameweek={gameweek}
              horizon={horizon}
              onSelectChip={setSelectedChip}
            />
          )}

          {/* Metrics summary bar (only for editable upcoming gameweeks) */}
          {!isLockedGw && result && (
            <MetricsBar
              result={{
                ...result,
                chip_active: selectedChip,
                transfers_made: displayTransfersMade,
                net_points: displayNetPoints,
                total_projected_points: displayTotalProj,
                hit_penalty: displayHitPenalty,
                bank_remaining: displayBankRemaining,
                transfers: displayTransfers,
              }}
              gameweek={gameweek}
              horizon={horizon}
            />
          )}

          {/* Main Dashboard Grid */}
          <main className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
            {/* Left column: Tactical Pitch View */}
            <div className="order-2 lg:order-1 flex flex-col gap-2">
              <SquadPitch
                startingXi={displayStartingXi}
                bench={displayBench}
                transfersOut={transfersOutIds}
                transfersIn={transfersInIds}
                gameweek={gameweek}
                horizon={horizon}
                playerPhotos={playerPhotos}
                headerTag={pitchHeaderTag}
              />
            </div>

            {/* Right column: Locked GW Snapshot OR Upcoming GW Transfer Recommendations */}
            <div className="order-1 lg:order-2 flex flex-col border border-border-hard bg-surface-card rounded-md">
              {isLockedGw ? (
                <div className="p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border-hard">
                    <div className="flex flex-col">
                      <h2 className="font-heading text-xs font-bold uppercase tracking-widest text-text-primary">
                        GW{gameweek} {isLiveNow ? 'LIVE SQUAD SNAPSHOT' : 'HISTORICAL SQUAD'}
                      </h2>
                      <span className="font-mono text-[10px] text-amber-300 mt-0.5">
                        {isLiveNow
                          ? 'DEADLINE PASSED · MATCHES IN PROGRESS'
                          : 'COMPLETED GAMEWEEK · READ-ONLY'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-amber-300 bg-amber-500/10 px-2 py-1 rounded-sm border border-amber-500/30 font-bold">
                      LOCKED
                    </span>
                  </div>

                  {/* Actual Gameweek Score & Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 bg-surface-elevated border border-border-hard rounded-sm">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary block">
                        GW{gameweek} {isLiveNow ? 'LIVE' : 'FINAL'} POINTS
                      </span>
                      <span className="font-mono text-lg font-extrabold text-accent-gain tabular-nums">
                        {squad.entry_history?.points ?? squad.actual_lineup?.total_points ?? 0} pts
                      </span>
                    </div>

                    <div className="p-3 bg-surface-elevated border border-border-hard rounded-sm">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary block">
                        ACTIVE CHIP
                      </span>
                      <span className="font-mono text-sm font-bold text-accent-cyan uppercase">
                        {squad.active_chip ? squad.active_chip : 'NONE'}
                      </span>
                    </div>

                    <div className="p-3 bg-surface-elevated border border-border-hard rounded-sm">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary block">
                        BENCH POINTS
                      </span>
                      <span className="font-mono text-sm font-bold text-text-primary tabular-nums">
                        {squad.actual_lineup?.bench_points ?? 0} pts
                      </span>
                    </div>

                    <div className="p-3 bg-surface-elevated border border-border-hard rounded-sm">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary block">
                        TRANSFERS MADE
                      </span>
                      <span className="font-mono text-sm font-bold text-text-primary tabular-nums">
                        {squad.entry_history?.event_transfers ?? 0}
                        {(squad.entry_history?.event_transfers_cost ?? 0) > 0
                          ? ` (-${squad.entry_history.event_transfers_cost} pts)`
                          : ''}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-surface-canvas border border-border-hard rounded-sm">
                    <p className="font-mono text-[11px] text-text-secondary leading-relaxed">
                      {isLiveNow
                        ? `Gameweek ${gameweek} is currently underway. Since the deadline has passed, no transfers or substitutions are suggested for GW${gameweek}. All changes you make now apply to Gameweek ${nextGw}.`
                        : `Viewing your exact historical squad and points from Gameweek ${gameweek}. Transfer and substitution suggestions are disabled for completed gameweeks.`}
                    </p>
                  </div>

                  <button
                    onClick={() => onSelectGameweek(nextGw)}
                    className="w-full font-mono text-xs font-bold uppercase tracking-widest text-black bg-accent-gain px-4 py-3 hover:opacity-90 transition-opacity rounded-sm"
                    style={{ minHeight: '44px' }}
                  >
                    PLAN TRANSFERS FOR NEXT GAMEWEEK (GW{nextGw}) →
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4 flex-1">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-hard">
                      <div className="flex flex-col">
                        <h2 className="font-heading text-xs font-bold uppercase tracking-widest text-text-primary">
                          GW{gameweek} TRANSFERS
                        </h2>
                        <span className="font-mono text-[10px] text-accent-cyan mt-0.5">
                          STRATEGY: {selectedChip.toUpperCase()} ({horizonLabel})
                        </span>
                      </div>

                      <span className="font-mono text-[10px] text-text-secondary bg-surface-elevated px-2 py-1 rounded-sm border border-border-hard">
                        {selectedChip === 'wildcard' || selectedChip === 'freehit'
                          ? 'UNLIMITED FREE'
                          : `${freeTransfers} FREE TRANSFER${freeTransfers !== 1 ? 'S' : ''}`}
                      </span>
                    </div>

                    <TransferPanel
                      transfers={displayTransfers}
                      freeTransfers={
                        selectedChip === 'wildcard' || selectedChip === 'freehit'
                          ? 15
                          : freeTransfers
                      }
                      gameweek={gameweek}
                      horizon={horizon}
                    />
                  </div>

                  {/* Re-solve & Action Buttons */}
                  <div className="p-4 border-t border-border-hard flex gap-2">
                    <button
                      onClick={onRefresh}
                      disabled={isLoading}
                      className="flex-1 font-mono text-[11px] font-bold uppercase tracking-widest text-text-primary bg-surface-elevated border border-border-hard px-4 py-3 hover:border-accent-cyan hover:text-accent-cyan transition-colors disabled:opacity-40 rounded-sm"
                      style={{ minHeight: '44px' }}
                    >
                      {isLoading ? 'SOLVING…' : `↻ RE-OPTIMIZE FOR GW${gameweek} (${horizonLabel})`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
