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
  private distortion(amount: number) {
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
    }
    return curve
  }

  /** layered Demogorgon shriek: distorted throat growl, wet flutter, a piercing screech and ragged breath */
  roar() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const dur = 1.9
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.001, t)
    out.gain.exponentialRampToValueAtTime(0.9, t + 0.12)
    out.gain.setValueAtTime(0.9, t + 0.9)
    out.gain.exponentialRampToValueAtTime(0.001, t + dur)
    out.connect(this.sfx)

    const shaper = ctx.createWaveShaper()
    shaper.curve = this.distortion(40)
    shaper.oversample = '2x'
    const formant = ctx.createBiquadFilter()
    formant.type = 'bandpass'
    formant.Q.value = 1.4
    formant.frequency.setValueAtTime(380, t)
    formant.frequency.linearRampToValueAtTime(950, t + 0.35)
    formant.frequency.exponentialRampToValueAtTime(260, t + dur)
    const flutter = ctx.createGain()
    flutter.gain.value = 0.55
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.setValueAtTime(22, t)
    lfo.frequency.linearRampToValueAtTime(31, t + dur)
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.45
    lfo.connect(lfoDepth)
    lfoDepth.connect(flutter.gain)
    shaper.connect(formant)
    formant.connect(flutter)
    flutter.connect(out)
    const oscs: OscillatorNode[] = [lfo]
    for (const [f, detune] of [
      [68, 0],
      [71, 14],
      [102, -9],
    ]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = detune
      o.frequency.setValueAtTime(f * 0.8, t)
      o.frequency.linearRampToValueAtTime(f * 1.7, t + 0.3)
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur)
      const g = ctx.createGain()
      g.gain.value = 0.35
      o.connect(g)
      g.connect(shaper)
      oscs.push(o)
    }

    const screech = ctx.createOscillator()
    screech.type = 'sawtooth'
    screech.frequency.setValueAtTime(720, t + 0.1)
    screech.frequency.linearRampToValueAtTime(1500, t + 0.45)
    screech.frequency.exponentialRampToValueAtTime(520, t + 1.5)
    const vib = ctx.createOscillator()
    vib.frequency.value = 11
    const vibDepth = ctx.createGain()
    vibDepth.gain.value = 60
    vib.connect(vibDepth)
    vibDepth.connect(screech.frequency)
    const screechF = ctx.createBiquadFilter()
    screechF.type = 'bandpass'
    screechF.frequency.value = 1800
    screechF.Q.value = 3
    const screechG = ctx.createGain()
    screechG.gain.setValueAtTime(0.001, t)
    screechG.gain.exponentialRampToValueAtTime(0.16, t + 0.3)
    screechG.gain.exponentialRampToValueAtTime(0.001, t + 1.5)
    screech.connect(screechF)
    screechF.connect(screechG)
    screechG.connect(out)
    oscs.push(screech, vib)

    for (const o of oscs) {
      o.start(t)
      o.stop(t + dur + 0.1)
    }
    this.noiseBurst(1.5, 'bandpass', 2400, 350, 0.32)
    this.noiseBurst(1.8, 'lowpass', 500, 50, 0.5)
  }

  /** the rift tearing open around the runner: rising suction, then a deep boom */
  portal() {
    this.noiseBurst(0.9, 'bandpass', 180, 4200, 0.45)
    this.noiseBurst(1.6, 'lowpass', 1400, 40, 0.6, 0.55)
    this.tone('sine', 140, 28, 1.6, 0.55, 0.5)
    this.tone('sawtooth', 55, 30, 1.2, 0.18, 0.5)
  }
}
