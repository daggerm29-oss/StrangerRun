import { Home, Play } from 'lucide-react'
import { Logo } from './logo'

export function PauseScreen({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-black/70 px-6 animate-in fade-in duration-200">
      <Logo size="sm" />
      <p className="font-sans text-lg uppercase tracking-[0.4em] text-white/80">Paused</p>
      <div className="flex w-full max-w-xs flex-col gap-2.5">
        <button
          type="button"
          onClick={onResume}
          className="flex items-center justify-center gap-2 rounded-md border-2 border-blood bg-blood/90 py-3.5 font-sans text-xl font-bold uppercase tracking-[0.2em] text-white active:scale-[0.98]"
        >
          <Play className="size-5" aria-hidden="true" /> Resume
        </button>
        <button
          type="button"
          onClick={onQuit}
          className="flex items-center justify-center gap-2 rounded-md border border-white/20 bg-black/60 py-3 font-sans text-base uppercase tracking-widest text-white active:scale-[0.98]"
        >
          <Home className="size-4" aria-hidden="true" /> Quit to menu
        </button>
      </div>
    </div>
  )
}
