'use client'

import type { ChipEvaluation, ChipType } from '@/lib/types'

interface ChipDeckProps {
  evaluations: ChipEvaluation[]
  activeChip: ChipType
  gameweek: number
  horizon: number
  onSelectChip: (chip: ChipType) => void
}

const CHIP_ICONS: Record<string, string> = {
  none: '⚡',
  wildcard: '🃏',
  freehit: '🪄',
  benchboost: '🚀',
  triplecaptain: '👑',
}

const VERDICT_STYLES: Record<string, string> = {
  RECOMMENDED: 'bg-accent-gain/20 text-accent-gain border-accent-gain/50 shadow-hard-gain',
  CONSIDER: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/40',
  'HOLD / SAVE': 'bg-amber-400/10 text-amber-300 border-amber-400/30',
  STANDARD: 'bg-slate-800 text-slate-300 border-border-hard',
}

export default function ChipDeck({
  evaluations,
  activeChip,
  gameweek,
  horizon,
  onSelectChip,
}: ChipDeckProps) {
  if (!evaluations || evaluations.length === 0) return null

  const currentEval = evaluations.find((e) => e.chip_id === activeChip) ?? evaluations[0]
  const recommendedChip = evaluations.find(
    (e) => e.chip_id !== 'none' && e.verdict === 'RECOMMENDED'
  )

  const horizonSpan =
    horizon === 1
      ? `GW${gameweek} (1 GW)`
      : `GW${gameweek} – GW${gameweek + horizon - 1} (${horizon} GWs)`

  const isFirstHalf = gameweek <= 19
  const remainingInHalf = isFirstHalf ? 19 - gameweek + 1 : 38 - gameweek + 1

  return (
    <div className="flex flex-col gap-3 border border-border-hard bg-surface-card p-4 rounded-md">
      {/* Deck Header & AI Callout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-hard">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-heading text-xs font-bold uppercase tracking-widest text-text-primary">
            CHIP STRATEGY ENGINE
          </span>
          <span className="font-mono text-[9px] bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 px-1.5 py-0.5 rounded-sm">
            HORIZON: {horizonSpan}
          </span>
          <span
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border ${
              isFirstHalf
                ? remainingInHalf <= 5
                  ? 'bg-accent-loss/15 text-accent-loss border-accent-loss/30 animate-pulse font-bold'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
            }`}
          >
            {isFirstHalf
              ? `SET 1 ACTIVE · ${remainingInHalf} GWs TO GW19 DEADLINE`
              : `SET 2 ACTIVE · GW20–GW38`}
          </span>
        </div>

        {recommendedChip ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-accent-gain">
            <span>RECOMMENDED:</span>
            <span className="font-bold underline underline-offset-2">
              {recommendedChip.chip_name.toUpperCase()} (+{recommendedChip.points_gain_vs_standard.toFixed(1)} PTS)
            </span>
          </div>
        ) : (
          <div className="font-mono text-[11px] text-text-secondary">
            RECOMMENDED: <span className="text-white font-semibold">STANDARD TRANSFERS</span> (HOLD CHIPS)
          </div>
        )}
      </div>

      {/* Chip Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {evaluations.map((ev) => {
          const isUsed = ev.verdict.startsWith('USED')
          const isSelected = ev.chip_id === activeChip && !isUsed
          const icon = isUsed ? '🔒' : (CHIP_ICONS[ev.chip_id] ?? '⚽')
          const verdictClass = isUsed
            ? 'bg-slate-900/90 text-slate-500 border-slate-700/60'
            : (VERDICT_STYLES[ev.verdict] ?? 'bg-slate-800 text-slate-300 border-border-hard')
          const gain = ev.points_gain_vs_standard

          return (
            <button
              key={ev.chip_id}
              disabled={isUsed}
              onClick={() => {
                if (!isUsed) onSelectChip(ev.chip_id as ChipType)
              }}
              title={isUsed ? ev.reasoning : ev.description}
              className={`relative flex flex-col justify-between p-3 text-left rounded-sm border transition-all duration-150 ${
                isUsed
                  ? 'bg-surface-canvas/50 border-border-hard/50 opacity-50 cursor-not-allowed'
                  : isSelected
                  ? 'bg-surface-elevated border-accent-cyan ring-1 ring-accent-cyan shadow-md'
                  : 'bg-surface-card hover:bg-surface-elevated/70 border-border-hard hover:border-slate-600'
              }`}
            >
              {/* Top Row: Icon + Name */}
              <div className="flex items-center justify-between gap-1 w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{icon}</span>
                  <span className={`font-heading text-xs font-bold truncate ${isUsed ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                    {ev.chip_name}
                  </span>
                </div>
              </div>

              {/* Middle Row: Net Points & Delta or Reset Notice */}
              <div className="my-2">
                {isUsed ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] font-bold text-slate-400 uppercase">
                      CHIP EXHAUSTED
                    </span>
                    <span className="font-mono text-[9px] text-slate-500">
                      {isFirstHalf ? 'Resets after GW19' : 'Used in Set 2'}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-sm font-extrabold text-white tabular-nums">
                        {ev.net_points.toFixed(1)}
                      </span>
                      <span className="font-mono text-[9px] text-text-secondary">
                        {horizon > 1 ? `pts (${horizon}GW)` : `GW${gameweek} pts`}
                      </span>
                    </div>

                    {ev.chip_id !== 'none' && (
                      <div className="font-mono text-[10px] font-bold tabular-nums mt-0.5">
                        {gain > 0 ? (
                          <span className="text-accent-gain">+{gain.toFixed(1)} vs standard</span>
                        ) : gain === 0 ? (
                          <span className="text-text-muted">0.0 vs standard</span>
                        ) : (
                          <span className="text-accent-loss">{gain.toFixed(1)} vs standard</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Bottom Row: Verdict Pill */}
              <div className="w-full mt-1">
                <span
                  className={`inline-block w-full text-center font-mono text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${verdictClass}`}
                >
                  {isUsed ? `${ev.verdict} · RESETS GW20` : ev.verdict}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Active Chip Tactical Analysis Callout */}
      {currentEval && (
        <div className="mt-1 p-3 bg-surface-elevated/90 border border-border-hard rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="text-lg mt-0.5">{CHIP_ICONS[currentEval.chip_id]}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading text-xs font-bold text-white">
                  {currentEval.chip_name} · {horizonSpan} Forecast
                </span>
                <span
                  className={`font-mono text-[8px] font-extrabold px-1.5 py-0.2 rounded-sm border ${
                    VERDICT_STYLES[currentEval.verdict] ?? ''
                  }`}
                >
                  {currentEval.verdict}
                </span>
              </div>
              <p className="font-mono text-[11px] text-slate-300 mt-1 leading-relaxed">
                {currentEval.reasoning}
              </p>
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 border-t sm:border-t-0 sm:border-l border-border-hard pt-2 sm:pt-0 sm:pl-4 min-w-[140px]">
            <span className="font-mono text-[9px] text-text-secondary uppercase">
              STRATEGIC TRANSFERS
            </span>
            <span className="font-mono text-xs font-bold text-accent-cyan">
              {currentEval.transfers_made} Transfer{currentEval.transfers_made !== 1 ? 's' : ''}
            </span>
            {currentEval.hit_penalty > 0 && (
              <span className="font-mono text-[10px] text-accent-loss">
                -{currentEval.hit_penalty} pts hit
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
