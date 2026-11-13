import { Heart, Magnet, Pause, Shield, Sparkles } from 'lucide-react'
import type { HudData } from '@/lib/game/engine'

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} KM` : `${Math.floor(m)} M`
}

export function Hud({ hud, onPause }: { hud: HudData; onPause: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 safe-top px-3">
      <div className="flex items-start justify-between gap-3 font-sans uppercase tracking-wide">
        <div className="hud-text flex flex-col gap-0.5 rounded-md bg-black/35 px-2.5 py-1.5 backdrop-blur-[2px]">
          <p className="text-lg font-semibold leading-tight text-white">
            <span className="sr-only">Score </span>
            <span aria-hidden="true" className="text-white/70">SCORE: </span>
            {hud.score.toLocaleString('en-US')}
          </p>
          <p className="text-base font-medium leading-tight text-gold">
            <span className="text-white/70">COINS: </span>
            {hud.coins}
          </p>
          <div className="flex items-center gap-1 text-base font-medium leading-tight">
            <span className="text-white/70">LIVES:</span>
            <span className="sr-only">{hud.lives} of 3</span>
            {[0, 1, 2].map((i) => (
              <Heart
                key={i}
                aria-hidden="true"
                className={`size-4 ${i < hud.lives ? 'fill-blood text-blood drop-shadow-[0_0_4px_rgba(229,9,20,0.9)]' : 'text-white/30'}`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="hud-text flex flex-col items-end rounded-md bg-black/35 px-2.5 py-1.5 backdrop-blur-[2px]">
            <p className="text-lg font-semibold leading-tight text-white">
              <span className="text-white/70">DISTANCE: </span>
              {formatDistance(hud.distance)}
            </p>
            <p className="text-base font-semibold leading-tight text-ember">
              <span className="text-white/70">MULTIPLIER: </span>x{hud.multiplier}
            </p>
            <p className={`text-xs font-semibold uppercase leading-tight tracking-wider ${hud.cursed ? 'animate-pulse text-blood' : 'text-white/60'}`}>
              {hud.cursed ? 'Controls reversed' : hud.zone}
            </p>
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            <button
              type="button"
              onClick={onPause}
              aria-label="Pause game"
              className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white active:scale-95"
            >
              <Pause className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {hud.shield > 0 && <PowerBar icon={<Shield className="size-4" aria-hidden="true" />} label="Shield" value={hud.shield} color="bg-blood" />}
        {hud.tk > 0 && <PowerBar icon={<Sparkles className="size-4" aria-hidden="true" />} label="Telekinesis" value={hud.tk} color="bg-[#c58bff]" />}
        {hud.magnet > 0 && <PowerBar icon={<Magnet className="size-4" aria-hidden="true" />} label="Magnet" value={hud.magnet} color="bg-neon" />}
      </div>
    </div>
  )
}

function PowerBar({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex w-40 items-center gap-2 rounded-md bg-black/45 px-2 py-1 text-white">
      {icon}
      <span className="sr-only">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
        <div className={`h-full ${color} transition-[width] duration-100`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}
