import * as THREE from 'three'
import { Assets, HALF_W, LANE_W } from './props'
import { Demodog } from './demogorgon'

export const DIRS = [new THREE.Vector2(0, -1), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1), new THREE.Vector2(-1, 0)]

export type ObstacleKind = 'vines' | 'arch' | 'gap' | 'barrels' | 'car' | 'pillar' | 'dog'

export interface Obstacle {
  kind: ObstacleKind
  s: number
  depth: number
  /** lane indices (-1,0,1). null means full width */
  lanes: number[] | null
  /** player feet must be above this to clear by jumping; Infinity = cannot jump */
  clearY: number
  /** true when sliding clears it */
  slideClears: boolean
  object: THREE.Object3D
  hit: boolean
  dog?: Demodog
  dogX?: number
  dogPhase?: number
}

export interface Coin {
  s: number
  x: number
  y: number
  taken: boolean
  fly: number
}

export type PickupKind = 'shield' | 'magnet'

export interface Pickup {
  kind: PickupKind
  s: number
  x: number
  y: number
  taken: boolean
  object: THREE.Object3D
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export class Segment {
  idx: number
  start: THREE.Vector2
  dir: number
  length: number
  turn: number
  prevTurn: number
  group = new THREE.Group()
  obstacles: Obstacle[] = []
  coins: Coin[] = []
  coinMesh: THREE.InstancedMesh | null = null
  pickups: Pickup[] = []
  gaps: [number, number][] = []
  bulbs: THREE.InstancedMesh[] = []
  private owned: THREE.BufferGeometry[] = []
  private instanced: THREE.InstancedMesh[] = []

  constructor(idx: number, start: THREE.Vector2, dir: number, length: number, turn: number, prevTurn: number) {
    this.idx = idx
    this.start = start
    this.dir = dir
    this.length = length
    this.turn = turn
    this.prevTurn = prevTurn
    this.group.position.set(start.x, 0, start.y)
    this.group.rotation.y = -dir * (Math.PI / 2)
  }

  get fwd() {
    return DIRS[this.dir]
  }
  get right() {
    return DIRS[(this.dir + 1) % 4]
  }
  get yaw() {
    return -this.dir * (Math.PI / 2)
  }
  get end() {
    return this.start.clone().add(this.fwd.clone().multiplyScalar(this.length))
  }

  toWorld(s: number, x: number, y: number, out: THREE.Vector3) {
    const f = this.fwd
    const r = this.right
    return out.set(this.start.x + f.x * s + r.x * x, y, this.start.y + f.y * s + r.y * x)
  }

  own(g: THREE.BufferGeometry) {
    this.owned.push(g)
    return g
  }

  addInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], colors?: THREE.Color[]) {
    if (!matrices.length) return null
    const m = new THREE.InstancedMesh(geo, mat, matrices.length)
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx))
    if (colors) colors.forEach((c, i) => m.setColorAt(i, c))
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    this.group.add(m)
    this.instanced.push(m)
    return m
  }

  dispose() {
    this.owned.forEach((g) => g.dispose())
    this.instanced.forEach((m) => m.dispose())
    this.coinMesh?.dispose()
    this.group.removeFromParent()
  }
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpS = new THREE.Vector3()
const tmpP = new THREE.Vector3()

function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
  return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz))
}

const BULB_COLORS = ['#ff2a2a', '#2aff6a', '#2a8cff', '#ffd02a', '#ff7a1a', '#ff2fd0'].map((c) => new THREE.Color(c))

