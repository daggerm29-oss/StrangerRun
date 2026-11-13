'use client'

import useSWR from 'swr'
import { ArrowLeft, Crown, Loader2 } from 'lucide-react'
import { fetchLeaderboard } from '@/lib/game/leaderboard-client'
import { tg } from '@/lib/game/telegram'

export function LeaderboardScreen({ onClose }: { onClose: () => void }) {
  const { data, error, isLoading } = useSWR('leaderboard', fetchLeaderboard, { revalidateOnFocus: true })
  const myId = String(tg()?.initDataUnsafe?.user?.id ?? '')

  return (
    <div className="absolute inset-0 flex flex-col safe-top safe-bottom bg-black/90 px-5 animate-in fade-in duration-300">
      <header className="flex items-center gap-3 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div>
          <h2 className="st-title font-serif text-2xl font-bold leading-none">LEADERBOARD</h2>
          <p className="mt-1 font-sans text-xs uppercase tracking-widest text-white/60">
            {data?.scope === 'group' ? 'This group' : 'All survivors'}
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-2 overflow-y-auto pb-4" aria-live="polite">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 py-10 font-sans text-sm uppercase tracking-widest text-white/70">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading
          </p>
        )}
        {error && (
          <p className="py-10 text-center font-sans text-sm uppercase tracking-widest text-blood">Could not load scores</p>
        )}
        {data && data.entries.length === 0 && (
          <p className="py-10 text-center font-sans text-sm uppercase tracking-widest text-white/70">
            No scores yet. Be the first to run.
          </p>
        )}
        {data?.entries.map((e) => {
          const mine = e.userId === myId
          return (
            <div
              key={e.userId}
              className={`flex items-center gap-3 rounded-md border px-3 py-2.5 font-sans ${
                mine ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-black/50'
              }`}
            >
              <span className="flex w-7 justify-center text-lg font-bold text-white/80">
                {e.rank === 1 ? <Crown className="size-5 text-gold" aria-label="First place" /> : e.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold uppercase tracking-wide text-white">{e.name}</p>
                <p className="text-xs uppercase tracking-wider text-white/50">{(e.distance / 1000).toFixed(2)} km</p>
              </div>
              <span className="text-xl font-semibold tabular-nums text-white">{e.score.toLocaleString('en-US')}</span>
            </div>
          )
        })}
      </div>

      {data?.me && data.me.rank > data.entries.length && (
        <p className="mx-auto w-full max-w-sm rounded-md border border-gold/60 bg-gold/10 px-3 py-2.5 text-center font-sans text-sm uppercase tracking-widest text-gold">
          You are #{data.me.rank} with {data.me.score.toLocaleString('en-US')}
        </p>
      )}
    </div>
  )
}
