const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export class GameAudio {
  ctx: AudioContext | null = null
  master!: GainNode
  sfx!: GainNode
  noise!: AudioBuffer

  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = 0.8
      this.master.connect(ctx.destination)
      this.sfx = ctx.createGain()
      this.sfx.gain.value = 0.9
      this.sfx.connect(this.master)
      const len = ctx.sampleRate * 2
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private noiseBurst(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, delay = 0) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.sfx)
    src.start(t, Math.random())
    src.stop(t + dur + 0.05)
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(this.sfx)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  coin() {
    this.tone('square', 988, 1318, 0.08, 0.08)
    this.tone('square', 1318, 1760, 0.1, 0.06, 0.06)
  }
  jump() {
    this.noiseBurst(0.25, 'bandpass', 600, 2400, 0.25)
  }
  slide() {
    this.noiseBurst(0.35, 'lowpass', 2000, 300, 0.3)
  }
  turn() {
    this.noiseBurst(0.2, 'bandpass', 1500, 500, 0.2)
  }
  hit() {
    this.tone('sawtooth', 160, 40, 0.4, 0.4)
    this.noiseBurst(0.35, 'lowpass', 1200, 100, 0.5)
  }
  power() {
    ;[0, 4, 7, 12].forEach((n, i) => this.tone('triangle', NOTE(72 + n), NOTE(72 + n) * 1.01, 0.18, 0.15, i * 0.07))
  }
  thunder(delay: number, power: number) {
    this.noiseBurst(2.8, 'lowpass', 900, 60, 0.55 * power, delay)
    this.noiseBurst(0.3, 'lowpass', 3000, 400, 0.3 * power, delay)
  }
  roar() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(90, t)
    o.frequency.linearRampToValueAtTime(140, t + 0.3)
    o.frequency.exponentialRampToValueAtTime(55, t + 1.2)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 28
    const lfoG = ctx.createGain()
    lfoG.gain.value = 25
    lfo.connect(lfoG)
    lfoG.connect(o.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.001, t)
    g.gain.linearRampToValueAtTime(0.35, t + 0.1)
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3)
    o.connect(g)
    g.connect(this.sfx)
    o.start(t)
    lfo.start(t)
    o.stop(t + 1.4)
    lfo.stop(t + 1.4)
    this.noiseBurst(1.1, 'bandpass', 800, 200, 0.3)
  }
}
