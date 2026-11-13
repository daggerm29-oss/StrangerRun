import * as THREE from 'three'
import { Environment } from './environment'
import { Assets, HALF_W, LANE_W, PORTAL_S } from './props'
import { Track, type Segment, type Obstacle } from './track'
import { Player } from './player'
import { Demogorgon } from './demogorgon'
import { GameAudio } from './audio'
import { Input, type Action } from './input'
import { haptic } from './telegram'
import { makeDotTexture, makeShadowTexture } from './textures'
import { ZONES } from './zones'
import { Portal } from './portal'
import { updateLurker } from './lurkers'

/** distance before the rift where it takes hold: the runner is pulled into the centre lane and the camera dives in */
const PORTAL_PULL = 24

export type GameState = 'loading' | 'menu' | 'playing' | 'paused' | 'dying' | 'over'

export interface HudData {
  score: number
  coins: number
  lives: number
  distance: number
  multiplier: number
  shield: number
  magnet: number
  danger: number
  tk: number
  zone: string
  cursed: boolean
}

export interface GameResult {
  score: number
  coins: number
  distance: number
}

export interface EngineCallbacks {
  onState: (s: GameState) => void
  onHud: (h: HudData) => void
  onToast: (text: string, tone?: 'red' | 'cyan' | 'gold') => void
  onProgress: (p: number) => void
  onResult: (r: GameResult) => void
  onFlash: (kind: 'hit' | 'lightning' | 'portal', power: number) => void
}

const GRAVITY = 34
const JUMP_V = 11.2
const SLIDE_TIME = 0.78
/** lowest render resolution the adaptive scaler may fall to */
const MIN_PR = 1.1
const MAX_LIVES = 3
const SHIELD_TIME = 8
const MAGNET_TIME = 10
const TK_TIME = 6
const CURSE_TIME = 4.5

interface Run {
  segIdx: number
  s: number
  x: number
  lane: number
  y: number
  vy: number
  slideT: number
  invulnT: number
  stumbleT: number
  shieldT: number
  magnetT: number
  fallT: number
  lives: number
  coins: number
  score: number
  dist: number
  mult: number
  speed: number
  chase: number
  roar: number
  pendingTurn: { dir: number; t: number } | null
  turnsDone: number
  hinted: number
  nextKm: number
  zone: number
  tkT: number
  curseT: number
  nextCurse: number
}

interface Particle {
  p: THREE.Vector3
  v: THREE.Vector3
  life: number
  max: number
  color: THREE.Color
  size: number
}

