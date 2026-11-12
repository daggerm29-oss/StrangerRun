import { Logo } from './logo'

export function LoadingScreen({ progress, error }: { progress: number; error: string | null }) {
  const pct = Math.round(progress * 100)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end safe-bottom">
      <img
        src="/images/key-art.png"
        alt=""
        className="absolute inset-0 size-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black" aria-hidden="true" />
      <div className="relative mb-16 flex w-full max-w-xs flex-col items-center gap-6 px-6">
        <Logo />
        {error ? (
          <p role="alert" className="text-center font-sans text-base text-white">
            {error}
          </p>
        ) : (
          <div className="flex w-full flex-col gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Loading game">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-blood shadow-[0_0_12px_#e50914] transition-[width] duration-200" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
            <p className="text-center font-sans text-xs uppercase tracking-[0.35em] text-white/75 animate-flicker">
              Opening the gate… {pct}%
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
