interface TgWebApp {
  ready: () => void
  expand: () => void
  disableVerticalSwipes?: () => void
  setHeaderColor?: (c: string) => void
  setBackgroundColor?: (c: string) => void
  setBottomBarColor?: (c: string) => void
  lockOrientation?: () => void
  isVersionAtLeast?: (v: string) => boolean
  initDataUnsafe?: { user?: { first_name?: string } }
  HapticFeedback?: {
    impactOccurred: (s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (s: 'error' | 'success' | 'warning') => void
  }
  CloudStorage?: {
    getItem: (k: string, cb: (err: unknown, v?: string) => void) => void
    setItem: (k: string, v: string, cb?: (err: unknown, ok?: boolean) => void) => void
  }
  openTelegramLink?: (url: string) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp }
  }
}

const BEST_KEY = 'stranger_run_best'

export function tg(): TgWebApp | undefined {
  if (typeof window === 'undefined') return undefined
  const app = window.Telegram?.WebApp
  // the script defines WebApp even outside Telegram; initData presence is not required for UI calls
  return app
}

export function initTelegram() {
  const app = tg()
  if (!app) return
  const v = (ver: string) => !!app.isVersionAtLeast?.(ver)
  try {
    app.ready()
    app.expand()
    if (!inTelegram()) return
    if (v('7.7')) app.disableVerticalSwipes?.()
    if (v('6.1')) {
      app.setHeaderColor?.('#0a0203')
      app.setBackgroundColor?.('#0a0203')
    }
    if (v('7.10')) app.setBottomBarColor?.('#0a0203')
    if (v('8.0')) app.lockOrientation?.()
  } catch {
    // older clients may not support every method
  }
}

/** true only when actually launched inside a Telegram client */
export function inTelegram() {
  return !!(tg() as unknown as { initData?: string } | undefined)?.initData
}

function cloud() {
  const app = tg()
  if (!app || !inTelegram() || !app.isVersionAtLeast?.('6.9')) return undefined
  return app.CloudStorage
}

export function playerName() {
  return tg()?.initDataUnsafe?.user?.first_name
}

export function haptic(kind: 'light' | 'medium' | 'heavy' | 'error' | 'success') {
  const h = inTelegram() && tg()?.isVersionAtLeast?.('6.1') ? tg()?.HapticFeedback : undefined
  try {
    if (h) {
      if (kind === 'error' || kind === 'success') h.notificationOccurred(kind)
      else h.impactOccurred(kind)
      return
    }
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(kind === 'heavy' || kind === 'error' ? 40 : 12)
  }
}

export function loadBest(): Promise<number> {
  return new Promise((resolve) => {
    const local = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(BEST_KEY) : 0) || 0
    const cs = cloud()
    if (!cs) return resolve(local)
    try {
      cs.getItem(BEST_KEY, (err, v) => resolve(err ? local : Math.max(local, Number(v) || 0)))
      setTimeout(() => resolve(local), 1200)
    } catch {
      resolve(local)
    }
  })
}

export function saveBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score))
  } catch {
    // ignore
  }
  try {
    cloud()?.setItem(BEST_KEY, String(score))
  } catch {
    // ignore
  }
}

export function shareScore(score: number, distance: number) {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const text = `I escaped the Demogorgon for ${(distance / 1000).toFixed(2)} km and scored ${score.toLocaleString()} in Stranger Run! Can you beat me?`
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  const app = tg()
  if (app?.openTelegramLink && inTelegram()) {
    app.openTelegramLink(share)
  } else if (navigator.share) {
    navigator.share({ title: 'Stranger Run', text, url }).catch(() => {})
  } else {
    window.open(share, '_blank')
  }
}
