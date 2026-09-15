'use client'

import { useState } from 'react'
import type { PlayerRec } from '@/lib/types'

interface PlayerPitchCardProps {
  player: PlayerRec
  gameweek?: number
  photoCode?: string
  isTransferIn?: boolean
  isTransferOut?: boolean
  isBench?: boolean
  benchLabel?: string
}

const POSITION_COLORS: Record<string, string> = {
  GKP: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  DEF: 'text-sky-400 bg-sky-400/10 border-sky-400/30',
  MID: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  FWD: 'text-rose-400 bg-rose-400/10 border-rose-400/30',
}

export default function PlayerPitchCard({
  player,
  gameweek,
  photoCode,
  isTransferIn = false,
  isTransferOut = false,
  isBench = false,
  benchLabel,
}: PlayerPitchCardProps) {
  const [imgError, setImgError] = useState(false)

  const resolvedCode = photoCode || player.photo || String(player.player_id)
  const photoUrl = `https://resources.premierleague.com/premierleague/photos/players/250x250/p${resolvedCode}.png`
  const initials = player.web_name.slice(0, 3).toUpperCase()

  return (
    <div
      className={`group relative flex flex-col items-center select-none transition-all duration-200 ${
        isTransferOut ? 'opacity-40 grayscale-[40%]' : 'opacity-100 hover:scale-105'
      }`}
      style={{ width: isBench ? '74px' : '82px' }}
      title={`${player.web_name} (${player.team}) - ${gameweek ? `GW${gameweek}` : 'GW'} Projected: ${player.projected_points.toFixed(1)} pts`}
    >
      {/* Bench role pill */}
      {isBench && benchLabel && (
        <span className="font-mono text-[8px] font-bold uppercase tracking-wider text-text-secondary bg-surface-canvas/80 border border-border-hard px-1.5 py-0.2 mb-1 rounded-sm">
          {benchLabel}
        </span>
      )}

      {/* Avatar portrait container */}
      <div className="relative">
        {/* Glowing aura for transfers in / captain */}
        {isTransferIn && (
          <div className="absolute -inset-1 rounded-full bg-accent-gain/30 blur-sm animate-pulse" />
        )}
        {player.is_captain && (
          <div className="absolute -inset-1 rounded-full bg-amber-400/30 blur-sm" />
        )}

        {/* Player photo circle / cutout */}
        <div
          className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-950 shadow-lg ${
            isTransferIn
              ? 'border-accent-gain ring-2 ring-accent-gain/40'
              : isTransferOut
              ? 'border-accent-loss'
              : player.is_captain
              ? 'border-amber-400 ring-1 ring-amber-400/50'
              : 'border-slate-300/40 group-hover:border-slate-200'
          }`}
        >
          {!imgError ? (
            <img
              src={photoUrl}
              alt={player.web_name}
              className="w-full h-full object-cover object-top scale-110 pt-1"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full bg-slate-900 text-slate-400">
              <span className="font-mono text-[11px] font-bold">{initials}</span>
              <span className="text-[8px] text-slate-500">{player.team}</span>
            </div>
          )}
        </div>

        {/* Captain / Vice Captain Badge */}
        {player.is_captain && (
          <div className="absolute -top-1 -right-1 bg-amber-400 text-black font-mono font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-md border border-amber-200">
            C
          </div>
        )}
        {player.is_vice_captain && !player.is_captain && (
          <div className="absolute -top-1 -right-1 bg-slate-200 text-black font-mono font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-md border border-white">
            V
          </div>
        )}

        {/* Multiplier badge for Triple Captain */}
        {player.multiplier === 3 && (
          <div className="absolute -top-1 -left-1 bg-accent-cyan text-black font-mono font-extrabold text-[9px] px-1 h-4 rounded flex items-center justify-center shadow border border-cyan-200">
            3x
          </div>
        )}

        {/* Transfer IN / OUT pill badge */}
        {isTransferIn && (
          <div className="absolute -bottom-1 -right-1 bg-accent-gain text-black font-mono font-extrabold text-[8px] px-1 py-0.2 rounded shadow">
            +IN
          </div>
        )}
        {isTransferOut && (
          <div className="absolute -bottom-1 -right-1 bg-accent-loss text-white font-mono font-bold text-[8px] px-1 py-0.2 rounded shadow">
            OUT
          </div>
        )}
      </div>

      {/* Info labels container */}
      <div className="mt-1 flex flex-col items-center w-full">
        {/* Name banner */}
        <div className="w-full bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded-sm border border-white/10 shadow text-center">
          <p className="font-heading text-[11px] font-bold text-white truncate leading-tight tracking-tight">
            {player.web_name}
          </p>
        </div>

        {/* Points & Metadata */}
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className={`font-mono text-[9px] font-bold px-1 rounded-sm border ${
              POSITION_COLORS[player.position] ?? 'text-slate-300'
            }`}
          >
            {player.position}
          </span>
          <span className="font-mono text-[9px] text-slate-300 bg-black/60 px-1 rounded-sm border border-white/10">
            {player.team}
          </span>
          <span className="font-mono text-[10px] font-extrabold text-accent-gain bg-black/90 px-1.5 py-0.2 rounded-sm border border-accent-gain/30 tabular-nums">
            {player.projected_points.toFixed(1)}
          </span>
        </div>

        {/* Price */}
        <div className="font-mono text-[8px] text-slate-300/80 mt-0.5 tabular-nums">
          £{player.price.toFixed(1)}m
        </div>
      </div>
    </div>
  )
}
