const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

// Cmaj7 / Am7 / Fmaj7 / Cmaj7 arpeggios, 16th notes — synthwave homage
const CHORDS = [
  [48, 52, 55, 59, 60, 59, 55, 52],
  [48, 52, 55, 59, 60, 59, 55, 52],
  [45, 48, 52, 55, 57, 55, 52, 48],
  [41, 45, 48, 52, 53, 52, 48, 45],
]
const ROOTS = [36, 36, 33, 29]

export class GameAudio {
  ctx: AudioContext | null = null
  master!: GainNode
  music!: GainNode
  sfx!: GainNode
  filter!: BiquadFilterNode
  noise!: AudioBuffer
  muted = false
  intensity = 0
  private timer: number | null = null
  private step = 0
  private nextTime = 0
  private playing = false
  private pad: { osc: OscillatorNode; gain: GainNode } | null = null

  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.8
      this.master.connect(ctx.destination)
      this.music = ctx.createGain()
      this.music.gain.value = 0.55
      this.filter = ctx.createBiquadFilter()
      this.filter.type = 'lowpass'
      this.filter.frequency.value = 900
      this.filter.Q.value = 6
      this.music.connect(this.filter)
      this.filter.connect(this.master)
      const delay = ctx.createDelay()
      delay.delayTime.value = 0.357
      const fb = ctx.createGain()
      fb.gain.value = 0.28
      this.filter.connect(delay)
      delay.connect(fb)
      fb.connect(delay)
      delay.connect(this.master)
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

  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  startMusic() {
    if (!this.ctx || this.playing) return
    this.playing = true
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.1
    const osc = this.ctx.createOscillator()
    osc.type = 'sawtooth'
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    gain.gain.setTargetAtTime(0.22, this.ctx.currentTime, 0.8)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 260
    osc.connect(lp)
    lp.connect(gain)
    gain.connect(this.master)
    osc.frequency.value = NOTE(ROOTS[0])
    osc.start()
    this.pad = { osc, gain }
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  stopMusic() {
    this.playing = false
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
    if (this.pad && this.ctx) {
      const { osc, gain } = this.pad
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
      osc.stop(this.ctx.currentTime + 1.5)
      this.pad = null
    }
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx) return
    const stepDur = 60 / 84 / 4
    while (this.nextTime < ctx.currentTime + 0.12) {
      const bar = Math.floor(this.step / 16) % CHORDS.length
      const chord = CHORDS[bar]
      const note = chord[this.step % 8]
      this.arp(NOTE(note + 12), this.nextTime, stepDur)
      if (this.step % 16 === 0 && this.pad) this.pad.osc.frequency.setTargetAtTime(NOTE(ROOTS[bar]), this.nextTime, 0.05)
      if (this.step % 4 === 0 && this.intensity > 0.15) this.kick(this.nextTime, this.intensity)
      if (this.step % 2 === 1 && this.intensity > 0.45) this.hat(this.nextTime)
      const sweep = 700 + (Math.sin(this.nextTime * 0.35) * 0.5 + 0.5) * 1700 + this.intensity * 800
      this.filter.frequency.setTargetAtTime(sweep, this.nextTime, 0.2)
      this.nextTime += stepDur
      this.step++
    }
  }

  private arp(freq: number, t: number, dur: number) {
    const ctx = this.ctx!
    const o1 = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    o1.type = 'sawtooth'
    o2.type = 'square'
    o1.frequency.value = freq
    o2.frequency.value = freq * 1.004
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.16, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.6)
    o1.connect(g)
    o2.connect(g)
    g.connect(this.music)
    o1.start(t)
    o2.start(t)
    o1.stop(t + dur * 1.8)
    o2.stop(t + dur * 1.8)
  }

  private kick(t: number, amt: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(130, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18)
    g.gain.setValueAtTime(0.5 * Math.min(1, amt + 0.3), t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + 0.3)
  }

  private hat(t: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.06, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.master)
    src.start(t, Math.random())
    src.stop(t + 0.06)
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
