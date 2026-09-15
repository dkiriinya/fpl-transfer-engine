import type { OptimizeResponse } from '@/lib/types'

interface MetricProps {
  label: string
  value: string
  sublabel?: string
  color?: string
}

function Metric({ label, value, sublabel, color = 'text-text-primary' }: MetricProps) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2 border-r border-border-hard last:border-r-0">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary">
          {label}
        </span>
        {sublabel && (
          <span className="font-mono text-[8px] text-accent-cyan bg-accent-cyan/10 px-1 py-0.2 rounded-sm border border-accent-cyan/20">
            {sublabel}
          </span>
        )}
      </div>
      <span className={`font-mono text-sm font-bold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  )
}

interface MetricsBarProps {
  result: OptimizeResponse
  gameweek: number
  horizon: number
}

export default function MetricsBar({ result, gameweek, horizon }: MetricsBarProps) {
  const horizonLabel =
    horizon === 1
      ? `GW${gameweek} (1 GW)`
      : `GW${gameweek} – GW${gameweek + horizon - 1} (${horizon} GWs)`

  return (
    <div className="flex flex-wrap border-b border-border-hard bg-surface-card rounded-md">
      <Metric
        label="EVALUATION HORIZON"
        value={horizonLabel}
        color="text-accent-cyan"
      />
      <Metric
        label="NET EXPECTED PTS"
        value={result.net_points.toFixed(1)}
        sublabel={`${horizon} GW${horizon > 1 ? 's' : ''}`}
        color="text-accent-gain"
      />
      <Metric
        label="TOTAL EXP PTS"
        value={result.total_projected_points.toFixed(1)}
        color="text-text-primary"
      />
      <Metric
        label="TRANSFERS"
        value={String(result.transfers_made)}
        color="text-accent-cyan"
      />
      <Metric
        label="HIT PENALTY"
        value={result.hit_penalty > 0 ? `-${result.hit_penalty} pts` : '0 pts'}
        color={result.hit_penalty > 0 ? 'text-accent-loss' : 'text-text-secondary'}
      />
      <Metric
        label="REMAINING BANK"
        value={`£${result.bank_remaining.toFixed(1)}m`}
        color="text-accent-cyan"
      />
      <Metric
        label="SOLVER STATUS"
        value={result.status.toUpperCase()}
        color={result.status === 'optimal' ? 'text-accent-gain' : 'text-yellow-400'}
      />
    </div>
  )
}
