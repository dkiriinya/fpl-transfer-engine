'use client'

import { useState } from 'react'
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
  result: OptimizeResponse
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
    (result.chip_active as ChipType) || 'none'
  )

  const bankBalance = squad.entry_history.bank / 10
  const eventTransfers = squad.entry_history.event_transfers ?? 0
  const freeTransfers = Math.max(1, 2 - eventTransfers)

  const activeEval =
    result.chip_evaluations?.find((e) => e.chip_id === selectedChip) ?? null

  const displayTransfers = activeEval ? activeEval.transfers : result.transfers
  const displayStartingXi = activeEval ? activeEval.starting_xi : result.starting_xi || []
  const displayBench = activeEval ? activeEval.bench : result.bench || []
  const displayTransfersMade = activeEval ? activeEval.transfers_made : result.transfers_made
  const displayNetPoints = activeEval ? activeEval.net_points : result.net_points
  const displayTotalProj = activeEval ? activeEval.projected_points : result.total_projected_points
  const displayHitPenalty = activeEval ? activeEval.hit_penalty : result.hit_penalty
  const displayBankRemaining = activeEval ? activeEval.bank_remaining : result.bank_remaining

  const transfersOutIds = displayTransfers.map((t) => t.out.player_id)
  const transfersInIds = displayTransfers.map((t) => t.in_.player_id)

  const activeMetricsResult: OptimizeResponse = {
    ...result,
    chip_active: selectedChip,
    transfers_made: displayTransfersMade,
    net_points: displayNetPoints,
    total_projected_points: displayTotalProj,
    hit_penalty: displayHitPenalty,
    bank_remaining: displayBankRemaining,
    transfers: displayTransfers,
  }

  const horizonLabel =
    horizon === 1 ? '1 GW' : `${horizon} GWs`

  return (
    <div className="flex flex-col min-h-screen bg-surface-canvas text-text-primary">
      <HeaderBar
        teamId={teamId}
        gameweek={gameweek}
        horizon={horizon}
        bankBalance={bankBalance}
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
          {/* Top: Chip Recommendation Engine Deck */}
          {result.chip_evaluations && result.chip_evaluations.length > 0 && (
            <ChipDeck
              evaluations={result.chip_evaluations}
              activeChip={selectedChip}
              gameweek={gameweek}
              horizon={horizon}
              onSelectChip={setSelectedChip}
            />
          )}

          {/* Metrics summary bar */}
          <MetricsBar result={activeMetricsResult} gameweek={gameweek} horizon={horizon} />

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
              />
            </div>

            {/* Right column: Transfer Recommendations & Actions */}
            <div className="order-1 lg:order-2 flex flex-col border border-border-hard bg-surface-card rounded-md">
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
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
