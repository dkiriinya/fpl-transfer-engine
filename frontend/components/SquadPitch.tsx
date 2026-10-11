'use client'

import type { PlayerRec } from '@/lib/types'
import PlayerPitchCard from './PlayerPitchCard'

interface SquadPitchProps {
  startingXi: PlayerRec[]
  bench: PlayerRec[]
  transfersOut: number[]
  transfersIn: number[]
  gameweek: number
  horizon: number
  playerPhotos?: Record<number, string>
  headerTag?: string
}

export default function SquadPitch({
  startingXi,
  bench,
  transfersOut,
  transfersIn,
  gameweek,
  horizon,
  playerPhotos = {},
  headerTag,
}: SquadPitchProps) {
  const gkps = startingXi.filter((p) => p.position === 'GKP')
  const defs = startingXi.filter((p) => p.position === 'DEF')
  const mids = startingXi.filter((p) => p.position === 'MID')
  const fwds = startingXi.filter((p) => p.position === 'FWD')

  const formationStr = `${defs.length}-${mids.length}-${fwds.length}`
  const benchLabels = ['GK SUB', 'SUB 1', 'SUB 2', 'SUB 3']

  const horizonSpan =
    headerTag ??
    (horizon === 1
      ? `GW${gameweek} PROJECTIONS (1 GW)`
      : `GW${gameweek}–GW${gameweek + horizon - 1} PROJECTIONS (${horizon} GWs)`)

  return (
    <div className="flex flex-col gap-3">
      {/* Formation & Gameweek Horizon Header Tag */}
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent-gain animate-pulse" />
          <span className="font-heading text-xs font-semibold uppercase tracking-widest text-text-primary">
            TACTICAL PITCH VIEW
          </span>
          <span className="font-mono text-[9px] text-text-secondary bg-surface-card border border-border-hard px-1.5 py-0.5 rounded-sm">
            {horizonSpan}
          </span>
        </div>
        <span className="font-mono text-[10px] text-accent-cyan font-bold bg-surface-card border border-border-hard px-2 py-0.5 rounded-sm">
          FORMATION: {formationStr}
        </span>
      </div>

      {/* Lush Green Pitch Canvas */}
      <div className="relative rounded-md overflow-hidden border border-emerald-700/60 shadow-2xl bg-emerald-950">
        {/* Lawn Mowing Stripes & Grass Gradient Texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg, #14532d 0px, #14532d 48px, #15803d 48px, #15803d 96px)',
          }}
        />

        {/* Soft Radial Vignette for Lighting Depth */}
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(22, 101, 52, 0.4) 0%, rgba(2, 44, 34, 0.85) 100%)',
          }}
        />

        {/* Crisp Technical Pitch Markings (SVG overlay) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-70"
          viewBox="0 0 500 680"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Boundary Line */}
          <rect
            x="16"
            y="16"
            width="468"
            height="648"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />

          {/* Halfway Line */}
          <line
            x1="16"
            y1="340"
            x2="484"
            y2="340"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />

          {/* Center Circle & Spot */}
          <circle
            cx="250"
            cy="340"
            r="60"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />
          <circle cx="250" cy="340" r="3" fill="rgba(255,255,255,0.7)" />

          {/* Top Penalty Area (18-yard box) */}
          <rect
            x="130"
            y="16"
            width="240"
            height="110"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />
          {/* Top Goal Box (6-yard box) */}
          <rect
            x="190"
            y="16"
            width="120"
            height="40"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />
          {/* Top Penalty Spot & Arc */}
          <circle cx="250" cy="88" r="3" fill="rgba(255,255,255,0.7)" />
          <path
            d="M 210,126 A 48,48 0 0,0 290,126"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />

          {/* Bottom Penalty Area (18-yard box) */}
          <rect
            x="130"
            y="554"
            width="240"
            height="110"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />
          {/* Bottom Goal Box (6-yard box) */}
          <rect
            x="190"
            y="624"
            width="120"
            height="40"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />
          {/* Bottom Penalty Spot & Arc */}
          <circle cx="250" cy="592" r="3" fill="rgba(255,255,255,0.7)" />
          <path
            d="M 210,554 A 48,48 0 0,1 290,554"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
          />

          {/* Corner Arcs */}
          <path d="M 16,36 A 20,20 0 0,0 36,16" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
          <path d="M 464,16 A 20,20 0 0,0 484,36" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
          <path d="M 16,644 A 20,20 0 0,1 36,664" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
          <path d="M 464,664 A 20,20 0 0,1 484,644" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
        </svg>

        {/* Tactical Player Rows Layer */}
        <div className="relative z-10 flex flex-col justify-between py-6 px-3 min-h-[520px] gap-4">
          {/* 1. Goalkeeper Row */}
          <div className="flex justify-center items-center">
            {gkps.map((player) => (
              <PlayerPitchCard
                key={player.player_id}
                player={player}
                gameweek={gameweek}
                photoCode={playerPhotos[player.player_id]}
                isTransferIn={transfersIn.includes(player.player_id)}
                isTransferOut={transfersOut.includes(player.player_id)}
              />
            ))}
          </div>

          {/* 2. Defenders Row */}
          <div className="flex justify-around items-center flex-wrap gap-1">
            {defs.map((player) => (
              <PlayerPitchCard
                key={player.player_id}
                player={player}
                gameweek={gameweek}
                photoCode={playerPhotos[player.player_id]}
                isTransferIn={transfersIn.includes(player.player_id)}
                isTransferOut={transfersOut.includes(player.player_id)}
              />
            ))}
          </div>

          {/* 3. Midfielders Row */}
          <div className="flex justify-around items-center flex-wrap gap-1">
            {mids.map((player) => (
              <PlayerPitchCard
                key={player.player_id}
                player={player}
                gameweek={gameweek}
                photoCode={playerPhotos[player.player_id]}
                isTransferIn={transfersIn.includes(player.player_id)}
                isTransferOut={transfersOut.includes(player.player_id)}
              />
            ))}
          </div>

          {/* 4. Forwards Row */}
          <div className="flex justify-around items-center flex-wrap gap-1">
            {fwds.map((player) => (
              <PlayerPitchCard
                key={player.player_id}
                player={player}
                gameweek={gameweek}
                photoCode={playerPhotos[player.player_id]}
                isTransferIn={transfersIn.includes(player.player_id)}
                isTransferOut={transfersOut.includes(player.player_id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Substitutes Bench (Dugout) */}
      <div className="border border-border-hard bg-surface-card p-3 rounded-md">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <span className="font-heading text-[10px] font-bold uppercase tracking-widest text-text-secondary">
              SUBSTITUTES BENCH
            </span>
          </div>
          <span className="font-mono text-[9px] text-text-muted">
            4 PLAYERS · GW{gameweek} SUBS
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 justify-items-center bg-surface-elevated/70 border border-border-hard/70 p-2.5 rounded-sm">
          {bench.map((player, idx) => (
            <PlayerPitchCard
              key={player.player_id}
              player={player}
              gameweek={gameweek}
              photoCode={playerPhotos[player.player_id]}
              isTransferIn={transfersIn.includes(player.player_id)}
              isTransferOut={transfersOut.includes(player.player_id)}
              isBench={true}
              benchLabel={benchLabels[idx] ?? `SUB ${idx}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
