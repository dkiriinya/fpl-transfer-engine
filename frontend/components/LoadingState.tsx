export default function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 bg-surface-canvas">
      {/* Label */}
      <div className="font-mono text-xs uppercase tracking-widest text-text-secondary animate-pulse">
        RUNNING MILP SOLVER…
      </div>

      {/* Scan bar */}
      <div className="w-64 h-px bg-border-hard relative overflow-hidden">
        <div className="absolute inset-y-0 w-1/3 bg-accent-cyan animate-scan" />
      </div>

      {/* Sub-label */}
      <div className="font-mono text-[10px] text-text-muted uppercase tracking-widest">
        OPTIMISING SQUAD — CBC SOLVER ACTIVE
      </div>
    </div>
  )
}