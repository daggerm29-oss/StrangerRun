export type Action = 'left' | 'right' | 'up' | 'down'

export class Input {
  private el: HTMLElement
  private onAction: (a: Action) => void
  private sx = 0
  private sy = 0
  private active = false
  private fired = false
  private id: number | null = null

  constructor(el: HTMLElement, onAction: (a: Action) => void) {
    this.el = el
    this.onAction = onAction
    el.addEventListener('pointerdown', this.down)
    el.addEventListener('pointermove', this.move)
    el.addEventListener('pointerup', this.up)
    el.addEventListener('pointercancel', this.up)
    window.addEventListener('keydown', this.key)
  }

  private down = (e: PointerEvent) => {
    this.active = true
    this.fired = false
    this.id = e.pointerId
    this.sx = e.clientX
    this.sy = e.clientY
  }

  private move = (e: PointerEvent) => {
    if (!this.active || this.fired || e.pointerId !== this.id) return
    const dx = e.clientX - this.sx
    const dy = e.clientY - this.sy
    const threshold = Math.max(22, Math.min(window.innerWidth, window.innerHeight) * 0.05)
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
    this.fired = true
    if (Math.abs(dx) > Math.abs(dy)) this.onAction(dx > 0 ? 'right' : 'left')
    else this.onAction(dy > 0 ? 'down' : 'up')
  }

  private up = () => {
    this.active = false
    this.id = null
  }

  private key = (e: KeyboardEvent) => {
    const map: Record<string, Action> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'up',
      KeyW: 'up',
      Space: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
    }
    const a = map[e.code]
    if (a) {
      e.preventDefault()
      this.onAction(a)
    }
  }

  dispose() {
    this.el.removeEventListener('pointerdown', this.down)
    this.el.removeEventListener('pointermove', this.move)
    this.el.removeEventListener('pointerup', this.up)
    this.el.removeEventListener('pointercancel', this.up)
    window.removeEventListener('keydown', this.key)
  }
}
