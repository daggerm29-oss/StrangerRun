import { ArrowDown, ArrowLeftRight, ArrowUp, CornerUpRight, Trophy, Volume2, VolumeX } from 'lucide-react'
import { Logo } from './logo'

export function StartScreen({
  best,
  onStart,
  muted,
  onToggleMute,
}: {
  best: number
  onStart: () => void
  muted: boolean
  onToggleMute: () => void
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between safe-top safe-bottom px-6 bg-gradient-to-b from-black/70 via-transparent to-black/85">
      <div className="flex w-full justify-end">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white"
        >
          {muted ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />}
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 -mt-10">
        <Logo />
        <p className="font-sans text-sm uppercase tracking-[0.35em] text-white/80 animate-flicker">Escape the Upside Down</p>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-5">
        {best > 0 && (
          <p className="flex items-center gap-2 font-sans text-base uppercase tracking-widest text-gold hud-text">
            <Trophy className="size-4" aria-hidden="true" /> Best {best.toLocaleString('en-US')}
          </p>
        )}
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-md border-2 border-blood bg-blood/90 py-4 font-sans text-2xl font-bold uppercase tracking-[0.25em] text-white shadow-[0_0_30px_rgba(229,9,20,0.65)] active:scale-[0.98]"
        >
          Run
        </button>
        <ul className="grid w-full grid-cols-2 gap-2 font-sans text-xs uppercase tracking-wider text-white/80">
          <Hint icon={<ArrowLeftRight className="size-4" aria-hidden="true" />} text="Swipe to change lane" />
          <Hint icon={<CornerUpRight className="size-4" aria-hidden="true" />} text="Swipe at corners to turn" />
          <Hint icon={<ArrowUp className="size-4" aria-hidden="true" />} text="Swipe up — jump vines & rifts" />
          <Hint icon={<ArrowDown className="size-4" aria-hidden="true" />} text="Swipe down — slide under" />
        </ul>
      </div>
    </div>
  )
}

function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-white/10 bg-black/50 px-2.5 py-2">
      <span className="text-blood">{icon}</span>
      {text}
    </li>
  )
}
