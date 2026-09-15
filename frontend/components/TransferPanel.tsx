import type { TransferDelta } from '@/lib/types'
import PlayerChip from './PlayerChip'

interface TransferPanelProps {
  transfers: TransferDelta[]
  freeTransfers: number
  gameweek?: number
  horizon?: number
}

export default function TransferPanel({
  transfers,
  freeTransfers,
  gameweek,
  horizon = 1,
}: TransferPanelProps) {
  if (transfers.length === 0) {
    return (
      <div className="border border-border-hard bg-surface-card p-8 flex flex-col items-center justify-center gap-1 rounded-sm">
        <span className="font-mono text-xs text-text-primary font-bold uppercase tracking-widest">
          NO TRANSFERS RECOMMENDED
        </span>
        <span className="font-mono text-[10px] text-text-secondary">
          {gameweek
            ? `Current squad is optimal for GW${gameweek} over ${horizon} GW(s). Roll your free transfer.`
            : 'Hold your free transfer.'}
        </span>
      </div>
    )
  }

  const deltaLabel = horizon > 1 ? `${horizon}GW Δ` : gameweek ? `GW${gameweek} Δ` : 'Δ PTS'

  return (
    <div className="border border-border-hard bg-surface-card rounded-sm overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_60px_1fr] border-b border-border-hard bg-surface-elevated/50">
        <div className="px-3 py-2 border-r border-border-hard">
          <span className="font-mono text-[10px] uppercase tracking-widest text-accent-loss font-bold">
            ← OUT
          </span>
        </div>
        <div className="px-1 py-2 border-r border-border-hard flex items-center justify-center">
          <span className="font-mono text-[9px] text-text-secondary font-bold">
            {deltaLabel}
          </span>
        </div>
        <div className="px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-accent-gain font-bold">
            IN →
          </span>
        </div>
      </div>

      {/* Transfer rows */}
      {transfers.map((transfer, idx) => {
        const isHit = idx >= freeTransfers
        return (
          <div
            key={idx}
            className={`grid grid-cols-[1fr_60px_1fr] border-b border-border-hard last:border-b-0 ${
              isHit ? 'bg-accent-loss/[0.04]' : ''
            }`}
          >
            {/* OUT */}
            <div className="p-2.5 border-r border-border-hard">
              <PlayerChip player={transfer.out} highlight="loss" />
            </div>

            {/* Delta */}
            <div className="flex flex-col items-center justify-center px-1 gap-1 border-r border-border-hard">
              <span
                className={`font-mono text-[11px] font-bold tabular-nums leading-none ${
                  transfer.points_gain >= 0 ? 'text-accent-gain' : 'text-accent-loss'
                }`}
              >
                {transfer.points_gain >= 0 ? '+' : ''}{transfer.points_gain.toFixed(1)}
              </span>
              <span className="font-mono text-[8px] text-text-muted">
                {horizon > 1 ? `${horizon} GWs` : gameweek ? `GW${gameweek}` : 'pts'}
              </span>
              {isHit && (
                <span className="font-mono text-[8px] text-accent-loss uppercase font-bold bg-accent-loss/10 border border-accent-loss/30 px-1 rounded-sm leading-none">
                  -4pt hit
                </span>
              )}
            </div>

            {/* IN */}
            <div className="p-2.5">
              <PlayerChip player={transfer.in_} highlight="gain" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
