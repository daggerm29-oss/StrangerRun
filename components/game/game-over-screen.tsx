import { Home, RotateCcw, Send } from 'lucide-react'
import type { GameResult } from '@/lib/game/engine'
import { shareScore } from '@/lib/game/telegram'

export function GameOverScreen({
  result,
  best,
  isNewBest,
  onRetry,
  onMenu,
}: {
  result: GameResult
  best: number
  isNewBest: boolean
  onRetry: () => void
  onMenu: () => void
}) {
  const km = result.distance >= 1000 ? `${(result.distance / 1000).toFixed(2)} km` : `${Math.floor(result.distance)} m`
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 safe-top safe-bottom bg-black/75 px-6 animate-in fade-in duration-500">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-sans text-sm uppercase tracking-[0.4em] text-white/70">The Demogorgon</p>
        <h2 className="st-title font-serif text-5xl font-bold">GOT YOU</h2>
        {isNewBest && (
          <p className="mt-1 rounded-full border border-gold/60 px-3 py-1 font-sans text-sm uppercase tracking-widest text-gold animate-flicker">
            New best score
          </p>
        )}
      </div>

      <dl className="grid w-full max-w-sm grid-cols-2 gap-2 font-sans uppercase">
        <Stat label="Score" value={result.score.toLocaleString('en-US')} wide />
        <Stat label="Distance" value={km} />
        <Stat label="Coins" value={String(result.coins)} />
        <Stat label="Best" value={best.toLocaleString('en-US')} wide />
      </dl>

      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-blood bg-blood/90 py-3.5 font-sans text-xl font-bold uppercase tracking-[0.2em] text-white shadow-[0_0_30px_rgba(229,9,20,0.6)] active:scale-[0.98]"
        >
          <RotateCcw className="size-5" aria-hidden="true" /> Run again
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => shareScore(result.score, result.distance)}
            className="flex items-center justify-center gap-2 rounded-md border border-neon/50 bg-black/60 py-3 font-sans text-base uppercase tracking-widest text-neon active:scale-[0.98]"
          >
            <Send className="size-4" aria-hidden="true" /> Share
          </button>
          <button
            type="button"
            onClick={onMenu}
            className="flex items-center justify-center gap-2 rounded-md border border-white/20 bg-black/60 py-3 font-sans text-base uppercase tracking-widest text-white active:scale-[0.98]"
          >
            <Home className="size-4" aria-hidden="true" /> Menu
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-white/10 bg-black/50 px-3 py-2 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-xs tracking-widest text-white/60">{label}</dt>
      <dd className="text-2xl font-semibold text-white">{value}</dd>
    </div>
  )
}