export class Track {
  scene: THREE.Scene
  assets: Assets
  segments: Segment[] = []
  heading = 0
  distCursor = 0
  haloCyan: THREE.SpriteMaterial
  haloRed: THREE.SpriteMaterial

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene
    this.assets = assets
    this.haloRed = assets.halo.clone()
    this.haloCyan = assets.halo.clone()
    this.haloCyan.color.set('#36e3ff')
  }

  reset() {
    this.segments.forEach((s) => s.dispose())
    this.segments = []
    this.heading = 0
    this.distCursor = 0
    this.append(14)
    this.append(14)
    this.append(14)
  }

  get(idx: number) {
    return this.segments.find((s) => s.idx === idx)
  }

  update(curIdx: number, speedEst: number) {
    while (this.segments[this.segments.length - 1].idx < curIdx + 3) this.append(speedEst)
    while (this.segments.length && this.segments[0].idx < curIdx - 1) {
      this.segments.shift()!.dispose()
    }
  }

  private append(speedEst: number) {
    const prev = this.segments[this.segments.length - 1]
    const idx = prev ? prev.idx + 1 : 0
    const dir = prev ? (prev.dir + prev.turn + 4) % 4 : 0
    const start = prev ? prev.end : new THREE.Vector2(0, 0)
    const d = Math.min(1, this.distCursor / 5000)
    const length = idx === 0 ? 150 : Math.round(lerp(rand(95, 150), rand(55, 95), d))
    const options = [-1, 1].filter((t) => Math.abs(this.heading + t) <= 1)
    const turn = pick(options)
    this.heading += turn
    const seg = new Segment(idx, start, dir, length, turn, prev ? prev.turn : 0)
    this.populate(seg, d, speedEst)
    this.build(seg)
    this.scene.add(seg.group)
    this.segments.push(seg)
    this.distCursor += length
  }

  // ---------- obstacle & coin generation ----------
  private populate(seg: Segment, d: number, speedEst: number) {
    const L = seg.length
    const dist = this.distCursor
    let s = seg.idx === 0 ? 48 : HALF_W + 16
    const endS = L - HALF_W - 14
    const speed = Math.max(speedEst, 14)
    while (s < endS) {
      const local = dist + s
      const reaction = lerp(1.35, 0.62, d)
      const used = this.pattern(seg, s, local, speed, endS)
      s += used + speed * reaction + rand(0, 6 * (1 - d))
    }
    // coin trail into the corner to guide the turn
    const lane = 0
    for (let i = 0; i < 5; i++) {
      const cs = L - HALF_W - 10 + i * 1.8
      if (cs > s - 8) seg.coins.push({ s: cs, x: lane * LANE_W, y: 0.9, taken: false, fly: 0 })
    }
  }

  private coinLine(seg: Segment, s0: number, s1: number, lane: number, y = 0.9) {
    for (let s = s0; s <= s1; s += 1.7) seg.coins.push({ s, x: lane * LANE_W, y, taken: false, fly: 0 })
  }

  private coinArc(seg: Segment, center: number, lane: number, span: number, base = 0.9, h = 1.5) {
    const n = 7
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      seg.coins.push({
        s: center - span / 2 + t * span,
        x: lane * LANE_W,
        y: base + Math.sin(t * Math.PI) * h,
        taken: false,
        fly: 0,
      })
    }
  }

  private add(seg: Segment, o: Omit<Obstacle, 'hit'>) {
    seg.obstacles.push({ ...o, hit: false })
  }

  private pattern(seg: Segment, s: number, dist: number, speed: number, endS: number): number {
    const lanes = [-1, 0, 1]
    const types: [string, number][] = [
      ['vines', 3],
      ['arch', 3],
      ['block1', 3],
      ['coins', 1.5],
    ]
    if (dist > 250) types.push(['gap', 2.5])
    if (dist > 350) types.push(['block2', 3])
    if (dist > 500) types.push(['barrels3', 2])
    if (dist > 700) types.push(['barrelsBlock', 2.2])
    if (dist > 900) types.push(['archVines', 2])
    if (dist > 1100) types.push(['dog', 2.4])
    if (dist > 1400) types.push(['zigzag', 2.2])
    if (dist > 2000) types.push(['gapArch', 1.8], ['dogBlock', 1.8])
    const total = types.reduce((a, [, w]) => a + w, 0)
    let r = Math.random() * total
    let type = types[0][0]
    for (const [t, w] of types) {
      r -= w
      if (r <= 0) {
        type = t
        break
      }
    }

    const freeLane = pick(lanes)
    let used = 2

    switch (type) {
      case 'coins': {
        this.coinLine(seg, s, s + 14, freeLane)
        used = 14
        break
      }
      case 'vines': {
        this.add(seg, this.vines(seg, s))
        this.coinArc(seg, s, freeLane, 8)
        break
      }
      case 'arch': {
        this.add(seg, this.arch(seg, s))
        this.coinLine(seg, s - 5, s + 5, freeLane, 0.55)
        break
      }
      case 'gap': {
        const len = rand(3.2, 4.6)
        this.add(seg, this.gap(seg, s, len))
        this.coinArc(seg, s + len / 2, freeLane, len + 6, 0.9, 1.6)
        used = len
        break
      }
      case 'block1': {
        const blocked = pick(lanes)
        this.add(seg, Math.random() < 0.5 ? this.car(seg, s, blocked) : this.pillar(seg, s, blocked))
        const free = lanes.filter((l) => l !== blocked)
        this.coinLine(seg, s - 6, s + 6, pick(free))
        break
      }
      case 'block2': {
        const open = pick(lanes)
        for (const l of lanes) if (l !== open) this.add(seg, Math.random() < 0.5 ? this.car(seg, s, l) : this.pillar(seg, s, l))
        this.coinLine(seg, s - 8, s + 4, open)
        break
      }
      case 'barrels3': {
        for (const l of lanes) this.add(seg, this.barrels(seg, s, l))
        this.coinArc(seg, s, freeLane, 8)
        break
      }
      case 'barrelsBlock': {
        const tall = pick(lanes)
        for (const l of lanes) this.add(seg, l === tall ? this.car(seg, s, l) : this.barrels(seg, s, l))
        const free = lanes.filter((l) => l !== tall)
        this.coinArc(seg, s, pick(free), 8)
        break
      }
      case 'archVines': {
        const gapD = Math.max(7, speed * 0.6)
        if (s + gapD > endS) {
          this.add(seg, this.arch(seg, s))
          break
        }
        this.add(seg, this.arch(seg, s))
        this.add(seg, this.vines(seg, s + gapD))
        this.coinArc(seg, s + gapD, freeLane, 7)
        used = gapD
        break
      }
      case 'gapArch': {
        const len = rand(3.2, 4.2)
        const gapD = Math.max(8, speed * 0.65)
        this.add(seg, this.gap(seg, s, len))
        if (s + len + gapD < endS) this.add(seg, this.arch(seg, s + len + gapD))
        used = len + gapD
        break
      }
      case 'dog': {
        this.add(seg, this.dog(seg, s + 10))
        this.coinLine(seg, s - 4, s + 4, freeLane)
        used = 10
        break
      }
      case 'dogBlock': {
        const blocked = pick(lanes)
        this.add(seg, this.pillar(seg, s, blocked))
        if (s + 14 < endS) this.add(seg, this.dog(seg, s + 14))
        used = 14
        break
      }
      case 'zigzag': {
        const a = pick(lanes)
        const b = pick(lanes.filter((l) => l !== a))
        const gapD = Math.max(8, speed * 0.55)
        this.add(seg, this.car(seg, s, a))
        this.add(seg, this.pillar(seg, s, b === 0 ? -a : 0))
        if (s + gapD < endS) {
          this.add(seg, this.car(seg, s + gapD, b))
        }
        used = gapD
        break
      }
    }

    if (dist > 300 && Math.random() < 0.1) {
      const kind: PickupKind = Math.random() < 0.5 ? 'shield' : 'magnet'
      seg.pickups.push(this.pickup(seg, kind, s - 7, freeLane))
    }
    return used
  }

  // ---------- obstacle builders ----------
  private place(seg: Segment, obj: THREE.Object3D, s: number, x = 0) {
    obj.position.set(x, 0, -s)
    seg.group.add(obj)
    return obj
  }

  private vines(seg: Segment, s: number): Omit<Obstacle, 'hit'> {
    const m = new THREE.Mesh(pick(this.assets.vineGeos), this.assets.flesh)
    return { kind: 'vines', s, depth: 0.7, lanes: null, clearY: 0.72, slideClears: false, object: this.place(seg, m, s) }
  }

  private arch(seg: Segment, s: number): Omit<Obstacle, 'hit'> {
    const g = new THREE.Group()
    if (Math.random() < 0.35) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(this.assets.postGeo, this.assets.woodDark)
        post.scale.set(1.2, 2.6, 1.2)
        post.position.set(side * (HALF_W + 0.3), 1.8, 0)
        g.add(post)
      }
      const board = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 1, 1.0, 0.12), this.assets.runBoard)
      seg.own(board.geometry)
      board.position.y = 1.95
      g.add(board)
      const bulbs: THREE.Matrix4[] = []
      const cols: THREE.Color[] = []
      for (let i = 0; i < 18; i++) {
        const x = -HALF_W + (i / 17) * HALF_W * 2
        bulbs.push(mat(x, 1.38 + Math.abs(Math.sin(i * 0.7)) * 0.08, 0.1))
        cols.push(BULB_COLORS[i % BULB_COLORS.length])
      }
      const inst = new THREE.InstancedMesh(this.assets.bulbGeo, this.assets.bulb, bulbs.length)
      bulbs.forEach((b, i) => inst.setMatrixAt(i, b))
      cols.forEach((c, i) => inst.setColorAt(i, c))
      g.add(inst)
    } else {
      g.add(new THREE.Mesh(pick(this.assets.tendrilGeos), this.assets.flesh))
    }
    return { kind: 'arch', s, depth: 0.8, lanes: null, clearY: Infinity, slideClears: true, object: this.place(seg, g, s) }
  }

  private gap(seg: Segment, s: number, len: number): Omit<Obstacle, 'hit'> {
    seg.gaps.push([s, s + len])
    const g = new THREE.Group()
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, len), this.assets.rift)
    seg.own(glow.geometry)
    glow.rotation.x = -Math.PI / 2
    glow.position.set(0, -3.2, -len / 2)
    g.add(glow)
    for (let i = 0; i < 3; i++) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 3), this.assets.riftGlow)
      seg.own(sheet.geometry)
      sheet.position.set(0, -1.5, -len * (0.2 + i * 0.3))
      g.add(sheet)
    }
    for (const edge of [0, len]) {
      const lip = new THREE.Mesh(pick(this.assets.vineGeos), this.assets.fleshDark)
      lip.position.set(0, -0.55, -edge)
      lip.scale.set(1, 0.6, 1)
      g.add(lip)
    }
    return { kind: 'gap', s: s + len / 2, depth: len, lanes: null, clearY: 0, slideClears: false, object: this.place(seg, g, s) }
  }

  private car(seg: Segment, s: number, lane: number): Omit<Obstacle, 'hit'> {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(this.assets.carBody, this.assets.car))
    g.add(new THREE.Mesh(this.assets.carGlass, this.assets.carDark))
    for (const x of [-0.65, 0.65]) {
      const t = new THREE.Mesh(this.assets.bulbGeo, this.assets.tail)
      t.scale.set(2.2, 1.2, 1)
      t.position.set(x, 0.85, 1.92)
      g.add(t)
      const h = new THREE.Mesh(this.assets.bulbGeo, this.assets.head)
      h.scale.set(2, 2, 1)
      h.position.set(x, 0.75, -1.92)
      g.add(h)
    }
    g.rotation.y = Math.PI + rand(-0.12, 0.12)
    g.rotation.z = rand(-0.06, 0.06)
    this.place(seg, g, s, lane * LANE_W)
    return { kind: 'car', s, depth: 3.6, lanes: [lane], clearY: Infinity, slideClears: false, object: g }
  }

  private pillar(seg: Segment, s: number, lane: number): Omit<Obstacle, 'hit'> {
    const m = new THREE.Mesh(this.assets.pillarGeo, this.assets.flesh)
    m.rotation.y = Math.random() * Math.PI
    this.place(seg, m, s, lane * LANE_W)
    return { kind: 'pillar', s, depth: 1.2, lanes: [lane], clearY: Infinity, slideClears: false, object: m }
  }

  private barrels(seg: Segment, s: number, lane: number): Omit<Obstacle, 'hit'> {
    const g = new THREE.Group()
    for (const dx of [-0.45, 0.45]) {
      const b = new THREE.Mesh(this.assets.barrelGeo, this.assets.barrel)
      b.position.set(dx, 0.52, rand(-0.15, 0.15))
      b.rotation.y = Math.random() * 6
      g.add(b)
    }
    this.place(seg, g, s, lane * LANE_W)
    return { kind: 'barrels', s, depth: 0.9, lanes: [lane], clearY: 1.0, slideClears: false, object: g }
  }

  private dog(seg: Segment, s: number): Omit<Obstacle, 'hit'> {
    const dog = new Demodog()
    dog.root.rotation.y = Math.PI
    const holder = new THREE.Group()
    holder.add(dog.root)
    this.place(seg, holder, s, 0)
    return {
      kind: 'dog',
      s,
      depth: 1.3,
      lanes: [],
      clearY: 0.85,
      slideClears: false,
      object: holder,
      dog,
      dogX: 0,
      dogPhase: Math.random() * Math.PI * 2,
    }
  }

  private pickup(seg: Segment, kind: PickupKind, s: number, lane: number): Pickup {
    const g = new THREE.Group()
    if (kind === 'shield') {
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), this.assets.shieldOrb))
      const halo = new THREE.Sprite(this.haloRed)
      halo.scale.setScalar(1.8)
      g.add(halo)
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.14), this.assets.magnetBody)
      g.add(body)
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45), this.assets.magnetBody)
      ant.position.set(0.1, 0.48, 0)
      g.add(ant)
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.16), this.assets.magnetGlow)
      led.position.y = 0.12
      g.add(led)
      const halo = new THREE.Sprite(this.haloCyan)
      halo.scale.setScalar(1.8)
      g.add(halo)
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).geometry) seg.own((o as THREE.Mesh).geometry)
    })
    const y = 1.0
    g.position.set(lane * LANE_W, y, -s)
    seg.group.add(g)
    return { kind, s, x: lane * LANE_W, y, taken: false, object: g }
  }

  // ---------- static geometry ----------
  private build(seg: Segment) {
    const a = this.assets
    const L = seg.length
    const first = seg.idx === 0
    const s0 = first ? -30 : HALF_W
    const s1 = L + HALF_W

    // floor pieces split around gaps
    const ranges: [number, number][] = []
    let cur = s0
    const gaps = [...seg.gaps].sort((x, y) => x[0] - y[0])
    for (const [g0, g1] of gaps) {
      ranges.push([cur, g0])
      cur = g1
    }
    ranges.push([cur, s1])
    for (const [r0, r1] of ranges) {
      const len = r1 - r0
      if (len <= 0.05) continue
      const geo = seg.own(new THREE.BoxGeometry(HALF_W * 2, 0.3, len))
      const uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 4.4))
      const m = new THREE.Mesh(geo, a.wood)
      m.position.set(0, -0.15, -(r0 + r1) / 2)
      seg.group.add(m)
    }

    const inGap = (s: number, pad = 0) => gaps.some(([g0, g1]) => s > g0 - pad && s < g1 + pad)
    const omit = (side: number, s: number) => {
      if (inGap(s, 0.4)) return true
      if (side === seg.turn && s > L - HALF_W - 0.2) return true
      return false
    }

    // supports
    const supports: THREE.Matrix4[] = []
    for (let s = s0 + 1; s < s1; s += 6) {
      if (inGap(s, 1)) continue
      supports.push(mat(-HALF_W + 0.3, -2.4, -s), mat(HALF_W - 0.3, -2.4, -s))
    }
    seg.addInstanced(a.supportGeo, a.woodDark, supports)

    // railings
    const posts: THREE.Matrix4[] = []
    const rails: THREE.Matrix4[] = []
    const span = 2.5
    for (const side of [-1, 1]) {
      const x = side * (HALF_W + 0.05)
      for (let s = s0; s < s1 - 0.2; s += span) {
        if (omit(side, s) || omit(side, s + span)) continue
        if (Math.random() < 0.9) posts.push(mat(x, 0.7, -s, rand(-0.08, 0.08), 0, rand(-0.12, 0.12)))
        if (Math.random() < 0.85) rails.push(mat(x, 1.25 + rand(-0.06, 0.06), -(s + span / 2), rand(-0.05, 0.05), 0, 0, 1, 1, span))
      }
    }
    // end barrier
    const be = L + HALF_W
    for (let x = -HALF_W; x <= HALF_W + 0.01; x += span) posts.push(mat(x, 0.7, -be))
    rails.push(mat(0, 1.25, -be, 0, Math.PI / 2, 0, 1, 1, HALF_W * 2))
    rails.push(mat(0, 0.7, -be, 0, Math.PI / 2, 0, 1, 1, HALF_W * 2))
    seg.addInstanced(a.postGeo, a.woodDark, posts)
    seg.addInstanced(a.railGeo, a.woodDark, rails)

    const arrow = new THREE.Mesh(a.arrowGeo, a.arrow)
    arrow.position.set(0, 2.2, -be + 0.2)
    arrow.scale.setScalar(1.3)
    if (seg.turn < 0) arrow.rotation.z = Math.PI
    seg.group.add(arrow)

    // christmas lights on a rail
    const bulbM: THREE.Matrix4[] = []
    const bulbC: THREE.Color[] = []
    const lightSide = Math.random() < 0.5 ? -1 : 1
    for (let s = s0; s < s1; s += 0.6) {
      if (omit(lightSide, s)) continue
      const sag = Math.abs(Math.sin((s / span) * Math.PI)) * 0.25
      bulbM.push(mat(lightSide * (HALF_W + 0.05), 1.18 - sag, -s))
      bulbC.push(BULB_COLORS[Math.floor(Math.random() * BULB_COLORS.length)])
    }
    const bulbs = seg.addInstanced(a.bulbGeo, a.bulb, bulbM, bulbC)
    if (bulbs) seg.bulbs.push(bulbs)

    // vines creeping on rails
    for (let i = 0; i < Math.floor(L / 25); i++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const s = rand(s0 + 5, L - 12)
      if (omit(side, s) || omit(side, s + 9)) continue
      const v = new THREE.Mesh(pick(a.railVineGeos), a.flesh)
      v.position.set(side * (HALF_W + 0.1), 0, -s)
      seg.group.add(v)
    }

    // scenery: trees
    const treeMats: THREE.Matrix4[][] = a.treeGeos.map(() => [])
    const blocked = (side: number, s: number) =>
      (side === seg.turn && s > L - HALF_W - 6) || (side === seg.prevTurn && s < HALF_W + 6)
    for (let s = s0; s < L + 24; s += rand(3.5, 7)) {
      for (const side of [-1, 1]) {
        if (Math.random() < 0.25) continue
        if (s > L - HALF_W - 6 && s < L + HALF_W + 4 && side === seg.turn) continue
        if (blocked(side, s)) continue
        const lat = side * rand(7, 24)
        const sc = rand(0.8, 1.5)
        treeMats[Math.floor(Math.random() * treeMats.length)].push(
          mat(lat, -4.5, -s, rand(-0.1, 0.1), Math.random() * 6, rand(-0.12, 0.12), sc, sc, sc),
        )
      }
    }
    // trees beyond the end barrier
    for (let i = 0; i < 6; i++) {
      const s = L + rand(HALF_W + 5, 26)
      const lat = rand(-22, 22)
      if (Math.sign(lat) === seg.turn && Math.abs(s - L) < HALF_W + 6) continue
      treeMats[i % treeMats.length].push(mat(lat, -4.5, -s, 0, Math.random() * 6, 0, 1.3, 1.3, 1.3))
    }
    treeMats.forEach((list, i) => seg.addInstanced(a.treeGeos[i], a.bark, list))

    // houses
    const houses = Math.floor(rand(0, 3))
    for (let i = 0; i < houses; i++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const s = rand(10, L - 20)
      if (blocked(side, s)) continue
      const hg = new THREE.Group()
      const body = new THREE.Mesh(a.houseGeo, pick(a.houseMats))
      body.position.y = 2.5
      const roof = new THREE.Mesh(a.roofGeo, a.roof)
      roof.position.y = 6.3
      roof.rotation.y = Math.PI / 4
      hg.add(body, roof)
      hg.position.set(side * rand(16, 30), -4.5, -s)
      hg.rotation.set(rand(-0.05, 0.05), Math.random() * 6, rand(-0.08, 0.08))
      hg.scale.setScalar(rand(1.1, 1.6))
      seg.group.add(hg)
    }

    // neon sign
    if (Math.random() < 0.75) {
      const side = Math.random() < 0.5 ? -1 : 1
      const s = rand(15, Math.max(20, L - 25))
      if (!blocked(side, s)) {
        const sg = new THREE.Group()
        const pole = new THREE.Mesh(a.signPoleGeo, a.woodDark)
        pole.position.y = -1.5
        const sign = new THREE.Mesh(a.signGeo, pick(a.neon))
        sign.position.y = 2.3
        sg.add(pole, sign)
        sg.position.set(side * rand(14, 26), 2.5, -s)
        sg.rotation.y = -side * (Math.PI / 4)
        seg.group.add(sg)
      }
    }

    // coins
    if (seg.coins.length) {
      seg.coins = seg.coins.filter((c) => !seg.obstacles.some((o) => this.coinBlocked(o, c)))
      const m = new THREE.InstancedMesh(a.coinGeo, a.coin, Math.max(1, seg.coins.length))
      m.frustumCulled = false
      seg.coins.forEach((c, i) => m.setMatrixAt(i, mat(c.x, c.y, -c.s)))
      m.count = seg.coins.length
      seg.coinMesh = m
      seg.group.add(m)
    }
  }

  private coinBlocked(o: Obstacle, c: Coin) {
    if (o.clearY !== Infinity && o.kind !== 'car' && o.kind !== 'pillar') return false
    if (o.kind === 'arch') return false
    if (!o.lanes) return false
    const near = Math.abs(c.s - o.s) < o.depth / 2 + 0.8
    return near && o.lanes.some((l) => Math.abs(l * LANE_W - c.x) < 0.5)
  }
}
