'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

interface TeamSetupModalProps {
  onTeamSet: (teamId: number) => void
}

export default function TeamSetupModal({ onTeamSet }: TeamSetupModalProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const id = parseInt(input.trim(), 10)
    if (isNaN(id) || id <= 0) {
      setError('Enter a valid numeric FPL Team ID')
      return
    }
    localStorage.setItem('fpl_team_id', String(id))
    onTeamSet(id)
  }

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-[2px] z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-surface-card border border-border-hard p-8 focus:outline-none">
          <Dialog.Title className="font-heading text-xl font-semibold text-text-primary tracking-tight mb-1">
            FPL TRANSFER ENGINE
          </Dialog.Title>
          <Dialog.Description className="font-mono text-xs text-text-secondary mb-6 uppercase tracking-widest">
            ENTER TEAM ID TO INITIALISE
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="team-id"
                className="block font-mono text-xs text-text-secondary mb-2 uppercase tracking-widest"
              >
                FPL Team ID
              </label>
              <input
                id="team-id"
                type="text"
                inputMode="numeric"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setError(null)
                }}
                placeholder="e.g. 8796308"
                className="w-full bg-surface-elevated border border-border-hard px-3 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan transition-colors"
                style={{ minHeight: '44px' }}
                autoFocus
              />
              {error && (
                <p className="mt-2 font-mono text-xs text-accent-loss">{error}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-accent-cyan text-black font-heading font-semibold text-sm uppercase tracking-widest py-3 px-4 hover:opacity-90 transition-opacity"
              style={{ minHeight: '44px' }}
            >
              INITIALISE ENGINE
            </button>
          </form>

          <p className="mt-4 font-mono text-[10px] text-text-muted">
            Your Team ID is visible in the URL of your FPL profile page.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}