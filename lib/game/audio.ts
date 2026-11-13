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

  private reverb: ConvolverNode | null = null

  /** cheap cavern: decaying stereo noise, built once and reused for every roar */
  private cavern() {
    const ctx = this.ctx!
    if (this.reverb) return this.reverb
    const len = Math.floor(ctx.sampleRate * 1.7)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = buf
    this.reverb.connect(this.sfx)
    return this.reverb
  }

  /**
   * Demogorgon roar built to be disturbing: a slamming sub impact, a gurgling throat growl that tears upward,
   * two dissonant (tritone) screams that wail and break, ragged breath, and a second, shorter shriek that
   * answers the first. Everything is crushed through a compressor so it stays loud and aggressive on phone speakers.
   */
  roar() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const dur = 2.9
    const oscs: OscillatorNode[] = []
    const start = (o: OscillatorNode, from: number, to: number) => {
      o.start(from)
      o.stop(to)
      oscs.push(o)
    }

    const out = ctx.createGain()
    out.gain.setValueAtTime(0.001, t)
    out.gain.exponentialRampToValueAtTime(2.0, t + 0.05)
    out.gain.setValueAtTime(2.0, t + 1.2)
    out.gain.exponentialRampToValueAtTime(0.001, t + dur)
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -26
    comp.knee.value = 8
    comp.ratio.value = 14
    comp.attack.value = 0.002
    comp.release.value = 0.3
    out.connect(comp)
    comp.connect(this.sfx)
    const wet = ctx.createGain()
    wet.gain.value = 0.55
    comp.connect(wet)
    wet.connect(this.cavern())

    const crush = (amount: number) => {
      const s = ctx.createWaveShaper()
      s.curve = this.distortion(amount)
      s.oversample = '2x'
      return s
    }

    // throat growl: low saws through hard distortion, a sweeping vowel and a fast gurgle
    const growl = crush(120)
    const vowel = ctx.createBiquadFilter()
    vowel.type = 'bandpass'
    vowel.Q.value = 2.4
    vowel.frequency.setValueAtTime(260, t)
    vowel.frequency.exponentialRampToValueAtTime(1250, t + 0.45)
    vowel.frequency.exponentialRampToValueAtTime(190, t + dur)
    const gurgle = ctx.createGain()
    gurgle.gain.value = 0.5
    const gLfo = ctx.createOscillator()
    gLfo.type = 'square'
    gLfo.frequency.setValueAtTime(19, t)
    gLfo.frequency.linearRampToValueAtTime(43, t + dur)
    const gDepth = ctx.createGain()
    gDepth.gain.value = 0.5
    gLfo.connect(gDepth)
    gDepth.connect(gurgle.gain)
    growl.connect(vowel)
    vowel.connect(gurgle)
    gurgle.connect(out)
    start(gLfo, t, t + dur + 0.1)
    for (const [f, detune] of [
      [52, 0],
      [55, 21],
      [83, -17],
      [110, 9],
    ]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = detune
      o.frequency.setValueAtTime(f * 0.7, t)
      o.frequency.exponentialRampToValueAtTime(f * 2.1, t + 0.35)
      o.frequency.linearRampToValueAtTime(f * 1.3, t + 1.4)
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur)
      const g = ctx.createGain()
      g.gain.value = 0.38
      o.connect(g)
      g.connect(growl)
      start(o, t, t + dur + 0.1)
    }

    // two dissonant screams that wail up, waver and fall apart
    const scream = (at: number, len: number, base: number, level: number) => {
      const shaper = crush(40)
      const body = ctx.createBiquadFilter()
      body.type = 'bandpass'
      body.frequency.value = 2300
      body.Q.value = 1.8
      const trem = ctx.createGain()
      trem.gain.value = 0.55
      const tLfo = ctx.createOscillator()
      tLfo.type = 'square'
      tLfo.frequency.value = 58
      const tDepth = ctx.createGain()
      tDepth.gain.value = 0.45
      tLfo.connect(tDepth)
      tDepth.connect(trem.gain)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.001, at)
      env.gain.exponentialRampToValueAtTime(level, at + 0.12)
      env.gain.setValueAtTime(level, at + len * 0.6)
      env.gain.exponentialRampToValueAtTime(0.001, at + len)
      const vib = ctx.createOscillator()
      vib.frequency.value = 9
      const vibDepth = ctx.createGain()
      vibDepth.gain.value = base * 0.09
      vib.connect(vibDepth)
      for (const ratio of [1, 1.414, 1.06]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(base * ratio * 0.8, at)
        o.frequency.exponentialRampToValueAtTime(base * ratio * 2.6, at + len * 0.28)
        o.frequency.linearRampToValueAtTime(base * ratio * 1.9, at + len * 0.6)
        o.frequency.exponentialRampToValueAtTime(base * ratio * 0.7, at + len)
        vibDepth.connect(o.frequency)
        o.connect(shaper)
        start(o, at, at + len + 0.1)
      }
      shaper.connect(body)
      body.connect(trem)
      trem.connect(env)
      env.connect(out)
      start(tLfo, at, at + len + 0.1)
      start(vib, at, at + len + 0.1)
    }
    scream(t + 0.05, 1.7, 310, 0.34)
    scream(t + 1.05, 1.5, 420, 0.28)

    // sub slam on impact, then a rumbling aftershock
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(95, t)
    sub.frequency.exponentialRampToValueAtTime(24, t + 0.9)
    const subG = ctx.createGain()
    subG.gain.setValueAtTime(1.3, t)
    subG.gain.exponentialRampToValueAtTime(0.001, t + 1.1)
    sub.connect(subG)
    subG.connect(out)
    start(sub, t, t + 1.2)

    this.noiseBurst(1.6, 'bandpass', 3600, 500, 0.5)
    this.noiseBurst(2.4, 'lowpass', 600, 45, 0.8)
    this.noiseBurst(0.9, 'highpass', 5200, 3000, 0.22, 1.0)
  }

  /** jumpscare stinger: earth ripping open, a shrill screech, and a guttural groan for zombies */
  scare(groan: boolean) {
    this.noiseBurst(0.45, 'lowpass', 900, 60, 0.55)
    this.noiseBurst(0.3, 'bandpass', 4200, 1200, 0.3)
    this.tone('sawtooth', 1400, 380, 0.32, 0.14)
    this.tone('sine', 110, 32, 0.6, 0.5)
    if (groan) {
      this.tone('sawtooth', 95, 70, 0.9, 0.2, 0.12)
      this.tone('sawtooth', 101, 64, 0.9, 0.14, 0.12)
    } else {
      this.noiseBurst(0.6, 'bandpass', 300, 900, 0.3, 0.1)
    }
  }

  /** the rift tearing open around the runner: rising suction, then a deep boom */
  portal() {
    this.noiseBurst(0.9, 'bandpass', 180, 4200, 0.45)
    this.noiseBurst(1.6, 'lowpass', 1400, 40, 0.6, 0.55)
    this.tone('sine', 140, 28, 1.6, 0.55, 0.5)
    this.tone('sawtooth', 55, 30, 1.2, 0.18, 0.5)
  }
}
