'use client'

import { useState } from 'react'
import { Logo } from './logo'

const ROW_ONE = 'ABCDEFGHIJKLM'.split('')
const ROW_TWO = 'NOPQRSTUVWXYZ'.split('')
const BULB_COLORS = ['#e50914', '#36e3ff', '#ffc53a', '#5dff8a', '#ff7ad9']
// Letters that light up one after another to spell the word RUN
const SPELL: Record<string, number> = { R: 0, U: 1, N: 2 }

const SPORES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 47) % 100,
  size: 2 + ((i * 5) % 4),
  delay: -((i * 1.3) % 9),
  duration: 7 + ((i * 3) % 6),
}))

function Wall({ letters }: { letters: string[] }) {
  return (
    <ul className="flex w-full justify-between" aria-hidden="true">
      {letters.map((ch, i) => {
        const color = BULB_COLORS[i % BULB_COLORS.length]
        const spellIndex = SPELL[ch]
        const spelled = spellIndex !== undefined
        return (
          <li key={ch} className="flex flex-1 flex-col items-center">
            <span
              className={spelled ? 'bulb-spell' : 'bulb-idle'}
              style={{
                ['--bulb' as string]: color,
                animationDelay: spelled ? `${0.9 + spellIndex * 0.9}s` : `${-(i * 0.7) % 4}s`,
              }}
            />
            <span
              className={`mt-1 font-serif text-lg leading-none ${spelled ? 'letter-spell' : 'text-white/25'}`}
              style={spelled ? { animationDelay: `${0.9 + spellIndex * 0.9}s`, ['--bulb' as string]: color } : undefined}
            >
              {ch}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function EnterScreen({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false)

  const handle = () => {
    if (leaving) return
    setLeaving(true)
    onEnter()
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-label="Tap to enter the game and turn on the music"
      className={`absolute inset-0 z-50 flex flex-col items-center justify-between overflow-hidden bg-[#070102] px-5 safe-top safe-bottom text-left transition-opacity duration-700 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div aria-hidden="true" className="enter-glow pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="enter-lightning pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {SPORES.map((s, i) => (
          <span
            key={i}
            className="spore absolute bottom-0 rounded-full bg-ember/70"
            style={{
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col gap-5 pt-4">
        <svg viewBox="0 0 400 24" className="h-6 w-full" aria-hidden="true" preserveAspectRatio="none">
          <path d="M0 4 Q 50 22 100 8 T 200 8 T 300 8 T 400 4" fill="none" stroke="#3a2a22" strokeWidth="2" />
        </svg>
        <Wall letters={ROW_ONE} />
        <Wall letters={ROW_TWO} />
      </div>

      <div className="enter-title relative z-10 flex flex-col items-center gap-3">
        <Logo />
        <p className="animate-flicker font-sans text-sm uppercase tracking-[0.35em] text-white/80">Escape the Upside Down</p>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 pb-2">
        <span className="relative flex size-20 items-center justify-center">
          <span className="enter-ring absolute inset-0 rounded-full border-2 border-blood" />
          <span className="enter-ring absolute inset-0 rounded-full border-2 border-blood [animation-delay:0.9s]" />
          <span className="relative flex size-14 items-center justify-center rounded-full border-2 border-blood bg-blood/90 shadow-[0_0_30px_rgba(229,9,20,0.7)]">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
        <span className="animate-flicker font-sans text-lg font-semibold uppercase tracking-[0.3em] text-white st-glow">Tap to enter</span>
        <span className="font-sans text-xs uppercase tracking-[0.2em] text-white/50">Sound on for the full experience</span>
      </div>
    </button>
  )
}
