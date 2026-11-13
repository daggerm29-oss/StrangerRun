import * as THREE from 'three'
import { HALF_W, NEON_WORDS, type Assets } from './props'
import type { Segment } from './track'
import {
  makeAlphabetTexture,
  makeBannerTexture,
  makePlacardTexture,
  makePosterTexture,
  makeTowerTexture,
} from './textures'

/*
 * Rich per-zone set dressing. Every static detail in a segment is baked into a handful of
 * vertex-coloured merged meshes (lit / glossy / glow / additive...) so a segment full of houses,
 * trees, pipes and shopfronts still costs only ~10 draw calls.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
const sign = () => (Math.random() < 0.5 ? -1 : 1)
const chance = (p: number) => Math.random() < p

const colorCache = new Map<string, THREE.Color>()
const C = (hex: string) => {
  let c = colorCache.get(hex)
  if (!c) {
    c = new THREE.Color(hex)
    colorCache.set(hex, c)
  }
  return c
}
const tint = (hex: string, k: number) => C(hex).clone().multiplyScalar(k)
const vary = (hex: string, amt = 0.15) => C(hex).clone().multiplyScalar(1 - amt + Math.random() * amt * 2)

const BULBS = ['#ff2a2a', '#2aff6a', '#2a8cff', '#ffd02a', '#ff7a1a', '#ff2fd0']

// ---------------------------------------------------------------- batching

interface Proto {
  p: Float32Array
  n: Float32Array
}

function proto(g: THREE.BufferGeometry): Proto {
  const ni = g.index ? g.toNonIndexed() : g
  if (!ni.attributes.normal) ni.computeVertexNormals()
  const out = {
    p: (ni.attributes.position.array as Float32Array).slice(),
    n: (ni.attributes.normal.array as Float32Array).slice(),
  }
  if (ni !== g) ni.dispose()
  g.dispose()
  return out
}

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _nm = new THREE.Matrix3()
const IDENTITY = new THREE.Matrix4()

class Batch {
  p = new Float32Array(3 * 4096)
  n = new Float32Array(3 * 4096)
  c = new Float32Array(3 * 4096)
  len = 0
  constructor(public material: THREE.Material) {}

  private grow(need: number) {
    let cap = this.p.length
    while (cap < need) cap *= 2
    for (const k of ['p', 'n', 'c'] as const) {
      const next = new Float32Array(cap)
      next.set(this[k].subarray(0, this.len))
      this[k] = next
    }
  }

  add(pr: Proto, m: THREE.Matrix4, col: THREE.Color) {
    const P = pr.p
    const N = pr.n
    if (this.len + P.length > this.p.length) this.grow(this.len + P.length)
    _nm.getNormalMatrix(m)
    const e = m.elements
    const ne = _nm.elements
    const op = this.p
    const on = this.n
    const oc = this.c
    let o = this.len
    for (let i = 0; i < P.length; i += 3, o += 3) {
      const x = P[i]
      const y = P[i + 1]
      const z = P[i + 2]
      op[o] = e[0] * x + e[4] * y + e[8] * z + e[12]
      op[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      op[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      const nx = N[i]
      const ny = N[i + 1]
      const nz = N[i + 2]
      const tx = ne[0] * nx + ne[3] * ny + ne[6] * nz
      const ty = ne[1] * nx + ne[4] * ny + ne[7] * nz
      const tz = ne[2] * nx + ne[5] * ny + ne[8] * nz
      const inv = 1 / (Math.hypot(tx, ty, tz) || 1)
      on[o] = tx * inv
      on[o + 1] = ty * inv
      on[o + 2] = tz * inv
      oc[o] = col.r
      oc[o + 1] = col.g
      oc[o + 2] = col.b
    }
    this.len = o
  }

  /** add an already positioned one-off geometry (wires, tendrils...) */
  addGeo(g: THREE.BufferGeometry, col: THREE.Color) {
    this.add(proto(g), IDENTITY, col)
  }

  flush(seg: Segment) {
    if (!this.len) return
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, this.len), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(this.n.slice(0, this.len), 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, this.len), 3))
    g.computeBoundingSphere()
    seg.own(g)
    seg.group.add(new THREE.Mesh(g, this.material))
    this.len = 0
  }
}

class Dots {
  p: number[] = []
  c: number[] = []
  constructor(public material: THREE.PointsMaterial) {}
  add(v: THREE.Vector3, col: THREE.Color, k = 1) {
    this.p.push(v.x, v.y, v.z)
    this.c.push(col.r * k, col.g * k, col.b * k)
  }
  flush(seg: Segment) {
    if (!this.p.length) return
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    g.computeBoundingSphere()
    seg.own(g)
    seg.group.add(new THREE.Points(g, this.material))
    this.p = []
    this.c = []
  }
}

const _t = new THREE.Vector3()
const _s = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _l = new THREE.Matrix4()
const _m = new THREE.Matrix4()

/** composes a prop's local part transforms on top of a base placement */
class Pen {
  base = new THREE.Matrix4()
  at(x: number, y: number, z: number, ry = 0, s = 1, rx = 0, rz = 0) {
    this.base.compose(_t.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(s, s, s))
    return this
  }
  m(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    _l.compose(_t.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))
    return _m.multiplyMatrices(this.base, _l)
  }
  pt(x: number, y: number, z: number) {
    return _v.set(x, y, z).applyMatrix4(this.base)
  }
}

/** fade additive glow to black in fog instead of toward the fog colour, so far lights don't float */
function fogToBlack<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      THREE.ShaderChunk.fog_fragment.replace(/gl_FragColor\.rgb = mix\([^;]*\);/, 'gl_FragColor.rgb *= ( 1.0 - fogFactor );'),
    )
  }
  return m
}

interface Batches {
  lit: Batch
  gloss: Batch
  glow: Batch
  flicker: Batch
  blink: Batch
  pulse: Batch
  add: Batch
  flesh: Batch
  sil: Batch
  dotS: Dots
  dotL: Dots
  dotXL: Dots
  dotBlink: Dots
  mist: Dots
}

export interface DecorContext {
  s0: number
  s1: number
  inGap: (s: number, pad?: number) => boolean
}

interface Ctx extends DecorContext {
  seg: Segment
  L: number
  b: Batches
  /** true when a prop of radius r at lateral offset `lat` and distance s stays clear of every road */
  clear: (lat: number, s: number, r: number) => boolean
  /** a wall/edge at this side and distance is not cut by a gap or the corner */
  edgeOK: (side: number, s: number) => boolean
}

// ---------------------------------------------------------------- kit

export class SceneryKit {
  assets: Assets
  pen = new Pen()

