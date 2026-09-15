'use client'

interface HeaderBarProps {
  teamId: number
  gameweek: number
  horizon: number
  bankBalance: number
  events?: Array<{
    id: number
    name: string
    finished: boolean
    is_current: boolean
    is_next: boolean
  }>
  onSelectGameweek: (gw: number) => void
  onSelectHorizon: (h: number) => void
  onChangeTeam: () => void
  isLoading: boolean
}

export default function HeaderBar({
  teamId,
  gameweek,
  horizon,
  bankBalance,
  events = [],
  onSelectGameweek,
  onSelectHorizon,
  onChangeTeam,
  isLoading,
}: HeaderBarProps) {
  // Select a window of relevant gameweeks (e.g. GW3 to GW8)
  const displayGws = [3, 4, 5, 6, 7, 8]

  return (
    <header className="flex flex-col border-b border-border-hard bg-surface-card">
      {/* Upper Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b border-border-hard/60">
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm font-black tracking-wider text-white uppercase flex items-center gap-1.5">
              <span className="text-accent-cyan">⚡</span> FPL DECISION ENGINE
            </span>
          </div>

          <div className="hidden sm:block w-px h-6 bg-border-hard" />

          {/* Quick Stats */}
          <div className="flex items-center gap-4 sm:gap-5 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary">TEAM ID</span>
              <span className="font-mono text-xs font-semibold text-text-primary tabular-nums">{teamId}</span>
            </div>

            <div className="w-px h-5 bg-border-hard" />

            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary">IN BANK</span>
              <span className="font-mono text-xs text-accent-cyan tabular-nums font-bold">
                £{bankBalance.toFixed(1)}m
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {isLoading && (
            <span className="font-mono text-[10px] text-accent-cyan uppercase tracking-widest animate-pulse flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent-cyan animate-ping inline-block" />
              SOLVING GW{gameweek} ({horizon} GW{horizon > 1 ? 's' : ''})…
            </span>
          )}
          <button
            onClick={onChangeTeam}
            className="font-mono text-[10px] uppercase tracking-widest text-text-secondary border border-border-hard px-3 py-1.5 hover:border-accent-cyan hover:text-accent-cyan transition-colors rounded-sm"
            style={{ minHeight: '32px' }}
          >
            CHANGE TEAM
          </button>
        </div>
      </div>

      {/* Gameweek Navigator & Horizon Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-surface-elevated/40">
        {/* Gameweek Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary mr-2 hidden sm:inline">
            GAMEWEEK:
          </span>
          {displayGws.map((gwNum) => {
            const ev = events.find((e) => e.id === gwNum)
            const isFinished = ev?.finished || gwNum < 4
            const isTarget = gwNum === gameweek
            const isUpcoming = ev?.is_next || gwNum === 4

            return (
              <button
                key={gwNum}
                onClick={() => onSelectGameweek(gwNum)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-mono transition-all border ${
                  isTarget
                    ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan font-bold shadow-sm'
                    : isFinished
                    ? 'bg-surface-canvas text-text-muted border-border-hard hover:border-slate-600'
                    : 'bg-surface-card text-text-secondary border-border-hard hover:border-accent-cyan/50 hover:text-text-primary'
                }`}
              >
                <span>GW{gwNum}</span>
                {isFinished && (
                  <span className="text-[8px] bg-slate-800 text-text-muted px-1 rounded">Past</span>
                )}
                {isUpcoming && !isTarget && (
                  <span className="text-[8px] bg-accent-gain/20 text-accent-gain px-1 rounded">Active</span>
                )}
                {isTarget && (
                  <span className="text-[8px] bg-accent-cyan/20 text-accent-cyan px-1 rounded font-bold">Selected</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Multi-Gameweek Horizon Selector */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-secondary mr-1">
            PLANNING HORIZON:
          </span>
          {[
            { h: 1, label: '1 GW' },
            { h: 3, label: '3 GWs' },
            { h: 5, label: '5 GWs' },
          ].map(({ h, label }) => {
            const isActive = horizon === h
            return (
              <button
                key={h}
                onClick={() => onSelectHorizon(h)}
                className={`px-2.5 py-1 rounded-sm font-mono text-xs transition-all border ${
                  isActive
                    ? 'bg-accent-gain/20 text-accent-gain border-accent-gain font-bold shadow-sm'
                    : 'bg-surface-card text-text-secondary border-border-hard hover:border-accent-gain/50 hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