const shortAngle = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export class Engine {
  container: HTMLElement
  cb: EngineCallbacks
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  env!: Environment
  assets!: Assets
  track!: Track
  player!: Player
  demo = new Demogorgon()
  portal!: Portal
  /** segment index hosting the next portal, -1 when none is placed */
  portalSeg = -1
  /** 0..1 how deep the camera is diving into the rift */
  portalFx = 0
  /** lane changes are locked while the rift pulls the runner in */
  portalLock = false
  zoneFrom = 0
  zoneTo = 0
  zoneT = 1
  audio = new GameAudio()
  input: Input
  state: GameState = 'loading'
  r!: Run
  time = 0
  last = 0
  camYaw = 0
  playerYaw = 0
  shake = 0
  demoSide = 0
  intro = 1
  hudT = 0
  raf = 0
  trail: { p: THREE.Vector3; yaw: number; d: number }[] = []
  keyLight: THREE.PointLight
  rimLight: THREE.PointLight
  particles: Particle[] = []
  debris!: THREE.InstancedMesh
  disposed = false
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private tmp = new THREE.Vector3()
  private tmp2 = new THREE.Vector3()
  private tmpM = new THREE.Matrix4()
  private tmpQ = new THREE.Quaternion()
  private tmpS = new THREE.Vector3()
  private up = new THREE.Vector3(0, 1, 0)
  private chasePos = new THREE.Vector3()
  private chaseLook = new THREE.Vector3()
  private menuPos = new THREE.Vector3()
  private menuLook = new THREE.Vector3()
  private side = new THREE.Vector3()
  private maxPR = 1
  private pr = 1
  private frameMs = 16.7
  private qualityCool = 3
  private upscaleCool = 15

  constructor(container: HTMLElement, cb: EngineCallbacks) {
    this.container = container
    this.cb = cb
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    this.maxPR = Math.min(window.devicePixelRatio || 1, 1.75)
    this.pr = this.maxPR
    this.renderer.setPixelRatio(this.pr)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.6
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900)
    this.keyLight = new THREE.PointLight('#ffe6d2', 34, 16, 2)
    this.rimLight = new THREE.PointLight('#ff2a2a', 14, 14, 2)
    this.scene.add(this.keyLight, this.rimLight)
    this.input = new Input(container, (a) => this.onAction(a))
    window.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.resize()
  }

  async init() {
    const dot = makeDotTexture()
    this.env = new Environment(this.scene, dot)
    this.env.onThunder = (d, p) => this.audio.thunder(d, p)
    this.env.onFlash = (p) => this.cb.onFlash('lightning', p)
    this.assets = new Assets(dot)
    this.track = new Track(this.scene, this.assets)
    this.portal = new Portal(this.assets.halo)
    this.scene.add(this.portal.root)
    this.player = new Player(makeShadowTexture())
    this.scene.add(this.player.root)
    this.scene.add(this.demo.root)
    this.debris = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      120,
    )
    this.debris.frustumCulled = false
    this.debris.count = 0
    this.scene.add(this.debris)
    this.resize()
    this.newRun()
    if (process.env.NODE_ENV !== 'production') {
      ;(window as unknown as { __runner?: Engine }).__runner = this
    }
    this.loop(performance.now())
    await Promise.all([
      this.player.load('/models/runner.glb', (p) => this.cb.onProgress(p)),
      this.demo.load('/models/demogorgon.glb'),
      this.portal.load('/models/portal.glb'),
    ])
    // warm up shader compile so the first frame of play does not hitch
    this.renderer.compile(this.scene, this.camera)
    this.setState('menu')
  }

  private setState(s: GameState) {
    this.state = s
    this.cb.onState(s)
  }

  private newRun() {
    this.track.reset()
    this.r = {
      segIdx: 0,
      s: 4,
      x: 0,
      lane: 0,
      y: 0,
      vy: 0,
      slideT: 0,
      invulnT: 0,
      stumbleT: 0,
      shieldT: 0,
      magnetT: 0,
      fallT: 0,
      lives: MAX_LIVES,
      coins: 0,
      score: 0,
      dist: 0,
      mult: 1,
      speed: 0,
      chase: 9,
      roar: 0,
      pendingTurn: null,
      turnsDone: 0,
      hinted: 0,
      nextKm: 1000,
      zone: 0,
      tkT: 0,
      curseT: 0,
      nextCurse: 6,
    }
    const seg = this.track.get(0)!
    this.camYaw = seg.yaw
    this.playerYaw = seg.yaw
    this.trail = []
    this.particles = []
    this.intro = 0
    this.player.reset()
    this.player.pivot.rotation.set(0, 0, 0)
    this.portal?.hide()
    this.portalSeg = -1
    this.portalFx = 0
    this.portalLock = false
    this.zoneFrom = 0
    this.zoneTo = 0
    this.zoneT = 1
    this.emitHud()
  }

  startRun() {
    this.audio.ensure()
    if (this.state === 'over') this.newRun()
    this.intro = 0
    this.r.chase = 3.4
    this.r.roar = 1
    this.audio.roar()
    haptic('medium')
    this.setState('playing')
  }

  toMenu() {
    this.newRun()
    this.intro = 1
    this.setState('menu')
  }

  pause() {
    if (this.state !== 'playing') return
    this.setState('paused')
  }

  resume() {
    if (this.state !== 'paused') return
    this.audio.ensure()
    this.last = performance.now()
    this.setState('playing')
  }

  private onVisibility = () => {
    if (document.hidden) this.pause()
  }

  private resize = () => {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.env?.setViewportHeight(h * this.renderer.getPixelRatio())
  }

  // ---------------- input ----------------
  private onAction(a: Action) {
    if (this.state !== 'playing') return
    const r = this.r
    if (r.fallT > 0) return
    if (a === 'up') {
      if (r.y <= 0.001) {
        r.vy = JUMP_V
        r.y = 0.001
        r.slideT = 0
        this.player.play('jump', { duration: (2 * JUMP_V) / GRAVITY, restart: true })
        this.audio.jump()
        haptic('light')
      }
    } else if (a === 'down') {
      if (r.y > 0.001) r.vy = -22
      r.slideT = SLIDE_TIME
      this.player.play('slide', { duration: SLIDE_TIME * 1.35, restart: true })
      this.audio.slide()
      haptic('light')
    } else {
      const dir = a === 'left' ? -1 : 1
      if (this.tryTurn(dir)) return
      const seg = this.track.get(r.segIdx)!
      if (seg.turn === dir && seg.length - r.s < 22) r.pendingTurn = { dir, t: 0.45 }
      if (this.portalLock) return
      const laneDir = r.curseT > 0 ? -dir : dir
      r.lane = THREE.MathUtils.clamp(r.lane + laneDir, -1, 1)
    }
  }

  private tryTurn(dir: number) {
    const r = this.r
    const seg = this.track.get(r.segIdx)!
    if (dir !== seg.turn) return false
    if (r.s < seg.length - HALF_W - 5.5) return false
    this.doTurn()
    return true
  }

  private doTurn(force = false) {
    const r = this.r
    const seg = this.track.get(r.segIdx)!
    const next = this.track.get(r.segIdx + 1)!
    const P = seg.toWorld(r.s, r.x, 0, this.tmp)
    const rx = P.x - next.start.x
    const rz = P.z - next.start.y
    let ns = rx * next.fwd.x + rz * next.fwd.y
    let nx = rx * next.right.x + rz * next.right.y
    if (force) {
      ns = HALF_W + 1
      nx = 0
    }
    r.segIdx++
    r.s = ns
    r.x = THREE.MathUtils.clamp(nx, -LANE_W, LANE_W)
    r.lane = THREE.MathUtils.clamp(Math.round(r.x / LANE_W), -1, 1)
    r.pendingTurn = null
    r.turnsDone++
    this.track.update(r.segIdx, r.speed)
    if (!force) {
      this.audio.turn()
      haptic('light')
    }
  }

  // ---------------- gameplay ----------------
  private speedFor(dist: number) {
    return 12.5 + 19.5 * (1 - Math.exp(-dist / 2600))
  }

  private enterPortal() {
    const r = this.r
    const host = this.track.get(this.portalSeg)
    this.portalSeg = -1
    this.portalLock = false
    this.portal.pass()
    if (!host) return
    const zi = ZONES.indexOf(host.zone)
    this.zoneFrom = r.zone
    this.zoneTo = zi
    this.zoneT = 0
    r.zone = zi
    const z = ZONES[zi]
    this.cb.onFlash('portal', 1)
    this.shake = 0.75
    r.roar = 1
    this.audio.portal()
    this.audio.roar()
    haptic('heavy')
    this.cb.onToast(z.name, z.tone)
    if (z.id === 'upside') {
      this.cb.onToast('THE UPSIDE DOWN IS TAKING OVER', 'red')
      this.env.strike(this.camera, this.tmp.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)), 1.4)
      r.chase = Math.min(r.chase, 6)
    } else if (z.id === 'vecna') {
      this.cb.onToast('VECNA IS WATCHING', 'red')
    } else {
      this.cb.onToast(z.tagline.toUpperCase(), 'cyan')
    }
  }

  private loseLife(kind: 'hit' | 'fall' | 'wall') {
    const r = this.r
    r.lives--
    r.invulnT = 2
    r.stumbleT = 1
    r.chase = 3.2
    r.roar = 1
    this.shake = 0.6
    this.audio.hit()
    this.audio.roar()
    haptic('heavy')
    this.cb.onFlash('hit', 1)
    if (r.lives <= 0) {
      this.die()
      return false
    }
    this.cb.onToast(kind === 'fall' ? 'INTO THE UPSIDE DOWN!' : kind === 'wall' ? 'TURN!' : 'IT’S RIGHT BEHIND YOU!', 'red')
    return true
  }

  private die() {
    const r = this.r
    r.lives = 0
    this.setState('dying')
    haptic('error')
    this.emitHud()
    window.setTimeout(() => {
      if (this.disposed) return
      this.setState('over')
      this.cb.onResult({ score: Math.floor(r.score), coins: r.coins, distance: r.dist })
    }, 1700)
  }

  private smash(o: Obstacle, seg: Segment, color?: string) {
    if (o.kind === 'gap') return
    o.object.visible = false
    const lane = o.kind === 'dog' ? (o.dogX ?? 0) : (o.lanes?.[0] ?? 0) * LANE_W
    seg.toWorld(o.s, lane, 0.8, this.tmp2)
    this.burst(this.tmp2, color ?? (o.kind === 'barrels' || o.kind === 'cone' ? '#ffcc22' : '#ff2a2a'), 26)
  }

  /** something bursts out of a front lawn: dirt spray, a sting of sound, a jolt */
  private jumpscare(seg: Segment, o: Obstacle) {
    const lurk = o.lurk!
    const x = o.kind === 'zombie' ? lurk.homeX : lurk.side * (HALF_W + 3.2)
    seg.toWorld(o.s, x, 0.4, this.tmp2)
    this.burst(this.tmp2, '#3a2416', 22, 7)
    this.burst(this.tmp2, '#ff2a2a', 10, 5)
    this.audio.scare(o.kind === 'zombie')
    this.shake = Math.max(this.shake, 0.35)
    this.cb.onFlash('hit', 0.18)
    haptic('medium')
  }

  private burst(at: THREE.Vector3, color: string, n: number, speed = 6) {
    const c = new THREE.Color(color)
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= 120) this.particles.shift()
      this.particles.push({
        p: at.clone(),
        v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
        life: 0,
        max: 0.5 + Math.random() * 0.5,
        color: c,
        size: 0.35 + Math.random() * 0.45,
      })
    }
  }

  private update(dt: number) {
    const r = this.r
    let seg = this.track.get(r.segIdx)!

    const base = this.speedFor(r.dist)
    const stumble = r.stumbleT > 0 ? 0.55 + 0.45 * (1 - r.stumbleT) : 1
    r.speed = base * stumble * (r.fallT > 0 ? 0.25 : 1)
    r.s += r.speed * dt
    r.dist += r.speed * dt
    r.score += r.speed * dt * r.mult
    r.stumbleT = Math.max(0, r.stumbleT - dt)
    r.invulnT = Math.max(0, r.invulnT - dt)
    r.shieldT = Math.max(0, r.shieldT - dt)
    r.magnetT = Math.max(0, r.magnetT - dt)
    r.slideT = Math.max(0, r.slideT - dt)
    r.roar = Math.max(0, r.roar - dt * 0.8)
    r.chase += (13 - r.chase) * Math.min(1, dt * 0.22)

    const m = Math.min(10, 1 + Math.floor(r.dist / 600))
    if (m !== r.mult) {
      r.mult = m
      this.cb.onToast(`x${m} MULTIPLIER`, 'gold')
    }
    if (r.dist >= r.nextKm) {
      this.cb.onToast(`${r.nextKm / 1000} KM — FASTER!`, 'cyan')
      r.nextKm += 1000
    }

    // zones: every new map is entered through a Demogorgon portal
    if (this.portalSeg < 0) {
      const next = this.track.segments.find((sg) => sg.idx > r.segIdx && sg.zone !== ZONES[r.zone])
      if (next) {
        this.portalSeg = next.idx
        this.portal.place(next.toWorld(PORTAL_S, 0, 0, this.tmp), next.yaw, next.zone.id)
      }
    }
    let pullTarget = 0
    if (this.portalSeg >= 0) {
      const cur = this.track.get(r.segIdx)!
      const ahead =
        this.portalSeg === r.segIdx ? PORTAL_S - r.s : this.portalSeg === r.segIdx + 1 ? cur.length - r.s + PORTAL_S : Infinity
      if (ahead < 90) this.portal.open()
      if (this.portalSeg === r.segIdx && ahead < PORTAL_PULL) {
        if (!this.portalLock) {
          this.portalLock = true
          this.cb.onToast('THE RIFT PULLS YOU IN', 'red')
          haptic('medium')
        }
        r.lane = 0
        pullTarget = THREE.MathUtils.smoothstep(1 - ahead / PORTAL_PULL, 0, 1)
      }
      if (ahead <= 0) this.enterPortal()
    }
    // dive in quickly, ease back out slowly once through so the camera never backs out through the wall
    this.portalFx += (pullTarget - this.portalFx) * Math.min(1, dt * (pullTarget > this.portalFx ? 6 : 1.4))

    // Vecna's curse: distorts the world and reverses lane controls
    r.curseT = Math.max(0, r.curseT - dt)
    if (ZONES[r.zone].id === 'vecna') {
      r.nextCurse -= dt
      if (r.nextCurse <= 0) {
        r.curseT = CURSE_TIME
        r.nextCurse = 11 + Math.random() * 7
        this.cb.onToast('VECNA’S CURSE — CONTROLS REVERSED', 'red')
        this.cb.onFlash('hit', 0.6)
        this.audio.roar()
        haptic('heavy')
      }
    }

    // Eleven's telekinesis: obstacles ahead are ripped off the track
    r.tkT = Math.max(0, r.tkT - dt)
    if (r.tkT > 0) {
      for (const sg of this.track.segments) {
        if (sg.idx !== r.segIdx && sg.idx !== r.segIdx + 1) continue
        for (const o of sg.obstacles) {
          if (o.hit || o.kind === 'gap') continue
          const ahead = sg.idx === r.segIdx ? o.s - r.s : seg.length - r.s + o.s
          if (ahead < 0 || ahead > 16) continue
          o.hit = true
          this.smash(o, sg, '#c58bff')
          r.score += 25 * r.mult
          this.shake = Math.max(this.shake, 0.15)
        }
      }
    }

    // lanes
    const tx = r.lane * LANE_W
    r.x += (tx - r.x) * (1 - Math.exp(-dt * 16))

    // turn buffering + hint
    if (r.pendingTurn) {
      r.pendingTurn.t -= dt
      if (r.pendingTurn.t <= 0) r.pendingTurn = null
      else if (this.tryTurn(r.pendingTurn.dir)) seg = this.track.get(r.segIdx)!
    }
    if (r.hinted < 2 && r.turnsDone === r.hinted && seg.length - r.s < 26 && seg.length - r.s > 4) {
      r.hinted++
      this.cb.onToast(seg.turn < 0 ? 'SWIPE LEFT TO TURN' : 'SWIPE RIGHT TO TURN', 'cyan')
    }

    // corner wall
    if (r.s > seg.length + HALF_W - 0.9) {
      const alive = this.loseLife('wall')
      if (!alive) return
      this.doTurn(true)
      seg = this.track.get(r.segIdx)!
    }

    // vertical / gaps
    const overGap = seg.gaps.some(([a, b]) => r.s > a + 0.3 && r.s < b - 0.3)
    if (r.fallT > 0) {
      r.fallT += dt
      r.vy -= GRAVITY * dt
      r.y += r.vy * dt
      if (r.fallT > 0.6) {
        r.fallT = 0
        const alive = this.loseLife('fall')
        if (!alive) return
        const gap = seg.gaps.find(([a, b]) => r.s > a - 2 && r.s < b + 4)
        if (gap) r.s = Math.max(r.s, gap[1] + 1.2)
        r.y = 0
        r.vy = 0
      }
    } else {
      if (r.y > 0 || r.vy > 0) {
        r.vy -= GRAVITY * dt
        r.y += r.vy * dt
        if (r.y <= 0 && !overGap) {
          r.y = 0
          r.vy = 0
        }
      }
      if (r.y <= 0 && overGap) {
        if (r.shieldT > 0) {
          r.vy = JUMP_V * 0.8
          r.y = 0.01
        } else {
          r.fallT = 0.001
          r.vy = 0
          this.audio.slide()
        }
      }
    }

    // obstacles
    for (const o of seg.obstacles) {
      if (o.kind === 'gap' || o.hit) continue
      if (Math.abs(r.s - o.s) > o.depth / 2 + 0.3) continue
      let overlap = false
      if (o.lanes === null) overlap = true
      else if (o.kind === 'dog') overlap = Math.abs(r.x - (o.dogX ?? 0)) < 1.0
      else if (o.kind === 'zombie') overlap = !!o.lurk && Math.abs(r.x - o.lurk.x) < 1.0
      else if (o.kind === 'roots' && (!o.lurk || o.lurk.t < 0.45)) overlap = false
      else overlap = o.lanes.some((l) => Math.abs(r.x - l * LANE_W) < 1.25)
      if (!overlap) continue
      const cleared = (o.slideClears && r.slideT > 0) || r.y > o.clearY
      if (cleared) continue
      o.hit = true
      if (r.shieldT > 0) {
        this.smash(o, seg)
        r.score += 50 * r.mult
        this.shake = 0.25
        haptic('medium')
        continue
      }
      if (r.invulnT > 0) continue
      this.smash(o, seg)
      if (!this.loseLife('hit')) return
    }

    // dogs
    for (const sg of this.track.segments) {
      if (sg.idx < r.segIdx || sg.idx > r.segIdx + 1) continue
      for (const o of sg.obstacles) {
        if (o.kind !== 'dog' || !o.dog) continue
        o.dogPhase = (o.dogPhase ?? 0) + dt * 1.7
        o.dogX = Math.sin(o.dogPhase) * LANE_W
        if (sg.idx === r.segIdx && o.s - r.s < 32 && o.s - r.s > -2) o.s -= dt * 6
        o.object.position.set(o.dogX, 0, -o.s)
        o.dog.root.rotation.y = Math.PI + Math.cos(o.dogPhase) * 0.6
        o.dog.update(dt)
      }
    }

    // lawn ambushes: roots and zombies stay buried until the runner is close, then burst out
    const lurkReach = Math.max(30, r.speed * 1.9)
    for (const sg of this.track.segments) {
      if (sg.idx !== r.segIdx) continue
      for (const o of sg.obstacles) {
        if (!o.lurk || (o.kind !== 'roots' && o.kind !== 'zombie')) continue
        const ahead = o.s - r.s
        if (o.lurk.t < 0) {
          if (o.hit || ahead > lurkReach || ahead < 0) continue
          o.lurk.t = 0
          o.object.visible = true
          this.jumpscare(sg, o)
        }
        if (!o.object.visible) continue
        updateLurker(o.kind, o.object, o.lurk, dt, this.time)
        if (o.kind === 'zombie' && o.lurk.t > 0.75 && ahead > 1) {
          o.s -= dt * 1.4
          o.object.position.z = -o.s
        }
      }
    }

    // demobats swoop toward the runner
    for (const sg of this.track.segments) {
      if (sg.idx < r.segIdx || sg.idx > r.segIdx + 1) continue
      for (const o of sg.obstacles) {
        if (o.kind !== 'bats') continue
        if (sg.idx === r.segIdx && !o.hit && o.s - r.s < 30 && o.s - r.s > -2) o.s -= dt * 7
        o.object.position.z = -o.s
        const wings = o.object.userData.wings as THREE.Object3D[]
        wings.forEach((w, i) => (w.rotation.z = Math.sin(this.time * 22 + i) * 0.7 * Math.sign(w.scale.x)))
        o.object.children.forEach((b) => (b.position.y += Math.sin(this.time * 6 + (b.userData.phase as number)) * dt * 0.6))
      }
    }

    // coins
    const spin = this.time * 4
    const magnet = r.magnetT > 0
    for (const sg of this.track.segments) {
      if (sg.idx < r.segIdx || sg.idx > r.segIdx + 2 || !sg.coinMesh) continue
      const isCur = sg.idx === r.segIdx
      sg.coins.forEach((c, i) => {
        if (!c.taken && isCur) {
          const ds = c.s - r.s
          if (magnet && ds > -1 && ds < 16) c.fly = Math.min(1, c.fly + dt * 5)
          const near = Math.abs(ds) < 0.9 && Math.abs(c.x - r.x) < 1.05 && Math.abs(c.y - (r.y + 0.9)) < 1.25
          if (near || c.fly >= 1) {
            c.taken = true
            r.coins++
            r.score += 5 * r.mult
            this.audio.coin()
            sg.toWorld(c.s, c.x, c.y, this.tmp2)
            this.burst(this.tmp2, '#ffd34a', 4, 3)
          }
        }
        let px = c.x
        let py = c.y
        let pz = -c.s
        if (c.fly > 0 && !c.taken) {
          px += (r.x - px) * c.fly
          py += (r.y + 0.9 - py) * c.fly
          pz += (-r.s - pz) * c.fly
        }
        this.tmpQ.setFromAxisAngle(this.up, spin + c.s * 0.3)
        this.tmpS.setScalar(c.taken ? 0 : 1)
        this.tmpM.compose(this.tmp2.set(px, py, pz), this.tmpQ, this.tmpS)
        sg.coinMesh!.setMatrixAt(i, this.tmpM)
      })
      sg.coinMesh.instanceMatrix.needsUpdate = true
    }

    // pickups
    for (const p of seg.pickups) {
      if (p.taken) continue
      p.object.rotation.y += dt * 2.5
      p.object.position.y = p.y + Math.sin(this.time * 3 + p.s) * 0.15
      if (Math.abs(p.s - r.s) < 1.1 && Math.abs(p.x - r.x) < 1.2 && r.y < 2.2) {
        p.taken = true
        p.object.visible = false
        this.audio.power()
        haptic('success')
        if (p.kind === 'shield') {
          r.shieldT = SHIELD_TIME
          this.cb.onToast('GATE SHIELD!', 'red')
        } else if (p.kind === 'eleven') {
          r.tkT = TK_TIME
          this.cb.onToast('ELEVEN’S TELEKINESIS!', 'gold')
          this.shake = 0.3
        } else {
          r.magnetT = MAGNET_TIME
          this.cb.onToast('WALKIE MAGNET!', 'cyan')
        }
      }
    }

    this.track.update(r.segIdx, r.speed)
  }

  // ---------------- per-frame visuals ----------------
  private animatePlayer(dt: number) {
    const r = this.r
    const player = this.player
    const pivot = player.pivot
    const seg = this.track.get(r.segIdx)!
    const playing = this.state === 'playing' || this.state === 'paused'
    const dying = this.state === 'dying' || this.state === 'over'

    seg.toWorld(r.s, r.x, Math.max(r.y, -6), this.player.root.position)
    this.playerYaw += shortAngle(this.playerYaw, seg.yaw) * Math.min(1, dt * 14)
    this.player.root.rotation.y = this.playerYaw

    // skeletal clips carry the body motion; the pivot only adds lane-change roll, stumble and the death fall
    let lean = 0
    const bob = 0
    let roll = 0
    let px = 0
    if (this.state === 'menu' || this.state === 'loading') {
      player.play('idle')
    } else if (dying) {
      player.freeze()
      lean = 1.2
    } else if (playing) {
      const airborne = r.y > 0.05 || r.fallT > 0
      const m = player.currentMotion
      if (r.slideT > 0) {
        if (m !== 'slide') player.play('slide', { duration: SLIDE_TIME * 1.35 })
      } else if (airborne) {
        if (m !== 'jump' && m !== 'fall') player.play('fall')
      } else {
        player.play('run')
        // cadence rises gently with speed so feet keep pace with the track
        player.setLoopSpeed(0.95 + Math.min(1, r.speed / 30) * 0.35)
      }
      roll += (r.lane * LANE_W - r.x) * -0.09
      if (r.stumbleT > 0) {
        roll += Math.sin(this.time * 30) * 0.15 * r.stumbleT
        px += Math.sin(this.time * 20) * 0.08 * r.stumbleT
      }
    }
    if (this.state !== 'paused') player.update(dt)
    pivot.rotation.x += (lean - pivot.rotation.x) * Math.min(1, dt * 14)
    pivot.rotation.z += (roll - pivot.rotation.z) * Math.min(1, dt * 10)
    pivot.position.y += (bob - pivot.position.y) * Math.min(1, dt * 25)
    pivot.position.x = px

    // blink while invulnerable
    const blink = r.invulnT > 0 && this.state === 'playing' ? Math.sin(this.time * 40) > 0 : true
    pivot.visible = blink
    this.player.shieldBubble.visible = r.shieldT > 0
    if (r.shieldT > 0) {
      const sc = 1 + Math.sin(this.time * 8) * 0.04
      this.player.shieldBubble.scale.setScalar(sc)
      ;(this.player.shieldBubble.material as THREE.MeshBasicMaterial).opacity = r.shieldT < 2 ? 0.1 + 0.1 * Math.sin(this.time * 20) : 0.2
    }
    // shadow stays on the deck
    this.player.shadow.position.y = -Math.max(r.y, 0) + 0.02
    this.player.shadow.visible = r.fallT === 0
    const sh = 1 / (1 + Math.max(r.y, 0) * 0.5)
    this.player.shadow.scale.setScalar(sh)
  }

  private animateDemogorgon(dt: number) {
    const r = this.r
    const p = this.player.root.position
    const lastTrail = this.trail[this.trail.length - 1]
    if (!lastTrail || r.dist - lastTrail.d > 0.05) this.trail.push({ p: p.clone().setY(0), yaw: this.playerYaw, d: r.dist })
    while (this.trail.length > 2 && this.trail[0].d < r.dist - 40) this.trail.shift()

    let chase = r.chase
    if (this.state === 'menu' || this.state === 'loading') chase = 7.5 + Math.sin(this.time * 0.6) * 0.5
    if (this.state === 'dying' || this.state === 'over') {
      r.chase += (0.9 - r.chase) * Math.min(1, dt * 5)
      chase = r.chase
    }

    if (this.state === 'playing') chase = Math.max(1.6, chase - this.demo.surge)
    const target = r.dist - chase
    let pos: THREE.Vector3 | null = null
    let yaw = this.playerYaw
    for (let i = this.trail.length - 1; i > 0; i--) {
      const a = this.trail[i - 1]
      const b = this.trail[i]
      if (a.d <= target && b.d >= target) {
        const t = b.d === a.d ? 0 : (target - a.d) / (b.d - a.d)
        pos = this.tmp.copy(a.p).lerp(b.p, t)
        yaw = a.yaw + shortAngle(a.yaw, b.yaw) * t
        break
      }
    }
    if (!pos) {
      const fwd = this.tmp2.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw))
      pos = this.tmp.copy(p).setY(0).addScaledVector(fwd, -chase)
    }
    const menu = this.state === 'menu' || this.state === 'loading'
    const finale = this.state === 'dying' || this.state === 'over'
    const sideTarget = menu || finale ? 0 : r.x > 0.3 ? -1.7 : 1.7
    this.demoSide += (sideTarget - this.demoSide) * Math.min(1, dt * 3)
    pos.x += Math.cos(yaw) * this.demoSide
    pos.z += -Math.sin(yaw) * this.demoSide
    this.demo.root.position.copy(pos)
    this.demo.root.rotation.y = yaw
    const moving = this.state === 'playing' || this.state === 'dying'
    const roar = this.state === 'dying' || this.state === 'over' ? 1 : this.state === 'menu' ? 0.5 + Math.sin(this.time * 0.8) * 0.5 : r.roar
    this.demo.update(moving ? dt : dt * 0.15, moving ? r.speed : 0, roar)
    this.demo.root.visible = this.state !== 'loading' && chase < 12
  }

  private updateCamera(dt: number) {
    const r = this.r
    const seg = this.track.get(r.segIdx)!
    this.camYaw += shortAngle(this.camYaw, seg.yaw) * Math.min(1, dt * 7)
    const fwd = this.tmp2.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw))
    const p = this.player.root.position
    const yOff = Math.max(-3, r.y * 0.35)

    // portal dive: drop to the runner's shoulder and close in so the camera follows her through the rift
    const fx = this.portalFx
    const chasePos = this.chasePos.set(p.x, 0, p.z).addScaledVector(fwd, -6.3 + 3.6 * fx)
    chasePos.y = 3.3 - 1.75 * fx + yOff
    const chaseLook = this.chaseLook.set(p.x, 1.1 + 0.3 * fx + yOff * 0.6, p.z).addScaledVector(fwd, 6)

    if (this.state === 'menu' || this.state === 'loading') this.intro = 0
    else this.intro = Math.min(1, this.intro + dt * 1.1)

    const a = this.time * 0.25
    const side = this.side.set(-fwd.z, 0, fwd.x)
    const menuPos = this.menuPos
      .set(p.x, 1.4, p.z)
      .addScaledVector(fwd, 3.6)
      .addScaledVector(side, Math.sin(a) * 1.6)
    const menuLook = this.menuLook.set(p.x, 1.25, p.z).addScaledVector(fwd, -2.5)

    const t = this.intro * this.intro * (3 - 2 * this.intro)
    this.camPos.copy(menuPos).lerp(chasePos, t)
    this.camLook.copy(menuLook).lerp(chaseLook, t)

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5)
      const k = this.shake * 0.35
      this.camPos.x += (Math.random() - 0.5) * k
      this.camPos.y += (Math.random() - 0.5) * k
    }
    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camLook)
    const curse = Math.min(1, r.curseT / 0.6) * Math.min(1, (CURSE_TIME - r.curseT + 0.01) / 0.4)
    this.env.curse = curse
    if (curse > 0) this.camera.rotateZ(Math.sin(this.time * 2.4) * 0.16 * curse)
    const targetFov = 60 + Math.min(1, (r.speed - 12) / 20) * 12 * t + Math.sin(this.time * 4.5) * 7 * curse + 20 * fx * t
    if (fx > 0.01) this.camera.rotateZ(Math.sin(this.time * 7) * 0.05 * fx)
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3)
    this.camera.updateProjectionMatrix()

    // lights follow the runner
    this.keyLight.position.copy(p).addScaledVector(fwd, -3).setY(p.y + 3.5)
    this.rimLight.position.copy(p).addScaledVector(fwd, 5).setY(p.y + 2.2)
  }

  private updateParticles(dt: number) {
    let n = 0
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i]
      pt.life += dt
      if (pt.life >= pt.max) {
        this.particles.splice(i, 1)
        continue
      }
      pt.v.y -= 14 * dt
      pt.p.addScaledVector(pt.v, dt)
    }
    for (const pt of this.particles) {
      const k = 1 - pt.life / pt.max
      this.tmpS.setScalar(pt.size * k)
      this.tmpQ.identity()
      this.tmpM.compose(pt.p, this.tmpQ, this.tmpS)
      this.debris.setMatrixAt(n, this.tmpM)
      this.debris.setColorAt(n, pt.color)
      n++
    }
    this.debris.count = n
    this.debris.instanceMatrix.needsUpdate = true
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true
  }

  private ambient() {
    const t = this.time
    this.assets.bulb.color.setScalar(Math.sin(t * 5) > -0.3 ? 1 : 0.45)
    this.assets.flesh.emissiveIntensity = 0.35 + Math.sin(t * 3) * 0.15
    this.assets.rift.opacity = 0.75 + Math.sin(t * 9) * 0.2
    this.assets.laser.opacity = 0.7 + Math.sin(t * 31) * 0.25
    this.assets.policeLight.color.set(Math.sin(t * 8) > 0 ? '#2a6aff' : '#ff2a2a')
    this.track.kit.update(t)
    for (const m of this.assets.neon) {
      if (Math.random() < 0.004) m.opacity = 0.25
      else m.opacity += (1 - m.opacity) * 0.2
    }
  }

  private emitHud() {
    const r = this.r
    this.cb.onHud({
      score: Math.floor(r.score),
      coins: r.coins,
      lives: Math.max(0, r.lives),
      distance: r.dist,
      multiplier: r.mult,
      shield: r.shieldT / SHIELD_TIME,
      magnet: r.magnetT / MAGNET_TIME,
      danger: THREE.MathUtils.clamp(1 - (r.chase - 3.2) / 6, 0, 1),
      tk: r.tkT / TK_TIME,
      zone: ZONES[r.zone].name,
      cursed: r.curseT > 0,
    })
  }

  /** keeps the frame rate smooth: render fewer pixels when frames run long, and creep back up when there is headroom */
  private adaptQuality(ms: number) {
    if (this.state !== 'playing') return
    this.frameMs += (Math.min(ms, 80) - this.frameMs) * 0.06
    this.qualityCool -= ms / 1000
    this.upscaleCool -= ms / 1000
    if (this.qualityCool > 0) return
    // only steps in when the game is truly struggling (under ~30fps) and never drops below native-ish sharpness
    if (this.frameMs > 34 && this.pr > MIN_PR) {
      this.pr = Math.max(MIN_PR, this.pr * 0.9)
      this.upscaleCool = 8
    } else if (this.frameMs < 20 && this.pr < this.maxPR && this.upscaleCool <= 0) {
      this.pr = Math.min(this.maxPR, this.pr * 1.1)
      this.upscaleCool = 8
    } else return
    this.qualityCool = 1.5
    this.renderer.setPixelRatio(this.pr)
    this.resize()
  }

  private loop = (now: number) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    if (this.last) this.adaptQuality(now - this.last)
    const dt = Math.min(1 / 30, this.last ? (now - this.last) / 1000 : 0.016)
    this.last = now
    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.camera)
      return
    }
    this.time += dt
    if (this.state === 'playing' && this.intro > 0.35) this.update(dt)
    else if (this.state === 'playing') {
      this.r.chase += (3.4 - this.r.chase) * Math.min(1, dt * 4)
    }
    this.animatePlayer(dt)
    this.animateDemogorgon(dt)
    this.updateCamera(dt)
    this.updateParticles(dt)
    this.ambient()
    const fwd = this.tmp2.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw))
    this.zoneT = Math.min(1, this.zoneT + dt * 1.5)
    this.env.applyZone(ZONES[this.zoneFrom], ZONES[this.zoneTo], THREE.MathUtils.smoothstep(this.zoneT, 0, 1))
    this.portal.update(dt)
    this.env.update(dt, this.time, this.camera, fwd, Math.min(1, this.r.dist / 3000))
    this.hudT += dt
    if (this.hudT > 0.2 && this.state === 'playing') {
      this.hudT = 0
      this.emitHud()
    }
    this.renderer.render(this.scene, this.camera)
  }

  /** dev-only helper: fast-forward the simulation without rendering */
  simulate(seconds: number) {
    const step = 1 / 60
    for (let t = 0; t < seconds && this.state === 'playing'; t += step) {
      this.time += step
      this.intro = 1
      this.update(step)
      this.animatePlayer(step)
      this.animateDemogorgon(step)
      this.updateCamera(step)
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.audio.ctx?.close()
    this.input.dispose()
    window.removeEventListener('resize', this.resize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
