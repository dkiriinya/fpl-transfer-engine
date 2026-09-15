import type { PlayerRec } from '@/lib/types'

const POSITION_COLORS: Record<string, string> = {
  GKP: 'text-yellow-400',
  DEF: 'text-accent-cyan',
  MID: 'text-accent-gain',
  FWD: 'text-accent-loss',
}

interface PlayerChipProps {
  player: PlayerRec
  highlight?: 'gain' | 'loss' | null
  compact?: boolean
}

export default function PlayerChip({ player, highlight, compact = false }: PlayerChipProps) {
  const borderColor =
    highlight === 'gain'
      ? 'border-accent-gain'
      : highlight === 'loss'
      ? 'border-accent-loss'
      : 'border-border-hard'

  return (
    <div
      className={`bg-surface-elevated border ${borderColor} px-2 py-1.5 flex flex-col gap-0.5 ${compact ? '' : 'w-full'}`}
      style={{ minWidth: '72px' }}
    >
      <span
        className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${POSITION_COLORS[player.position] ?? 'text-text-secondary'}`}
      >
        {player.position}
      </span>
      <span className="font-heading text-xs font-semibold text-text-primary truncate leading-tight">
        {player.web_name}
      </span>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="font-mono text-[10px] text-text-secondary">
          {player.team}
        </span>
        <span className="font-mono text-[10px] font-bold text-accent-gain tabular-nums">
          {player.projected_points.toFixed(1)}
        </span>
      </div>
    </div>
  )
}