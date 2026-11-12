export interface ToastItem {
  id: number
  text: string
  tone?: 'red' | 'cyan' | 'gold'
}

const TONES = {
  red: 'text-white st-glow',
  cyan: 'text-neon [text-shadow:0_0_12px_rgba(54,227,255,0.8)]',
  gold: 'text-gold [text-shadow:0_0_12px_rgba(255,197,58,0.8)]',
}

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-[30%] flex flex-col items-center gap-1">
      {items.map((t) => (
        <p
          key={t.id}
          className={`animate-toast font-sans text-3xl font-bold uppercase tracking-wider hud-text ${TONES[t.tone ?? 'red']}`}
        >
          {t.text}
        </p>
      ))}
    </div>
  )
}