  // unit primitives
  box = proto(new THREE.BoxGeometry(1, 1, 1))
  cyl = proto(new THREE.CylinderGeometry(1, 1, 1, 8))
  cyl12 = proto(new THREE.CylinderGeometry(1, 1, 1, 14))
  cylOpen = proto(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true))
  cone = proto(new THREE.ConeGeometry(1, 1, 7))
  cone4 = proto(new THREE.ConeGeometry(1, 1, 4))
  coneOpen = proto(new THREE.ConeGeometry(1, 1, 16, 1, true))
  ico = proto(new THREE.IcosahedronGeometry(1, 0))
  sphere = proto(new THREE.SphereGeometry(1, 10, 7))
  dodeca = proto(new THREE.DodecahedronGeometry(1, 0))
  torus = proto(new THREE.TorusGeometry(1, 0.09, 4, 16))
  disc = proto(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2))
  roof: Proto

  // materials
  litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 })
  glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.55 })
  glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  flickerMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  blinkMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  pulseMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  addMat = fogToBlack(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  )
  fleshMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.4,
    metalness: 0.1,
    emissive: '#6a0010',
    emissiveIntensity: 0.5,
  })
  silMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
  dotSMat: THREE.PointsMaterial
  dotLMat: THREE.PointsMaterial
  dotXLMat: THREE.PointsMaterial
  dotBlinkMat: THREE.PointsMaterial
  mistMat: THREE.PointsMaterial

  // textured set pieces
  plane = new THREE.PlaneGeometry(1, 1)
  poster: THREE.MeshStandardMaterial
  alphabet: THREE.MeshStandardMaterial
  welcome: THREE.MeshStandardMaterial
  castle: THREE.MeshStandardMaterial
  mirkwood: THREE.MeshStandardMaterial
  labSigns: THREE.MeshStandardMaterial[]
  banners: THREE.MeshBasicMaterial[]
  towerGeo = new THREE.CylinderGeometry(4.2, 4.2, 5, 24, 1)
  towerMat: THREE.MeshStandardMaterial

  constructor(assets: Assets, dot: THREE.Texture) {
    this.assets = assets
    const tri = new THREE.Shape()
    tri.moveTo(-1, 0)
    tri.lineTo(1, 0)
    tri.lineTo(0, 1)
    tri.closePath()
    const roof = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false })
    roof.translate(0, 0, -0.5)
    this.roof = proto(roof)

    const pts = (size: number, opacity = 1) =>
      fogToBlack(
        new THREE.PointsMaterial({
          size,
          map: dot,
          vertexColors: true,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          sizeAttenuation: true,
        }),
      )
    this.dotSMat = pts(0.45)
    this.dotLMat = pts(1.5)
    this.dotXLMat = pts(3.6, 0.8)
    this.dotBlinkMat = pts(1.4)
    this.mistMat = pts(9, 0.3)

    const sign = (tex: THREE.Texture, glow = 0.25) =>
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.8,
        emissive: '#ffffff',
        emissiveMap: tex,
        emissiveIntensity: glow,
        side: THREE.DoubleSide,
      })
    this.poster = sign(makePosterTexture(), 0.18)
    this.alphabet = sign(makeAlphabetTexture(), 0.2)
    this.welcome = sign(makePlacardTexture(['WELCOME TO', 'HAWKINS', 'INDIANA'], '#1f4a30', '#f2ecd8'), 0.35)
    this.castle = sign(makePlacardTexture(['CASTLE BYERS'], '#6a4a2a', '#f0e6d0', { h: 128, wood: true }), 0.25)
    this.mirkwood = sign(makePlacardTexture(['MIRKWOOD', 'TRAIL'], '#4a3420', '#efe2c4', { wood: true }), 0.25)
    this.labSigns = [
      makePlacardTexture(['AUTHORIZED', 'PERSONNEL ONLY'], '#d8b020', '#141414'),
      makePlacardTexture(['LEVEL 4', 'RESTRICTED'], '#b01a1a', '#f4f4f4'),
      makePlacardTexture(['DEPT. OF', 'ENERGY'], '#e8e8e0', '#1a2a5a'),
      makePlacardTexture(['DANGER', 'BIOHAZARD'], '#e8c018', '#141414'),
    ].map((t) => sign(t, 0.4))
    this.banners = [
      makeBannerTexture('STARCOURT', '#ff2fd0', '#3a6aff'),
      makeBannerTexture('SCOOPS AHOY', '#ff6a2a', '#ff2a6a'),
      makeBannerTexture('SUMMER SALE', '#36e3ff', '#8a5aff'),
    ].map((map) => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false }))
    const tower = makeTowerTexture()
    tower.repeat.set(1, 1)
    this.towerMat = new THREE.MeshStandardMaterial({ map: tower, roughness: 0.7, metalness: 0.3 })
  }

  /** animate the shared materials; called once per frame */
  update(t: number) {
    const flick = Math.random() < 0.04 ? 0.25 : Math.sin(t * 23) > -0.85 ? 1 : 0.5
    this.flickerMat.color.setScalar(flick)
    const blink = Math.sin(t * 6) > 0 ? 1 : 0.12
    this.blinkMat.color.setScalar(blink)
    this.dotBlinkMat.opacity = blink
    this.pulseMat.color.setScalar(0.55 + Math.sin(t * 2.6) * 0.45)
    this.fleshMat.emissiveIntensity = 0.45 + Math.sin(t * 2.2) * 0.25
  }

  private cached?: Batches

  private batches(): Batches {
    return (this.cached ??= {
      lit: new Batch(this.litMat),
      gloss: new Batch(this.glossMat),
      glow: new Batch(this.glowMat),
      flicker: new Batch(this.flickerMat),
      blink: new Batch(this.blinkMat),
      pulse: new Batch(this.pulseMat),
      add: new Batch(this.addMat),
      flesh: new Batch(this.fleshMat),
      sil: new Batch(this.silMat),
      dotS: new Dots(this.dotSMat),
      dotL: new Dots(this.dotLMat),
      dotXL: new Dots(this.dotXLMat),
      dotBlink: new Dots(this.dotBlinkMat),
      mist: new Dots(this.mistMat),
    })
  }

  decorate(seg: Segment, dc: DecorContext) {
    const L = seg.length
    const b = this.batches()
    const clear = (lat: number, s: number, r: number) => {
      const side = Math.sign(lat) || 1
      if (Math.abs(lat) - r < HALF_W + 0.6) return s - r > L + HALF_W + 0.6
      if (side === seg.turn && Math.abs(s - L) < HALF_W + r + 1) return false
      if (side === seg.prevTurn && Math.abs(s) < HALF_W + r + 1) return false
      return true
    }
    const edgeOK = (side: number, s: number) => !dc.inGap(s, 0.4) && !(side === seg.turn && s > L - HALF_W - 0.2)
    const ctx: Ctx = { ...dc, seg, L, b, clear, edgeOK }

    switch (seg.zone.id) {
      case 'town':
        this.town(ctx)
        break
      case 'forest':
        this.forest(ctx)
        break
      case 'lab':
        this.lab(ctx)
        break
      case 'mall':
        this.mall(ctx)
        break
      case 'upside':
        this.upside(ctx)
        break
      case 'vecna':
        this.vecna(ctx)
        break
    }
    for (const k of Object.keys(b) as (keyof Batches)[]) b[k].flush(seg)
  }

  // ---------------------------------------------------------------- helpers

  private sign(seg: Segment, mat: THREE.Material, x: number, y: number, z: number, ry: number, w: number, h: number) {
    const m = new THREE.Mesh(this.plane, mat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    m.scale.set(w, h, 1)
    seg.group.add(m)
    return m
  }

  /** contiguous [a,b] ranges along one side where an edge feature can run */
  private runs(ctx: Ctx, side: number, a: number, b: number, step = 0.5) {
    const out: [number, number][] = []
    let start = -1
    for (let s = a; s <= b; s += step) {
      const ok = ctx.edgeOK(side, s)
      if (ok && start < 0) start = s
      if ((!ok || s + step > b) && start >= 0) {
        const end = ok ? s : s - step
        if (end - start > 0.6) out.push([start, end])
        start = -1
      }
    }
    return out
  }

  private tube(points: THREE.Vector3[], radius: number, radial = 5, segs?: number) {
    const curve = new THREE.CatmullRomCurve3(points)
    return new THREE.TubeGeometry(curve, segs ?? Math.max(8, points.length * 4), radius, radial, false)
  }

  private pine(b: Batch, x: number, z: number, sc: number, base = '#10261a') {
    const pen = this.pen.at(x, 0, z, Math.random() * 6, sc)
    b.add(this.cyl, pen.m(0, 1.2, 0, 0.22, 2.4, 0.22), vary('#2a1a12'))
    const tiers = 4
    for (let i = 0; i < tiers; i++) {
      const r = 2.3 - i * 0.48
      b.add(this.cone, pen.m(0, 2.2 + i * 1.55, 0, r, 2.6, r, 0, i * 0.7, 0), vary(base, 0.2))
    }
  }

  private autumnTree(b: Batch, x: number, z: number, sc: number) {
    const pen = this.pen.at(x, 0, z, Math.random() * 6, sc)
    b.add(this.cyl, pen.m(0, 1.6, 0, 0.22, 3.2, 0.22), vary('#2a1c14'))
    b.add(this.cyl, pen.m(0.5, 3.0, 0, 0.09, 1.6, 0.09, 0, 0, -0.7), vary('#2a1c14'))
    const leaf = pick(['#6a2a10', '#7a4212', '#5a3412', '#4a2a10', '#6a1a12'])
    for (let i = 0; i < 4; i++) {
      const s = rand(1.2, 1.9)
      b.add(this.ico, pen.m(rand(-1, 1), rand(3.4, 4.6), rand(-1, 1), s, s * 0.85, s, Math.random(), Math.random(), 0), vary(leaf, 0.2))
    }
  }

  private bike(b: Batch, pen: Pen, frame: string) {
    for (const z of [-0.55, 0.55]) {
      b.add(this.torus, pen.m(0, 0.36, z, 0.34, 0.34, 0.34, 0, Math.PI / 2, 0), C('#141414'))
    }
    const col = C(frame)
    b.add(this.cyl, pen.m(0, 0.62, 0, 0.035, 1.0, 0.035, Math.PI / 2 - 0.25, 0, 0), col)
    b.add(this.cyl, pen.m(0, 0.5, -0.28, 0.035, 0.62, 0.035, 0.7, 0, 0), col)
    b.add(this.cyl, pen.m(0, 0.55, 0.42, 0.035, 0.5, 0.035, -0.3, 0, 0), col)
    b.add(this.box, pen.m(0, 0.92, 0.3, 0.12, 0.05, 0.28), C('#1a1a1a'))
    b.add(this.cyl, pen.m(0, 0.98, -0.5, 0.025, 0.55, 0.025, 0, 0, Math.PI / 2), C('#8a8a8a'))
  }

  private car(b: Batches, pen: Pen, paint: string) {
    const body = vary(paint, 0.1)
    b.gloss.add(this.box, pen.m(0, 0.62, 0, 1.85, 0.62, 4.6), body)
    b.gloss.add(this.box, pen.m(0, 1.2, 0.35, 1.7, 0.58, 2.6), body)
    b.gloss.add(this.box, pen.m(0, 1.2, 0.35, 1.72, 0.44, 2.3), C('#0a0c12'))
    b.lit.add(this.box, pen.m(0, 0.42, -2.32, 1.9, 0.18, 0.12), C('#9a9a9a'))
    b.lit.add(this.box, pen.m(0, 0.42, 2.32, 1.9, 0.18, 0.12), C('#9a9a9a'))
    for (const [x, z] of [
      [-0.88, -1.45],
      [0.88, -1.45],
      [-0.88, 1.45],
      [0.88, 1.45],
    ]) {
      b.lit.add(this.cyl, pen.m(x, 0.34, z, 0.34, 0.26, 0.34, 0, 0, Math.PI / 2), C('#0c0c0c'))
    }
    for (const x of [-0.65, 0.65]) {
      b.glow.add(this.box, pen.m(x, 0.68, 2.31, 0.3, 0.14, 0.04), C('#7a0a0a'))
      b.lit.add(this.box, pen.m(x, 0.68, -2.31, 0.32, 0.16, 0.04), C('#d8d4c0'))
    }
  }

  private house(ctx: Ctx, pen: Pen, yardDepth: number, xmas: boolean) {
    const b = ctx.b
    const w = rand(7.5, 9.5)
    const d = 7
    const twoStory = chance(0.45)
    const h = twoStory ? rand(5.8, 6.6) : rand(3.4, 4.0)
    const siding = pick(['#4a3e34', '#3a4650', '#5a3c36', '#44503e', '#56524a', '#3e3650'])
    const trim = '#9a958a'
    const base = 0.5

    b.lit.add(this.box, pen.m(0, 0.25, 0, w + 0.3, 0.5, d + 0.3), C('#2e2a28'))
    b.lit.add(this.box, pen.m(0, base + h / 2, 0, w, h, d), vary(siding, 0.08))
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.lit.add(this.box, pen.m(x, base + h / 2, z, 0.18, h, 0.18), C(trim))
    for (let y = base + 0.4; y < base + h; y += 0.45) b.lit.add(this.box, pen.m(0, y, d / 2 + 0.01, w, 0.03, 0.02), tint(siding, 0.6))
    const rh = rand(2.0, 2.8)
    const roofCol = pick(['#231c1e', '#2a2224', '#1c2024', '#2c2018'])
    b.lit.add(this.roof, pen.m(0, base + h, 0, (w + 1.1) / 2, rh, d + 0.9), vary(roofCol, 0.1))
    b.lit.add(this.box, pen.m(0, base + h - 0.05, d / 2 + 0.45, w + 1.1, 0.12, 0.12), C(trim))
    b.lit.add(this.box, pen.m(w * 0.28, base + h + rh * 0.6, -1.2, 0.75, 2.4, 0.75), vary('#5a2e26'))
    // porch
    const pw = w * 0.6
    b.lit.add(this.box, pen.m(-w * 0.12, base + 0.1, d / 2 + 1.1, pw, 0.22, 2.2), C('#3a2e26'))
    for (const x of [-w * 0.12 - pw / 2 + 0.15, -w * 0.12 + pw / 2 - 0.15]) b.lit.add(this.box, pen.m(x, base + 1.3, d / 2 + 2.05, 0.16, 2.4, 0.16), C(trim))
    b.lit.add(this.box, pen.m(-w * 0.12, base + 2.55, d / 2 + 1.1, pw + 0.3, 0.14, 2.4), vary(roofCol))
    for (let x = -w * 0.12 - pw / 2 + 0.3; x < -w * 0.12 + pw / 2 - 0.2; x += 0.3) {
      if (Math.abs(x + w * 0.12) < 0.6) continue
      b.lit.add(this.box, pen.m(x, base + 0.6, d / 2 + 2.1, 0.05, 0.6, 0.05), C(trim))
    }
    b.lit.add(this.box, pen.m(-w * 0.12, base + 0.95, d / 2 + 2.1, pw, 0.06, 0.08), C(trim))
    // steps + walkway to the sidewalk
    for (let i = 0; i < 3; i++) b.lit.add(this.box, pen.m(-w * 0.12, 0.12 + i * 0.13, d / 2 + 2.4 + (2 - i) * 0.3, 1.4, 0.13, 0.3), C('#4a4644'))
    b.lit.add(this.box, pen.m(-w * 0.12, 0.03, d / 2 + 2.6 + yardDepth / 2, 1.2, 0.05, yardDepth), C('#46464a'))
    // door
    b.lit.add(this.box, pen.m(-w * 0.12, base + 1.05, d / 2 + 0.04, 1.0, 2.1, 0.08), vary('#3a1c14'))
    b.glow.add(this.box, pen.m(-w * 0.12, base + 1.7, d / 2 + 0.09, 0.5, 0.3, 0.02), tint('#ffb060', 0.6))
    // windows
    const win = (x: number, y: number, z: number, ry: number) => {
      const r = Math.random()
      const pane = r < 0.45 ? tint('#ffb060', rand(0.55, 0.9)) : r < 0.55 ? tint('#5a8acc', 0.7) : r < 0.6 ? tint('#ff2a1a', 0.8) : null
      const fx = ry ? 0.1 : 1.4
      const fz = ry ? 1.4 : 0.1
      b.lit.add(this.box, pen.m(x, y, z, fx, 1.5, fz), C(trim))
      if (pane) b.glow.add(this.box, pen.m(x + (ry ? Math.sign(x) * 0.04 : 0), y, z + (ry ? 0 : 0.04), ry ? 0.06 : 1.15, 1.25, ry ? 1.15 : 0.06), pane)
      else b.gloss.add(this.box, pen.m(x + (ry ? Math.sign(x) * 0.04 : 0), y, z + (ry ? 0 : 0.04), ry ? 0.06 : 1.15, 1.25, ry ? 1.15 : 0.06), C('#06070a'))
      if (!ry) for (const sx of [-0.85, 0.85]) b.lit.add(this.box, pen.m(x + sx, y, z + 0.02, 0.3, 1.45, 0.06), tint(siding, 0.45))
      if (pane) ctx.b.dotL.add(pen.pt(x + (ry ? Math.sign(x) * 0.3 : 0), y, z + (ry ? 0 : 0.3)), pane, 0.25)
    }
    const y1 = base + 1.5
    for (const x of [w * 0.22, w * 0.38]) win(x, y1, d / 2 + 0.02, 0)
    win(-w * 0.38, y1, d / 2 + 0.02, 0)
    for (const sx of [-1, 1]) win(sx * (w / 2 + 0.02), y1, 0, 1)
    if (twoStory) {
      for (const x of [-w * 0.3, 0, w * 0.3]) win(x, base + h - 1.3, d / 2 + 0.02, 0)
      for (const sx of [-1, 1]) win(sx * (w / 2 + 0.02), base + h - 1.3, 1, 1)
    }
    // Christmas lights strung along the eaves, Joyce-style
    if (xmas) {
      const n = Math.floor(w / 0.32)
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 - 0.4 + (i / n) * (w + 0.8)
        const sag = Math.abs(Math.sin(i * 0.55)) * 0.18
        ctx.b.dotS.add(pen.pt(x, base + h - 0.15 - sag, d / 2 + 0.55), C(BULBS[i % BULBS.length]), 1.6)
        ctx.b.glow.add(this.box, pen.m(x, base + h - 0.15 - sag, d / 2 + 0.55, 0.06, 0.08, 0.06), C(BULBS[i % BULBS.length]))
      }
      for (let i = 0; i <= 10; i++) {
        const x = -w * 0.12 - pw / 2 + (i / 10) * pw
        ctx.b.dotS.add(pen.pt(x, base + 2.42, d / 2 + 2.3), C(BULBS[(i + 2) % BULBS.length]), 1.6)
      }
    }
    // picket fence + mailbox
    const fz = d / 2 + 2.6 + yardDepth - 0.3
    for (let x = -w / 2 - 2; x < w / 2 + 1; x += 0.28) {
      if (Math.abs(x + w * 0.12) < 0.8) continue
      b.lit.add(this.box, pen.m(x, 0.45, fz, 0.1, 0.9, 0.04), C('#b8b2a4'))
    }
    b.lit.add(this.box, pen.m(-0.5, 0.6, fz - 0.02, w + 3, 0.07, 0.05), C('#b8b2a4'))
    b.lit.add(this.box, pen.m(-w * 0.12 + 1.1, 0.55, fz + 0.2, 0.08, 1.1, 0.08), C('#3a2a20'))
    b.gloss.add(this.box, pen.m(-w * 0.12 + 1.1, 1.18, fz + 0.2, 0.28, 0.26, 0.5), vary(pick(['#2a3a6a', '#1a1a1a', '#6a1a1a'])))
    // driveway + parked car
    const dx = w / 2 + 2
    b.lit.add(this.box, pen.m(dx, 0.02, (d / 2 + 2.6 + yardDepth) / 2, 3, 0.04, d / 2 + 2.6 + yardDepth + 3), C('#3e3e42'))
    if (chance(0.55)) {
      const p2 = new Pen()
      p2.base.copy(pen.base).multiply(new THREE.Matrix4().makeTranslation(dx, 0, d / 2 + 0.5))
      this.car(b, p2, pick(['#6a4a2a', '#2a3a5a', '#5a1a1a', '#3a4a3a', '#8a7a5a']))
    }
    // yard tree
    if (chance(0.7)) {
      const tp = pen.pt(-w / 2 - 2.6, 0, d / 2 + 2.6)
      this.autumnTree(b.lit, tp.x, tp.z, rand(0.9, 1.25))
    }
  }

  // ---------------------------------------------------------------- HAWKINS (town)

  private town(ctx: Ctx) {
    const { seg, L, b, s0, s1, clear, inGap } = ctx
    const pen = this.pen
    const turn = seg.turn

    // sidewalks with expansion joints
    for (const side of [-1, 1]) {
      const end = side === turn ? L - HALF_W - 0.1 : s1 + 2.6
      const len = end - s0
      if (len <= 0) continue
      pen.at(0, 0, 0)
      b.lit.add(this.box, pen.m(side * 5.01, 0.08, -(s0 + end) / 2, 2.5, 0.16, len), C('#4c4e50'))
      for (let s = s0 + 2.5; s < end; s += 2.5) b.lit.add(this.box, pen.m(side * 5.01, 0.162, -s, 2.5, 0.01, 0.05), C('#2a2b2c'))
    }
    pen.at(0, 0, 0)
    b.lit.add(this.box, pen.m(turn * ((HALF_W - 6.26) / 2), 0.08, -(L + HALF_W + 1.25), HALF_W + 6.26, 0.16, 2.5), C('#4c4e50'))

    // street lamps with volumetric cones and light pools
    let side = sign()
    for (let s = s0 + 6; s < L - 2; s += 15) {
      side = -side
      if (!clear(side * 4.7, s, 1.5) || inGap(s, 1)) continue
      const x = side * 4.7
      pen.at(x, 0, -s, side > 0 ? 0 : Math.PI)
      b.lit.add(this.cyl, pen.m(0, 0.25, 0, 0.2, 0.5, 0.2), C('#1e2622'))
      b.gloss.add(this.cyl, pen.m(0, 2.7, 0, 0.08, 5.2, 0.08), C('#26302a'))
      b.gloss.add(this.box, pen.m(-0.6, 5.2, 0, 1.3, 0.08, 0.08), C('#26302a'))
      b.lit.add(this.box, pen.m(-1.2, 5.12, 0, 0.6, 0.16, 0.34), C('#1e2622'))
      b.glow.add(this.box, pen.m(-1.2, 5.03, 0, 0.44, 0.04, 0.26), C('#ffd89a'))
      b.dotXL.add(pen.pt(-1.2, 4.95, 0), C('#ffc27a'), 0.7)
      b.add.add(this.coneOpen, pen.m(-1.2, 2.5, 0, 2.3, 5, 2.3), C('#2a1c0a'))
      b.add.add(this.disc, pen.m(-1.2, 0.03, 0, 2.6, 1, 2.6), C('#3a280e'))
      if (chance(0.45)) this.sign(seg, this.poster, x - side * 0.12, 1.75, -s, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0.55, 0.73)
    }

    // utility poles with sagging wires on one side
    const ps = sign()
    const px = ps * 7.1
    const poles: number[] = []
    for (let s = s0 + 4; s < L + 6; s += 24) if (clear(px, s, 1.2)) poles.push(s)
    for (let i = 0; i < poles.length; i++) {
      const s = poles[i]
      pen.at(px, 0, -s)
      b.lit.add(this.cyl, pen.m(0, 4.1, 0, 0.15, 8.2, 0.15), vary('#3a2a1e'))
      b.lit.add(this.box, pen.m(0, 7.6, 0, 2.4, 0.14, 0.14), C('#3a2a1e'))
      for (const ox of [-1, 0, 1]) b.gloss.add(this.cyl, pen.m(ox, 7.76, 0, 0.05, 0.18, 0.05), C('#3a6a4a'))
      if (i % 2 === 0) b.gloss.add(this.cyl, pen.m(0.35, 6.6, 0, 0.32, 0.8, 0.32), C('#6a6e70'))
      if (chance(0.5)) this.sign(seg, this.poster, px - ps * 0.17, 1.8, -s, ps > 0 ? -Math.PI / 2 : Math.PI / 2, 0.55, 0.73)
      const next = poles[i + 1]
      if (next === undefined || next - s > 26) continue
      for (const ox of [-1, 0, 1]) {
        const a = new THREE.Vector3(px + ox, 7.76, -s)
        const c = new THREE.Vector3(px + ox, 7.76, -next)
        const mid = a.clone().lerp(c, 0.5)
        mid.y -= 0.7
        b.lit.addGeo(this.tube([a, a.clone().lerp(mid, 0.5).setY(7.76 - 0.5), mid, c.clone().lerp(mid, 0.5).setY(7.76 - 0.5), c], 0.022, 3, 10), C('#0a0a0a'))
      }
    }

    // sidewalk clutter: hydrants, bins, mailboxes, newspaper boxes, kids' bikes
    for (let s = s0 + 3; s < L; s += rand(5, 11)) {
      const sd = sign()
      const x = sd * 5.95
      if (!clear(x, s, 1)) continue
      pen.at(x, 0.16, -s, rand(-0.3, 0.3))
      const kind = Math.random()
      if (kind < 0.22) {
        b.gloss.add(this.cyl, pen.m(0, 0.32, 0, 0.16, 0.64, 0.16), C('#a01a14'))
        b.gloss.add(this.sphere, pen.m(0, 0.66, 0, 0.16, 0.12, 0.16), C('#a01a14'))
        b.gloss.add(this.cyl, pen.m(0, 0.42, 0, 0.07, 0.48, 0.07, 0, 0, Math.PI / 2), C('#8a1410'))
      } else if (kind < 0.42) {
        b.gloss.add(this.cyl, pen.m(0, 0.45, 0, 0.3, 0.9, 0.3), C('#5a5e60'))
        b.gloss.add(this.cyl, pen.m(0, 0.93, 0, 0.33, 0.06, 0.33), C('#6a6e70'))
      } else if (kind < 0.58) {
        b.gloss.add(this.box, pen.m(0, 0.75, 0, 0.5, 0.75, 0.5), C('#1e3a7a'))
        b.gloss.add(this.cyl, pen.m(0, 1.12, 0, 0.25, 0.5, 0.25, Math.PI / 2, 0, 0), C('#1e3a7a'))
        for (const lx of [-0.18, 0.18]) b.lit.add(this.box, pen.m(lx, 0.18, 0, 0.06, 0.36, 0.06), C('#1a1a1a'))
      } else if (kind < 0.72) {
        b.gloss.add(this.box, pen.m(0, 0.55, 0, 0.45, 1.1, 0.4), pick([C('#c8a018'), C('#a01a14'), C('#2a5a8a')]))
        b.glow.add(this.box, pen.m(-sd * 0.23, 0.8, 0, 0.02, 0.3, 0.3), tint('#d8d0a0', 0.25))
      } else {
        pen.at(sd * 5.6, 0.16, -s, rand(-0.2, 0.2), 1, 0, -sd * 0.25)
        this.bike(b.gloss, pen, pick(['#a01a14', '#1a4aa0', '#c8a018', '#2a8a4a']))
      }
    }

    // houses along both sides
    const placed: [number, number][] = []
    const nHouses = Math.floor(rand(4, 7))
    for (let i = 0; i < nHouses * 3 && placed.length < nHouses; i++) {
      const hs = rand(s0 + 8, L + 4)
      const hside = sign()
      const lat = hside * rand(16.5, 21)
      if (!clear(lat, hs, 9)) continue
      if (placed.some(([ps2, pz]) => ps2 === hside && Math.abs(pz - hs) < 14)) continue
      placed.push([hside, hs])
      const yard = Math.abs(lat) - 3.5 - 2.6 - 6.3
      pen.at(lat, 0, -hs, -hside * (Math.PI / 2))
      this.house(ctx, pen, Math.max(1.5, yard), chance(0.4))
    }
    // a house facing the T-junction straight ahead
    const aheadLat = -turn * rand(0, 5)
    if (clear(aheadLat, L + HALF_W + 13, 7)) {
      pen.at(aheadLat, 0, -(L + HALF_W + 13), 0)
      this.house(ctx, pen, 2.2, chance(0.5))
    }

    // road details: puddles, manholes with steam, a crosswalk
    pen.at(0, 0, 0)
    for (let i = 0; i < 6; i++) {
      const s = rand(s0 + 4, L - 4)
      if (inGap(s, 2)) continue
      b.gloss.add(this.disc, pen.m(rand(-3, 3), 0.008, -s, rand(0.6, 1.6), 1, rand(0.4, 1.1), 0, Math.random() * 3, 0), C('#0a0c12'))
    }
    for (let i = 0; i < 2; i++) {
      const s = rand(s0 + 10, L - 10)
      if (inGap(s, 2)) continue
      const x = pick([-1, 0, 1]) * 2.1 + rand(-0.4, 0.4)
      b.gloss.add(this.cyl12, pen.m(x, 0.006, -s, 0.55, 0.012, 0.55), C('#1a1a1c'))
      for (let k = 0; k < 4; k++) b.mist.add(_v.set(x + rand(-0.3, 0.3), 0.6 + k * 0.7, -s + rand(-0.3, 0.3)), C('#3a3a40'), 0.6)
    }
    if (chance(0.45) && !inGap(s0 + 10, 3)) {
      for (let x = -HALF_W + 0.4; x < HALF_W; x += 0.75) b.lit.add(this.box, pen.m(x, 0.006, -(s0 + 10), 0.42, 0.012, 2.4), C('#b8b6ac'))
    }

    // tree line silhouetting the far side of the yards
    for (let s = s0 - 6; s < L + 30; s += rand(3, 4.5)) {
      for (const sd of [-1, 1]) {
        const lat = sd * rand(26, 36)
        if (clear(lat, s, 2.5)) this.pine(b.lit, lat, -s, rand(1.1, 1.7), '#0c1e16')
      }
    }

    // Hawkins water tower looming over the rooftops
    if (chance(0.3) || seg.idx === 0) {
      const ws = rand(L * 0.35, L * 0.75)
      const sd = seg.idx === 0 ? 1 : -turn || 1
      const lat = sd * rand(30, 34)
      if (clear(lat, ws, 5)) {
        pen.at(lat, 0, -ws)
        for (const [x, z] of [
          [-2.6, -2.6],
          [2.6, -2.6],
          [-2.6, 2.6],
          [2.6, 2.6],
        ])
          b.gloss.add(this.cyl, pen.m(x * 0.85, 7.5, z * 0.85, 0.16, 15, 0.16, z * 0.025, 0, -x * 0.025), C('#5a5e60'))
        for (const y of [4, 9]) b.gloss.add(this.torus, pen.m(0, y, 0, 2.5, 2.5, 2.5, Math.PI / 2, 0, 0), C('#4a4e50'))
        b.gloss.add(this.torus, pen.m(0, 15.1, 0, 4.4, 4.4, 2, Math.PI / 2, 0, 0), C('#3a3e40'))
        b.lit.add(this.cone, pen.m(0, 20.8, 0, 4.5, 1.6, 4.5), C('#5a6062'))
        const tank = new THREE.Mesh(this.towerGeo, this.towerMat)
        tank.position.set(lat, 17.5, -ws)
        tank.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2
        seg.group.add(tank)
        b.dotBlink.add(pen.pt(0, 21.7, 0), C('#ff2a2a'), 1.4)
      }
    }

    // welcome sign for the menu shot
    if (seg.idx === 0) {
      const sd = 1
      pen.at(sd * 6.9, 0, 12, 0)
      for (const x of [-1.6, 1.6]) b.lit.add(this.box, pen.m(x, 1.1, 0, 0.18, 2.2, 0.18), C('#3a2a1e'))
      this.sign(seg, this.welcome, sd * 6.9, 2.6, 12.1, 0, 3.8, 1.9)
      b.lit.add(this.box, pen.m(0, 2.6, -0.06, 4.0, 2.1, 0.1), C('#2a2018'))
      for (let i = 0; i < 10; i++) b.lit.add(this.ico, pen.m(rand(-2, 2), 0.25, rand(-0.4, 0.6), rand(0.3, 0.5), 0.35, 0.4), vary('#1c3a1e'))
    }
  }

  // ---------------------------------------------------------------- MIRKWOOD (forest)

  private forest(ctx: Ctx) {
    const { seg, L, b, s0, clear } = ctx
    const pen = this.pen

    // dense pine forest, darker and taller further from the trail
    for (let s = s0 - 4; s < L + 28; s += rand(2.2, 3.6)) {
      for (const sd of [-1, 1]) {
        const lat = sd * rand(6, 36)
        if (clear(lat, s, 2.4)) this.pine(b.lit, lat, -s, rand(0.9, 1.7) * (Math.abs(lat) > 20 ? 1.25 : 1), Math.abs(lat) > 20 ? '#0a1c14' : '#12301e')
      }
    }

    // trail-edge grass, ferns, rocks and stumps
    for (let s = s0; s < L + 2; s += 1.4) {
      for (const sd of [-1, 1]) {
        const lat = sd * rand(3.7, 4.6)
        if (!clear(lat, s, 0.3)) continue
        pen.at(lat, 0, -s, Math.random() * 6)
        for (let k = 0; k < 3; k++)
          b.lit.add(this.cone4, pen.m(rand(-0.2, 0.2), 0.25, rand(-0.2, 0.2), 0.05, rand(0.4, 0.7), 0.05, rand(-0.4, 0.4), 0, rand(-0.4, 0.4)), vary('#3a4a22', 0.25))
      }
    }
    for (let s = s0; s < L + 10; s += rand(1.2, 2.2)) {
      const sd = sign()
      const lat = sd * rand(4.6, 12)
      if (!clear(lat, s, 0.8)) continue
      pen.at(lat, 0, -s, Math.random() * 6, rand(0.7, 1.3))
      const col = chance(0.25) ? '#4a3a1a' : pick(['#1c3a1e', '#24401e', '#1a301a'])
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        b.lit.add(this.cone4, pen.m(Math.cos(a) * 0.35, 0.22, Math.sin(a) * 0.35, 0.14, 0.9, 0.05, Math.sin(a) * 1.1, -a, -Math.cos(a) * 1.1), vary(col, 0.2))
      }
    }
    for (let s = s0; s < L + 10; s += rand(6, 11)) {
      const sd = sign()
      const lat = sd * rand(4.8, 14)
      if (!clear(lat, s, 1.5)) continue
      pen.at(lat, 0, -s, Math.random() * 6)
      const r = Math.random()
      if (r < 0.45) {
        const sc = rand(0.4, 1.0)
        b.lit.add(this.dodeca, pen.m(0, sc * 0.35, 0, sc * 1.3, sc * 0.8, sc), vary('#3a3c3a'))
        b.lit.add(this.dodeca, pen.m(0, sc * 0.6, 0, sc * 1.1, sc * 0.3, sc * 0.85), vary('#2a4a22'))
      } else if (r < 0.7) {
        b.lit.add(this.cyl, pen.m(0, 0.3, 0, 0.45, 0.6, 0.45), vary('#2a1a12'))
        b.lit.add(this.cyl, pen.m(0, 0.61, 0, 0.4, 0.02, 0.4), C('#6a5038'))
      } else {
        b.lit.add(this.cyl, pen.m(0, 0.35, 0, 0.35, rand(4, 7), 0.35, Math.PI / 2, 0, 0), vary('#22160e'))
        b.lit.add(this.dodeca, pen.m(0, 0.55, rand(-1.5, 1.5), 0.4, 0.12, 0.6), C('#24401e'))
      }
    }

    // bioluminescent mushroom clusters
    for (let s = s0 + 4; s < L; s += rand(7, 13)) {
      const sd = sign()
      const lat = sd * rand(4.4, 8)
      if (!clear(lat, s, 0.8)) continue
      const glow = pick(['#3affd0', '#6affa0', '#7ad0ff'])
      const n = Math.floor(rand(3, 7))
      for (let k = 0; k < n; k++) {
        const x = lat + rand(-0.6, 0.6)
        const z = -s + rand(-0.6, 0.6)
        const h = rand(0.12, 0.38)
        pen.at(x, 0, z, 0, 1, rand(-0.2, 0.2), rand(-0.2, 0.2))
        b.lit.add(this.cyl, pen.m(0, h / 2, 0, 0.025, h, 0.025), C('#b8b0a0'))
        b.glow.add(this.sphere, pen.m(0, h, 0, h * 0.5, h * 0.25, h * 0.5), tint(glow, 0.8))
        b.dotS.add(pen.pt(0, h + 0.05, 0), C(glow), 0.8)
      }
      b.add.add(this.disc, pen.at(lat, 0, -s).m(0, 0.02, 0, 1.4, 1, 1.4), tint(glow, 0.12))
    }

    // drifting ground mist and moonlight shafts through the canopy
    for (let s = s0; s < L + 6; s += 3.5) for (const sd of [-1, 1]) b.mist.add(_v.set(sd * rand(1.5, 12), rand(0.3, 1.0), -s), C('#2a4a44'), 0.5)
    for (let i = 0; i < 4; i++) {
      const s = rand(s0 + 10, L)
      const lat = sign() * rand(7, 18)
      pen.at(lat, 12, -s, rand(0, 3), 1, 0, rand(-0.4, 0.4))
      b.add.add(this.box, pen.m(0, 0, 0, rand(1, 2.4), 28, 0.05), C('#0c2420'))
      b.add.add(this.box, pen.m(0, 0, 0, 0.05, 28, rand(1, 2.4)), C('#0c2420'))
    }

    // Castle Byers
    if (chance(0.25)) {
      const s = rand(s0 + 15, L - 15)
      const sd = sign()
      const lat = sd * 10
      if (clear(lat, s, 4)) {
        pen.at(lat, 0, -s, sd > 0 ? -Math.PI / 2 : Math.PI / 2)
        for (let y = 0.2; y < 2.0; y += 0.3) {
          for (const z of [-1.3, 1.3]) b.lit.add(this.box, pen.m(0, y, z, 2.8, 0.26, 0.12, 0, 0, rand(-0.04, 0.04)), vary('#5a3e26', 0.25))
          b.lit.add(this.box, pen.m(-1.4, y, 0, 0.12, 0.26, 2.6), vary('#5a3e26', 0.25))
        }
        for (let x = -1.3; x < 1.4; x += 0.35) if (Math.abs(x) > 0.5) b.lit.add(this.box, pen.m(x, 1.0, 1.35, 0.28, 2.0, 0.08), vary('#4a3420', 0.25))
        b.lit.add(this.box, pen.m(0, 2.3, 0, 3.2, 0.08, 3.2, 0, 0, 0.18), C('#6a6a62'))
        b.lit.add(this.cyl, pen.m(1.0, 3.2, 1.0, 0.03, 2.4, 0.03), C('#2a1a12'))
        b.glow.add(this.box, pen.m(1.3, 4.1, 1.0, 0.6, 0.35, 0.02), tint('#d82a1a', 0.6))
        b.glow.add(this.box, pen.m(0, 1.0, 1.3, 0.8, 1.6, 0.02), tint('#ffb060', 0.35))
        b.dotL.add(pen.pt(0, 1.2, 1.6), C('#ffb060'), 0.5)
        for (let i = 0; i <= 14; i++) b.dotS.add(pen.pt(-1.5 + i * 0.21, 2.15 - Math.abs(Math.sin(i * 0.6)) * 0.12, 1.55), C(BULBS[i % BULBS.length]), 1.5)
        const sp = pen.pt(0, 1.0, 2.6)
        this.sign(seg, this.castle, sp.x, sp.y, sp.z, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 1.8, 0.45)
      }
    }

    // trail signpost
    if (chance(0.35)) {
      const s = rand(s0 + 8, L - 12)
      const sd = sign()
      const lat = sd * 4.9
      if (clear(lat, s, 1)) {
        pen.at(lat, 0, -s)
        b.lit.add(this.box, pen.m(0, 1.0, 0, 0.14, 2.0, 0.14), C('#3a2818'))
        this.sign(seg, this.mirkwood, lat - sd * 0.09, 1.6, -s, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 1.1, 0.55)
      }
    }

    // Will's abandoned bike with its flashlight still on
    if (chance(0.3)) {
      const s = rand(s0 + 10, L - 10)
      const sd = sign()
      const lat = sd * 4.7
      if (clear(lat, s, 1)) {
        pen.at(lat, 0.08, -s, rand(-0.4, 0.4), 1, 0, sd * (Math.PI / 2 - 0.1))
        this.bike(b.gloss, pen, '#a01a14')
        const fl = this.pen.at(lat - sd * 0.2, 0.1, -s + 0.8, rand(-0.8, 0.8))
        b.gloss.add(this.cyl, fl.m(0, 0, 0, 0.05, 0.22, 0.05, Math.PI / 2, 0, 0), C('#2a2a2a'))
        b.dotL.add(fl.pt(0, 0, -0.12), C('#fff0c0'), 1.2)
        b.add.add(this.coneOpen, fl.m(0, 0, -2.6, 0.9, 5, 0.9, -Math.PI / 2, 0, 0), C('#2a2414'))
      }
    }
  }

  // ---------------------------------------------------------------- HAWKINS LAB

  private lab(ctx: Ctx) {
    const { seg, L, b, s0, s1, inGap, edgeOK } = ctx
    const pen = new Pen()
    const wallX = HALF_W + 0.25

    for (const side of [-1, 1]) {
      // hazard chevrons along the floor edge
      for (let s = s0 + 0.5; s < s1; s += 1) {
        if (!edgeOK(side, s)) continue
        b.lit.add(this.box, pen.m(side * 3.3, 0.006, -s, 0.36, 0.012, 0.42, 0, side * 0.6, 0), C('#c8a01a'))
      }
      // pipe runs with brackets and valves
      for (const [a, c] of this.runs(ctx, side, s0, s1)) {
        const len = c - a
        const mid = -(a + c) / 2
        const pipes: [number, number, number, string][] = [
          [3.45, 0.09, 0.2, '#6a2620'],
          [3.72, 0.07, 0.17, '#5a6066'],
          [3.95, 0.11, 0.22, '#7a6a2a'],
        ]
        for (const [y, r, off, col] of pipes) b.gloss.add(this.cyl, pen.m(side * (wallX - off), y, mid, r, len, r, Math.PI / 2, 0, 0), C(col))
        for (let s = a + 1; s < c; s += 2.5) b.lit.add(this.box, pen.m(side * (wallX - 0.12), 3.7, -s, 0.24, 0.8, 0.08), C('#2a2e30'))
        for (let s = a + 3; s < c; s += rand(9, 16)) b.gloss.add(this.torus, pen.m(side * (wallX - 0.2), 3.45, -s, 0.22, 0.22, 0.22, 0, Math.PI / 2, 0), C('#b01a14'))
        // skirting light strip
        b.glow.add(this.box, pen.m(side * (wallX - 0.02), 0.12, mid, 0.03, 0.05, len), tint('#5ae8ff', 0.5))
      }
      // wall-mounted equipment
      for (let s = s0 + 3; s < L - 1; s += rand(4, 7)) {
        if (!edgeOK(side, s - 1.2) || !edgeOK(side, s + 1.2)) continue
        const face = side * wallX
        const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2
        const p = this.pen.at(face, 0, -s, ry)
        const kind = Math.random()
        if (kind < 0.2) {
          // 80s CRT monitor on a bracket
          b.lit.add(this.box, p.m(0, 1.75, 0.3, 0.75, 0.6, 0.55), C('#b8b0a0'))
          b.glow.add(this.box, p.m(0, 1.78, 0.58, 0.56, 0.42, 0.02), tint(pick(['#3aff7a', '#ffb03a', '#5ae8ff']), 0.55))
          b.dotL.add(p.pt(0, 1.78, 0.8), C('#3aff7a'), 0.35)
          b.lit.add(this.box, p.m(0, 1.35, 0.15, 0.4, 0.12, 0.3), C('#2a2e30'))
        } else if (kind < 0.4) {
          // control panel with blinking LEDs
          b.lit.add(this.box, p.m(0, 1.3, 0.1, 1.4, 0.9, 0.18), C('#3a4044'))
          b.lit.add(this.box, p.m(0, 0.9, 0.3, 1.4, 0.1, 0.5, -0.4, 0, 0), C('#2a2e30'))
          for (let i = 0; i < 12; i++) {
            const lx = -0.55 + (i % 6) * 0.22
            const ly = 1.15 + Math.floor(i / 6) * 0.3
            const col = C(pick(['#ff2a2a', '#3aff6a', '#ffd02a', '#36e3ff']))
            ;(chance(0.5) ? b.blink : b.glow).add(this.box, p.m(lx, ly, 0.2, 0.06, 0.06, 0.02), col)
          }
          b.dotBlink.add(p.pt(0, 1.4, 0.35), C('#ff2a2a'), 0.5)
        } else if (kind < 0.55) {
          this.sign(seg, pick(this.labSigns), face - side * 0.02, 2.2, -s, ry, 1.2, 0.6)
        } else if (kind < 0.65) {
          b.gloss.add(this.cyl, p.m(0, 0.95, 0.15, 0.11, 0.6, 0.11), C('#b01a14'))
          b.lit.add(this.box, p.m(0, 1.7, 0.03, 0.4, 0.3, 0.04), C('#b01a14'))
        } else if (kind < 0.85) {
          // observation window glimpsing the Upside Down
          b.lit.add(this.box, p.m(0, 1.9, 0.02, 2.3, 1.4, 0.1), C('#2a3034'))
          b.glow.add(this.box, p.m(0, 1.9, 0.06, 2.0, 1.1, 0.02), tint('#6a0a12', rand(0.5, 0.9)))
          b.add.add(this.box, p.m(0, 1.9, 0.3, 2.2, 1.3, 0.5), C('#1a0204'))
        } else {
          // heavy security door
          b.lit.add(this.box, p.m(0, 1.3, 0.04, 1.6, 2.6, 0.08), C('#4a5056'))
          b.lit.add(this.box, p.m(0, 2.75, 0.06, 1.9, 0.2, 0.12), C('#2a2e30'))
          for (let y = 0.5; y < 2.6; y += 0.6) b.lit.add(this.box, p.m(0, y, 0.09, 1.6, 0.18, 0.02, 0, 0, 0.6), C('#c8a01a'))
          b.blink.add(this.box, p.m(0.95, 2.0, 0.1, 0.12, 0.12, 0.04), C('#ff2a2a'))
        }
        // rotating alarm beacon above some stations
        if (chance(0.25)) {
          b.blink.add(this.cyl, p.m(0, 3.0, 0.15, 0.12, 0.2, 0.12), C('#ff1a1a'))
          b.dotBlink.add(p.pt(0, 3.0, 0.4), C('#ff1a1a'), 1)
        }
      }
    }

    // fluorescent fixtures under every ceiling beam, with light volumes
    for (let s = s0 + 3; s < L - HALF_W - 1; s += 7.5) {
      if (inGap(s, 1)) continue
      b.flicker.add(this.box, pen.m(0, 4.08, -s, 2.4, 0.04, 0.3), C('#d8f8ff'))
      b.add.add(this.cone4, pen.m(0, 2.05, -s, 3.0, 4.0, 1.3, 0, Math.PI / 4, 0), C('#0a1c20'))
      b.add.add(this.disc, pen.m(0, 0.02, -s, 3.0, 1, 1.4), C('#0c2428'))
    }
    // cable trays overhead
    for (const tx of [-1.6, 1.6]) {
      const end = L - HALF_W - 0.5
      b.lit.add(this.box, pen.m(tx, 4.55, -(s0 + end) / 2, 0.5, 0.06, end - s0), C('#3a4044'))
      b.lit.add(this.cyl, pen.m(tx, 4.62, -(s0 + end) / 2, 0.05, end - s0, 0.05, Math.PI / 2, 0, 0), C('#1a1a1a'))
    }

    // the Gate tearing through a wall
    if (chance(0.3)) {
      const s = rand(s0 + 12, L - 14)
      const side = sign()
      if (edgeOK(side, s - 2) && edgeOK(side, s + 2)) {
        const p = this.pen.at(side * (wallX - 0.02), 2, -s, side > 0 ? -Math.PI / 2 : Math.PI / 2)
        let x = 0
        let y = -1.6
        for (let i = 0; i < 9; i++) {
          const nx = x + rand(-0.6, 0.6)
          const ny = y + rand(0.25, 0.45)
          const len = Math.hypot(nx - x, ny - y)
          b.glow.add(this.box, p.m((x + nx) / 2, (y + ny) / 2, 0.04, 0.09, len + 0.05, 0.03, 0, 0, Math.atan2(nx - x, ny - y) * -1), C('#ff3a1a'))
          if (chance(0.5)) b.glow.add(this.box, p.m(nx + 0.3, ny, 0.04, 0.05, 0.6, 0.03, 0, 0, rand(-1.4, 1.4)), C('#ff2a1a'))
          x = nx
          y = ny
        }
        b.add.add(this.disc, p.m(0, 0, 0.1, 1.8, 1, 2.6, Math.PI / 2, 0, 0), C('#3a0406'))
        b.dotXL.add(p.pt(0, 0, 0.5), C('#ff2a1a'), 0.8)
        for (let k = 0; k < 4; k++) {
          const a = p.pt(rand(-0.3, 0.3), rand(-1, 0.5), 0.05).clone()
          const end = p.pt(rand(-2.5, 2.5), -2, rand(0.5, 2)).clone()
          const midp = a.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.4, 0))
          b.flesh.addGeo(this.tube([a, midp, end], rand(0.05, 0.1), 5, 12), C('#3a0a0c'))
        }
        b.add.add(this.disc, this.pen.at(side * 2.5, 0.02, -s).m(0, 0, 0, 2, 1, 2.5), C('#2a0204'))
      }
    }

    // chemical drums tucked against the walls
    for (let s = s0 + 5; s < L - 4; s += rand(8, 15)) {
      const side = sign()
      if (!edgeOK(side, s)) continue
      const col = pick(['#c8a018', '#2a4a8a', '#6a6e70'])
      for (let k = 0; k < (chance(0.5) ? 2 : 1); k++) {
        pen.at(side * 3.48, 0, -s - k * 0.55)
        b.gloss.add(this.cyl, pen.m(0, 0.38, 0, 0.24, 0.76, 0.24), vary(col))
        b.lit.add(this.torus, pen.m(0, 0.2, 0, 0.24, 0.24, 0.3, Math.PI / 2, 0, 0), C('#1a1a1a'))
      }
    }

    // end wall facing the runner at the junction
    const be = L + HALF_W + 0.6
    pen.at(0, 0, 0)
    b.lit.add(this.box, pen.m(-seg.turn * 0.32, 2.1, -be, HALF_W * 2 + 0.6, 4.2, 0.4), C('#56646a'))
    b.glow.add(this.box, pen.m(0, 3.6, -be + 0.22, HALF_W * 2, 0.08, 0.02), tint('#5ae8ff', 0.7))
    this.sign(seg, this.labSigns[1], 0, 1.1, -be + 0.22, 0, 2.2, 1.1)
    b.blink.add(this.cyl, pen.m(-2.4, 3.2, -be + 0.3, 0.14, 0.24, 0.14), C('#ff1a1a'))
    b.dotBlink.add(pen.pt(-2.4, 3.2, -be + 0.6), C('#ff1a1a'), 1)
  }

  // ---------------------------------------------------------------- STARCOURT MALL

  private mall(ctx: Ctx) {
    const { seg, L, b, s0, s1, clear, edgeOK } = ctx
    const pen = new Pen()
    const shopCols = ['#ff5ad8', '#5ae0ff', '#ffb43a', '#8a5aff', '#5aff9a']

    for (const side of [-1, 1]) {
      const sx = side * (HALF_W + 2.6)
      for (let s = s0 + 2; s < L + 4; s += 8) {
        if (!clear(sx, s + 4, 4.2)) continue
        const col = pick(shopCols)
        const cz = -(s + 4)
        pen.at(0, 0, 0)
        // shopfront: tinted glass, neon trims, fascia band and chrome pillars
        b.add.add(this.box, pen.m(sx, 1.8, cz, 0.06, 3.4, 7.3), tint(col, 0.14))
        b.glow.add(this.box, pen.m(sx - side * 0.05, 3.55, cz, 0.05, 0.06, 7.4), tint(col, 0.9))
        b.glow.add(this.box, pen.m(sx - side * 0.05, 0.08, cz, 0.05, 0.05, 7.4), tint(col, 0.6))
        b.lit.add(this.box, pen.m(sx, 4.15, cz, 0.45, 1.0, 8), C('#1a1222'))
        b.gloss.add(this.box, pen.m(sx, 2.3, -s, 0.5, 4.6, 0.5), C('#c8ccd4'))
        if (chance(0.7)) {
          const sign = new THREE.Mesh(this.assets.signGeo, pick(this.assets.neon))
          sign.position.set(sx - side * 0.26, 4.15, cz)
          sign.rotation.y = -side * (Math.PI / 2)
          sign.scale.setScalar(0.68)
          seg.group.add(sign)
        }
        // lit interior: back wall, floor glow, ceiling spots
        b.glow.add(this.box, pen.m(side * 10.2, 1.9, cz, 0.1, 3.8, 7.6), tint(col, 0.22))
        b.add.add(this.box, pen.m(side * 8.2, 0.02, cz, 4, 0.01, 7.4), tint(col, 0.12))
        for (const dz of [-2.4, 0, 2.4]) b.dotL.add(_v.set(side * 8.2, 3.5, cz + dz), C('#fff4e0'), 0.45)
        b.lit.add(this.box, pen.m(side * 8.2, 3.75, cz, 4, 0.1, 7.6), C('#140e18'))
        for (const dz of [-3.8, 3.8]) b.lit.add(this.box, pen.m(side * 8.2, 1.9, cz + dz, 4, 3.8, 0.12), C('#1e1626'))
        const kind = Math.random()
        if (kind < 0.3) {
          for (let k = 0; k < 4; k++) {
            const p = this.pen.at(side * rand(7, 9), 0, cz + rand(-2.6, 2.6), Math.random() * 6)
            b.lit.add(this.cyl, p.m(0, 0.05, 0, 0.25, 0.1, 0.25), C('#2a2a2e'))
            b.lit.add(this.cyl, p.m(0, 0.6, 0, 0.03, 1.1, 0.03), C('#8a8a8a'))
            b.lit.add(this.cyl, p.m(0, 1.4, 0, 0.18, 0.7, 0.14), vary(pick(['#d83a6a', '#3a8ad8', '#e8d03a', '#e8e0d8'])))
            b.lit.add(this.sphere, p.m(0, 1.93, 0, 0.13, 0.15, 0.13), C('#d8d0c8'))
          }
        } else if (kind < 0.55) {
          for (const dz of [-2.2, 0, 2.2]) {
            const p = this.pen.at(side * 8.8, 0, cz + dz, side > 0 ? -Math.PI / 2 : Math.PI / 2)
            b.lit.add(this.box, p.m(0, 0.98, 0, 0.95, 1.95, 0.85), C('#1a1030'))
            b.glow.add(this.box, p.m(0, 1.35, 0.44, 0.7, 0.55, 0.02), tint(pick(['#36e3ff', '#ff2fd0', '#ffd23a']), 0.85))
            b.glow.add(this.box, p.m(0, 1.85, 0.43, 0.85, 0.16, 0.02), tint(col, 0.9))
          }
        } else if (kind < 0.75) {
          // Scoops Ahoy counter with a giant cone
          b.lit.add(this.box, pen.m(side * 8.5, 0.55, cz, 1.0, 1.1, 6), C('#e8e4dc'))
          for (let dz = -2.8; dz < 3; dz += 0.7) b.lit.add(this.box, pen.m(side * 7.98, 0.55, cz + dz, 0.02, 1.1, 0.35), C('#d82a3a'))
          const p = this.pen.at(side * 7.0, 0, cz + rand(-2, 2))
          b.lit.add(this.cone, p.m(0, 1.0, 0, 0.35, 1.2, 0.35, Math.PI, 0, 0), C('#c8903a'))
          b.lit.add(this.sphere, p.m(0, 1.75, 0, 0.42, 0.4, 0.42), C('#f0b8c8'))
          b.lit.add(this.sphere, p.m(0, 2.2, 0, 0.36, 0.34, 0.36), C('#7a4a2a'))
          b.glow.add(this.sphere, p.m(0, 2.55, 0, 0.1, 0.1, 0.1), C('#ff2a2a'))
        } else {
          // electronics store: a wall of glowing TVs
          for (let r = 0; r < 3; r++)
            for (let k = 0; k < 5; k++) {
              const z = cz - 2.6 + k * 1.3
              b.lit.add(this.box, pen.m(side * 9.8, 0.8 + r * 0.95, z, 0.6, 0.8, 1.1), C('#1a1a1a'))
              b.glow.add(this.box, pen.m(side * 9.48, 0.8 + r * 0.95, z, 0.02, 0.62, 0.9), tint(pick(['#5a8acc', '#36e3ff', '#e8e0d8', '#ff5ad8']), rand(0.4, 0.8)))
            }
        }
      }

      // upper level balcony with glass railing and its own shopfronts
      for (const [a, c] of this.runs(ctx, side, s0, Math.min(s1, L + 4))) {
        const len = c - a
        const mid = -(a + c) / 2
        if (len < 2) continue
        b.gloss.add(this.box, pen.m(side * 7.35, 5.2, mid, 5.5, 0.35, len), C('#2a1a34'))
        b.glow.add(this.box, pen.m(side * 4.62, 5.0, mid, 0.04, 0.06, len), tint(side > 0 ? '#36e3ff' : '#ff2fd0', 0.9))
        b.gloss.add(this.cyl, pen.m(side * 4.75, 6.3, mid, 0.05, len, 0.05, Math.PI / 2, 0, 0), C('#c8ccd4'))
        b.add.add(this.box, pen.m(side * 4.75, 5.85, mid, 0.03, 0.9, len), C('#0a1a22'))
        for (let s = a; s < c; s += 2) b.gloss.add(this.box, pen.m(side * 4.75, 5.85, -s, 0.05, 0.95, 0.05), C('#c8ccd4'))
        b.add.add(this.box, pen.m(side * 9.5, 7.1, mid, 0.05, 3.3, len), tint(pick(shopCols), 0.12))
        b.glow.add(this.box, pen.m(side * 9.45, 8.85, mid, 0.05, 0.08, len), tint(pick(shopCols), 0.8))
        b.lit.add(this.box, pen.m(side * 9.6, 9.4, mid, 0.3, 1.0, len), C('#1a1222'))
        // floor neon edge strip
        b.glow.add(this.box, pen.m(side * (HALF_W + 0.08), 0.02, mid, 0.08, 0.02, len), tint(side > 0 ? '#36e3ff' : '#ff2fd0', 0.9))
      }

      // planters with palms, benches and bins between road and shops
      for (let s = s0 + 6; s < L; s += rand(9, 14)) {
        const x = side * 4.6
        if (!clear(x, s, 1)) continue
        const p = this.pen.at(x, 0, -s, Math.random() * 6)
        if (chance(0.6)) {
          b.gloss.add(this.cyl12, p.m(0, 0.35, 0, 0.55, 0.7, 0.55), C('#d8d0c8'))
          b.lit.add(this.cyl12, p.m(0, 0.71, 0, 0.5, 0.02, 0.5), C('#2a1a10'))
          for (let k = 0; k < 4; k++) b.lit.add(this.cyl, p.m(0, 0.9 + k * 0.6, 0, 0.11 - k * 0.012, 0.6, 0.11 - k * 0.012, 0, 0, k * 0.04), C('#6a4a2a'))
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2
            b.lit.add(this.cone4, p.m(Math.cos(a) * 0.6, 3.25, Math.sin(a) * 0.6, 0.18, 1.5, 0.04, Math.sin(a) * 1.9, -a, -Math.cos(a) * 1.9), vary('#2a6a3a', 0.2))
          }
        } else {
          b.lit.add(this.box, p.m(0, 0.42, 0, 0.5, 0.08, 1.8), C('#6a4a2a'))
          b.lit.add(this.box, p.m(side * 0.22, 0.75, 0, 0.06, 0.5, 1.8), C('#6a4a2a'))
          for (const z of [-0.75, 0.75]) b.gloss.add(this.box, p.m(0, 0.21, z, 0.5, 0.42, 0.08), C('#c8ccd4'))
        }
      }
    }

    // skylight trusses, glass roof glow and hanging banners
    for (let s = s0 + 4; s < L - HALF_W - 1; s += 10) {
      pen.at(0, 0, 0)
      b.gloss.add(this.box, pen.m(0, 10, -s, 20, 0.3, 0.4), C('#c8ccd4'))
      b.gloss.add(this.box, pen.m(0, 10.8, -s, 0.3, 1.6, 0.3), C('#c8ccd4'))
      for (const x of [-5, 5]) b.gloss.add(this.box, pen.m(x, 10.4, -s, 0.12, 0.8, 0.12, 0, 0, x > 0 ? 0.6 : -0.6), C('#c8ccd4'))
    }
    b.add.add(this.box, pen.m(0, 11.3, -(s0 + L) / 2, 20, 0.05, L - s0), C('#140a22'))
    for (let i = 0; i < 2; i++) {
      const s = rand(s0 + 10, L - 10)
      if (ctx.inGap(s, 2)) continue
      this.sign(seg, pick(this.banners), 0, 7.6, -s, 0, 5.5, 1.4)
      for (const x of [-2.6, 2.6]) b.lit.add(this.cyl, pen.m(x, 8.8, -s, 0.015, 1.0, 0.015), C('#8a8a8a'))
    }
    // balloons drifting under the skylights
    for (let i = 0; i < 3; i++) {
      const s = rand(s0 + 5, L - 5)
      const side = sign()
      const p = this.pen.at(side * rand(5, 6.5), 6.5, -s)
      for (let k = 0; k < 5; k++) {
        const bx = rand(-0.4, 0.4)
        const by = rand(1.0, 1.8)
        const bz = rand(-0.4, 0.4)
        b.gloss.add(this.sphere, p.m(bx, by, bz, 0.26, 0.32, 0.26), C(pick(['#ff2fd0', '#36e3ff', '#ffd23a', '#ff3a3a', '#8a5aff'])))
        b.lit.add(this.cyl, p.m(bx / 2, by / 2, bz / 2, 0.008, by, 0.008), C('#d8d8d8'))
      }
    }
    // storefront straight ahead at the junction
    const be = L + HALF_W + 2.4
    if (clear(0, be + 1, 0.5)) {
      const col = pick(shopCols)
      pen.at(0, 0, 0)
      b.add.add(this.box, pen.m(0, 1.8, -be, HALF_W * 2, 3.4, 0.06), tint(col, 0.16))
      b.glow.add(this.box, pen.m(0, 1.9, -be - 3, HALF_W * 2 + 2, 3.8, 0.1), tint(col, 0.25))
      b.lit.add(this.box, pen.m(0, 4.15, -be, HALF_W * 2 + 1, 1.0, 0.45), C('#1a1222'))
      const sign = new THREE.Mesh(this.assets.signGeo, this.assets.neon[NEON_WORDS.findIndex(([w]) => w === 'SCOOPS AHOY')] ?? this.assets.neon[0])
      sign.position.set(0, 4.15, -be + 0.26)
      sign.scale.setScalar(0.9)
      seg.group.add(sign)
    }
  }

  // ---------------------------------------------------------------- THE UPSIDE DOWN

  private upsideCommon(ctx: Ctx, tendrils: number) {
    const { L, b, s0, s1, clear, edgeOK } = ctx
    const G = -4.5

    // colossal tendrils rising from the abyss
    for (let i = 0; i < tendrils; i++) {
      const s = rand(s0, L + 20)
      const lat = sign() * rand(7, 28)
      if (!clear(lat, s, 3)) continue
      const h = rand(8, 18)
      const pts: THREE.Vector3[] = []
      const ph = Math.random() * 6
      for (let k = 0; k <= 6; k++) {
        const t = k / 6
        pts.push(new THREE.Vector3(lat + Math.sin(t * 4 + ph) * 1.6 * t, G + t * h, -s + Math.cos(t * 3 + ph) * 1.6 * t))
      }
      b.flesh.addGeo(this.tube(pts, rand(0.35, 0.6), 7, 28), vary('#2a0608'))
      for (let k = 0; k < 3; k++) {
        const base = pts[2 + k].clone()
        const tip = base.clone().add(new THREE.Vector3(rand(-3, 3), rand(1, 4), rand(-3, 3)))
        b.flesh.addGeo(this.tube([base, base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.6, 0)), tip], 0.12, 5, 10), vary('#3a0a0c'))
      }
      b.dotL.add(pts[6], C('#ff2a1a'), 0.6)
    }

    // vines dripping off the boardwalk
    for (let s = s0; s < s1; s += 2.2) {
      for (const side of [-1, 1]) {
        if (!edgeOK(side, s) || chance(0.45)) continue
        const a = new THREE.Vector3(side * 3.55, 0, -s)
        const drop = rand(1.4, 3.6)
        const end = new THREE.Vector3(side * (3.6 + rand(0.1, 0.8)), -drop, -s + rand(-0.6, 0.6))
        b.flesh.addGeo(this.tube([a, a.clone().lerp(end, 0.5).setX(side * 3.75), end], rand(0.03, 0.07), 4, 8), vary('#3a0a0c'))
      }
    }

    // glowing veins pulsing across the deck
    const pen = this.pen.at(0, 0, 0)
    for (let s = s0 + 1; s < s1 - 1; s += rand(1.5, 3.5)) {
      const side = sign()
      if (!edgeOK(side, s)) continue
      let x = side * rand(2.6, 3.4)
      let z = -s
      for (let k = 0; k < 3; k++) {
        const nx = THREE.MathUtils.clamp(x + rand(-0.4, 0.4), -3.45, 3.45)
        const nz = z - rand(0.4, 1.0)
        const len = Math.hypot(nx - x, nz - z)
        b.pulse.add(this.box, pen.m((x + nx) / 2, 0.006, (z + nz) / 2, 0.035, 0.01, len, 0, Math.atan2(nx - x, nz - z), 0), C('#ff2a1a'))
        x = nx
        z = nz
      }
    }

    // debris and rocks suspended in the air
    for (let i = 0; i < 12; i++) {
      const s = rand(s0, L + 15)
      const lat = sign() * rand(5, 22)
      if (!clear(lat, s, 1)) continue
      pen.at(lat, rand(0.5, 8), -s, Math.random() * 6, 1, Math.random() * 3, Math.random() * 3)
      if (chance(0.5)) b.lit.add(this.box, pen.m(0, 0, 0, rand(0.15, 0.3), 0.06, rand(0.8, 2)), vary('#2a1612'))
      else b.lit.add(this.dodeca, pen.m(0, 0, 0, rand(0.2, 0.6), rand(0.2, 0.5), rand(0.2, 0.6)), vary('#2a1416'))
    }
  }

  private upside(ctx: Ctx) {
    const { seg, L, b, s0, clear } = ctx
    const G = -4.5
    this.upsideCommon(ctx, 6)
    const pen = this.pen

    // the decayed Hawkins below: rotting cars, dead street lamps, mailboxes
    for (let i = 0; i < 6; i++) {
      const s = rand(s0 + 4, L)
      const lat = sign() * rand(7, 20)
      if (!clear(lat, s, 3)) continue
      const r = Math.random()
      pen.at(lat, G, -s, Math.random() * 6, 1, rand(-0.05, 0.05), rand(-0.08, 0.08))
      if (r < 0.4) {
        this.car(b, pen, '#2a1a18')
        for (let k = 0; k < 3; k++) {
          const a = pen.pt(rand(-1, 1), 0, rand(-2, 2)).clone()
          const c = pen.pt(rand(-1, 1), 0, rand(-2, 2)).clone()
          const top = a.clone().lerp(c, 0.5).setY(G + 1.8)
          b.flesh.addGeo(this.tube([a, top, c], 0.06, 4, 10), C('#3a0a0c'))
        }
      } else if (r < 0.75) {
        b.lit.add(this.cyl, pen.m(0, 2.6, 0, 0.09, 5.2, 0.09, 0, 0, rand(-0.25, 0.25)), C('#1a1414'))
        b.lit.add(this.box, pen.m(-0.6, 5.1, 0, 1.3, 0.08, 0.08), C('#1a1414'))
        b.flicker.add(this.box, pen.m(-1.2, 5.0, 0, 0.44, 0.06, 0.26), C('#ff4a3a'))
        b.add.add(this.coneOpen, pen.m(-1.2, 2.5, 0, 2.3, 5, 2.3), C('#2a0604'))
        b.dotL.add(pen.pt(-1.2, 4.9, 0), C('#ff3a2a'), 0.8)
      } else {
        b.lit.add(this.box, pen.m(0, 0.75, 0, 0.5, 0.75, 0.5), C('#141a2a'))
        b.lit.add(this.box, pen.m(0.4, 0.4, 0.5, 2.4, 0.8, 0.08, 0, 0.3, 0.2), C('#2a2018'))
      }
    }

    // Joyce's alphabet wall glowing with Christmas lights
    if (chance(0.22)) {
      const s = rand(s0 + 14, L - 12)
      const sd = sign()
      const lat = sd * 8.5
      if (clear(lat, s, 4)) {
        const ry = sd > 0 ? -Math.PI / 2 : Math.PI / 2
        pen.at(lat, 0, -s, ry)
        b.lit.add(this.box, pen.m(0, -0.7, -0.15, 7, 7.6, 0.25), C('#2a2018'))
        b.lit.add(this.roof, pen.m(0, 3.1, -1, 4.0, 2.2, 2.2), C('#140c0c'))
        const plane = this.sign(seg, this.alphabet, 0, 0, 0, ry, 6.4, 3.2)
        plane.position.copy(pen.pt(0, 0.8, 0.01))
        for (let r = 0; r < 3; r++) {
          const n = r === 0 ? 8 : 9
          for (let i = 0; i < n; i++) {
            const x = -3.2 + (70 + (i / (n - 1)) * 884) / 1024 * 6.4
            const y = 0.8 + 1.6 - ((70 + r * 150) / 512) * 3.2 + 0.18
            const col = C(BULBS[(i + r * 3) % BULBS.length])
            b.flicker.add(this.sphere, pen.m(x, y, 0.06, 0.05, 0.07, 0.05), col)
            b.dotS.add(pen.pt(x, y, 0.12), col, 1.8)
          }
        }
        b.lit.addGeo(
          this.tube(
            [pen.pt(-3.3, 2.5, 0.05).clone(), pen.pt(-1, 2.3, 0.05).clone(), pen.pt(1, 2.45, 0.05).clone(), pen.pt(3.3, 2.3, 0.05).clone()],
            0.01,
            3,
            16,
          ),
          C('#0a0a0a'),
        )
      }
    }

    // the Mind Flayer towering in the storm
    if (chance(0.35)) {
      const s = rand(L * 0.4, L + 40)
      const lat = sign() * rand(60, 90)
      const body = new THREE.Vector3(lat, 48, -s - 60)
      pen.at(body.x, body.y, body.z, Math.random() * 6)
      b.sil.add(this.sphere, pen.m(0, 0, 0, 16, 9, 12), C('#0e0204'))
      b.sil.add(this.sphere, pen.m(0, 6, 4, 9, 7, 8), C('#0e0204'))
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + rand(-0.2, 0.2)
        const reach = rand(30, 48)
        const knee = body.clone().add(new THREE.Vector3(Math.cos(a) * reach * 0.5, rand(6, 16), Math.sin(a) * reach * 0.5))
        const foot = body.clone().add(new THREE.Vector3(Math.cos(a) * reach, -body.y - 4, Math.sin(a) * reach))
        b.sil.addGeo(this.tube([body.clone(), knee, foot.clone().lerp(knee, 0.4), foot], rand(1.0, 1.8), 5, 16), C('#0e0204'))
      }
    }
  }

  // ---------------------------------------------------------------- VECNA'S LAIR

  private vecna(ctx: Ctx) {
    const { seg, L, b, s0, clear, inGap } = ctx
    this.upsideCommon(ctx, 4)
    const pen = this.pen

    // flesh vine arches forming a tunnel over the boardwalk
    for (let s = s0 + 8; s < L - HALF_W - 4; s += rand(16, 26)) {
      if (inGap(s, 3)) continue
      const w = rand(6, 7.5)
      const top = rand(7, 9)
      const pts = [
        new THREE.Vector3(-w, -4.5, -s),
        new THREE.Vector3(-w + 0.8, 2, -s + rand(-1, 1)),
        new THREE.Vector3(-3.4, top - 1.5, -s),
        new THREE.Vector3(0, top, -s + rand(-1, 1)),
        new THREE.Vector3(3.4, top - 1.5, -s),
        new THREE.Vector3(w - 0.8, 2, -s + rand(-1, 1)),
        new THREE.Vector3(w, -4.5, -s),
      ]
      b.flesh.addGeo(this.tube(pts, 0.42, 7, 36), vary('#2a0608'))
      const twist = pts.map((p, i) => p.clone().add(new THREE.Vector3(Math.sin(i * 1.7) * 0.6, Math.cos(i * 1.3) * 0.4, 0.6)))
      b.flesh.addGeo(this.tube(twist, 0.16, 5, 30), vary('#3a0a0c'))
      for (let k = 0; k < 4; k++) {
        const p = pts[2 + Math.floor(Math.random() * 3)].clone()
        b.flesh.addGeo(this.tube([p, p.clone().add(new THREE.Vector3(rand(-0.4, 0.4), -rand(0.8, 1.8), 0))], 0.04, 4, 4), C('#3a0a0c'))
      }
      b.dotL.add(pts[3], C('#ff1a2a'), 0.9)
    }

    // floating rock islands carrying the Creel house, clocks and dead trees
    for (let i = 0; i < 4; i++) {
      const s = rand(s0, L + 20)
      const lat = sign() * rand(12, 30)
      if (!clear(lat, s, 6)) continue
      const y = rand(-3, 3)
      pen.at(lat, y, -s, Math.random() * 6)
      const r = rand(3, 5.5)
      b.lit.add(this.dodeca, pen.m(0, 0, 0, r, r * 0.35, r), vary('#2a1416'))
      for (let k = 0; k < 5; k++) b.lit.add(this.cone, pen.m(rand(-r, r) * 0.6, -r * 0.6, rand(-r, r) * 0.6, rand(0.6, 1.4), rand(2, 4.5), rand(0.6, 1.4), Math.PI, 0, 0), vary('#22100e'))
      const top = r * 0.3
      const kind = Math.random()
      if (kind < 0.35) {
        // the Creel house
        b.lit.add(this.box, pen.m(0, top + 2.2, 0, 4.6, 4.4, 4), C('#1a1214'))
        b.lit.add(this.roof, pen.m(0, top + 4.4, 0, 2.7, 2.4, 4.4), C('#0e0a0c'))
        b.lit.add(this.cyl, pen.m(2.4, top + 3, 1.6, 0.9, 6, 0.9), C('#1a1214'))
        b.lit.add(this.cone, pen.m(2.4, top + 7, 1.6, 1.1, 2.4, 1.1), C('#0e0a0c'))
        for (const [x, yy] of [
          [-1.2, 1.4],
          [1.2, 1.4],
          [-1.2, 3.2],
          [1.2, 3.2],
        ])
          b.flicker.add(this.box, pen.m(x, top + yy, 2.02, 0.7, 0.9, 0.04), tint('#ff2a1a', 0.7))
        b.flicker.add(this.box, pen.m(2.4, top + 5, 2.5, 0.4, 0.6, 0.04), tint('#ff2a1a', 0.8))
      } else if (kind < 0.7) {
        this.clock(b, pen, 0, top, 0)
      } else {
        for (let k = 0; k < 3; k++) {
          const base = pen.pt(rand(-2, 2), top, rand(-2, 2)).clone()
          const tip = base.clone().add(new THREE.Vector3(rand(-2, 2), rand(4, 7), rand(-2, 2)))
          b.lit.addGeo(this.tube([base, base.clone().lerp(tip, 0.5).add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1))), tip], 0.18, 5, 10), C('#140a0a'))
        }
      }
    }

    // Vecna's grandfather clocks drifting beside the path
    for (let i = 0; i < 2; i++) {
      const s = rand(s0 + 10, L - 6)
      const lat = sign() * rand(5.5, 8)
      if (!clear(lat, s, 1.5)) continue
      pen.at(lat, rand(0.5, 3.5), -s, rand(-1, 1), 1, rand(-0.3, 0.3), rand(-0.4, 0.4))
      this.clock(b, pen, 0, 0, 0)
    }

    // red rifts tearing the sky
    for (let i = 0; i < 3; i++) {
      const s = rand(s0, L + 30)
      const lat = sign() * rand(14, 32)
      pen.at(lat, rand(10, 22), -s, rand(0, 6))
      let x = 0
      let y = 0
      for (let k = 0; k < 8; k++) {
        const nx = x + rand(0.6, 1.6)
        const ny = y + rand(-1, 1)
        const len = Math.hypot(nx - x, ny - y)
        b.glow.add(this.box, pen.m((x + nx) / 2, (y + ny) / 2, 0, len + 0.1, rand(0.08, 0.22), 0.05, 0, 0, Math.atan2(ny - y, nx - x)), C('#ff3a2a'))
        x = nx
        y = ny
      }
      b.add.add(this.disc, pen.m(x / 2, 0, -0.2, x * 0.7, 1, 2.4, Math.PI / 2, 0, 0), C('#3a0306'))
      b.dotXL.add(pen.pt(x / 2, 0, 0), C('#ff2a1a'), 1)
    }
    void seg
  }

  private clock(b: Batches, pen: Pen, x: number, y: number, z: number) {
    b.lit.add(this.box, pen.m(x, y + 1.3, z, 0.9, 2.6, 0.55), C('#2a1810'))
    b.lit.add(this.box, pen.m(x, y + 2.75, z, 1.05, 0.35, 0.65), C('#22140c'))
    b.lit.add(this.box, pen.m(x, y + 0.1, z, 1.05, 0.2, 0.65), C('#22140c'))
    b.glow.add(this.cyl12, pen.m(x, y + 2.2, z + 0.29, 0.34, 0.02, 0.34, Math.PI / 2, 0, 0), tint('#d8c8a0', 0.55))
    b.lit.add(this.box, pen.m(x + 0.08, y + 2.23, z + 0.31, 0.03, 0.22, 0.01, 0, 0, -0.6), C('#0a0a0a'))
    b.lit.add(this.box, pen.m(x, y + 2.25, z + 0.31, 0.02, 0.28, 0.01, 0, 0, 0.3), C('#0a0a0a'))
    b.gloss.add(this.cyl12, pen.m(x, y + 1.0, z + 0.25, 0.16, 0.03, 0.16, Math.PI / 2, 0, 0), C('#c89a3a'))
    b.gloss.add(this.box, pen.m(x, y + 1.5, z + 0.25, 0.02, 0.9, 0.02), C('#c89a3a'))
    b.dotL.add(pen.pt(x, y + 2.2, z + 0.5), C('#ff2a1a'), 0.5)
  }
}
