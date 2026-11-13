export type MusicMood = 'menu' | 'run' | 'over' | 'board'

interface Track {
  id: string
  src: string
  trim: number
}

// Per-track trim evens out loudness between recordings; tweak here if one feels too loud or quiet.
const TRACKS: Track[] = [
  { id: 'theme', src: '/audio/main-theme.mp3', trim: 1 },
  { id: 'hill', src: '/audio/running-up-that-hill.mp3', trim: 1 },
  { id: 'clash', src: '/audio/should-i-stay-or-should-i-go.mp3', trim: 0.9 },
  { id: 'material', src: '/audio/material-girl.mp3', trim: 0.9 },
]

// Master music volume per situation. Running is lower so jump/coin/hit effects stay audible.
const VOLUME: Record<MusicMood, number> = { menu: 0.6, run: 0.38, over: 0.55, board: 0.5 }
const DUCK = 0.35
const FADE_MS = 1100

class MusicPlayer {
  private current: { el: HTMLAudioElement; track: Track } | null = null
  private mood: MusicMood = 'menu'
  private ducked = false
  private entered = false

  private level(track: Track) {
    return VOLUME[this.mood] * track.trim * (this.ducked ? DUCK : 1)
  }

  private fade(el: HTMLAudioElement, to: number, ms: number, then?: () => void) {
    const from = el.volume
    const start = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms)
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t))
      if (t < 1) requestAnimationFrame(step)
      else then?.()
    }
    requestAnimationFrame(step)
  }

  private start(track: Track) {
    const el = new Audio(track.src)
    el.preload = 'auto'
    el.volume = 0
    el.addEventListener('ended', () => {
      if (this.current?.el === el) this.playRandom()
    })
    const previous = this.current
    this.current = { el, track }
    void el.play().then(
      () => this.fade(el, this.level(track), FADE_MS),
      () => {
        this.current = previous
      },
    )
    if (previous) {
      this.fade(previous.el, 0, FADE_MS, () => {
        previous.el.pause()
        previous.el.src = ''
      })
    }
  }

  private playRandom() {
    const pool = TRACKS.filter((t) => t.id !== this.current?.track.id)
    this.start(pool[Math.floor(Math.random() * pool.length)])
  }

  /** Must be called from a user gesture. Starts the Stranger Things theme. */
  enter() {
    if (this.entered) return
    this.entered = true
    this.mood = 'menu'
    this.start(TRACKS[0])
  }

  /** Switches to a new random song (never the one already playing) and adjusts volume for the mood. */
  shuffle(mood: MusicMood) {
    if (!this.entered) return
    this.mood = mood
    this.ducked = false
    this.playRandom()
  }

  setMood(mood: MusicMood) {
    this.mood = mood
    this.refreshVolume()
  }

  duck(on: boolean) {
    this.ducked = on
    this.refreshVolume()
  }

  private refreshVolume() {
    if (this.current) this.fade(this.current.el, this.level(this.current.track), 400)
  }

  /** Pause when the tab/app is hidden and resume when it comes back. */
  setVisible(visible: boolean) {
    const el = this.current?.el
    if (!el || !this.entered) return
    if (visible) void el.play().catch(() => {})
    else el.pause()
  }
}

export const music = new MusicPlayer()
