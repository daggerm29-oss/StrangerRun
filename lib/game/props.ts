import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  makeAsphaltTexture,
  makeDirtTexture,
  makeSignTexture,
  makeTileTexture,
  makeBarrelTexture,
  makeHouseTexture,
  makeNeonTexture,
  makeRunBoardTexture,
  makeWoodTexture,
} from './textures'

export const LANE_W = 2.1
export const HALF_W = 3.5

function tube(points: THREE.Vector3[], radius: number, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points)
  return new THREE.TubeGeometry(curve, Math.max(12, points.length * 6), radius, radial, false)
}

function stripUv(g: THREE.BufferGeometry) {
  const n = g.toNonIndexed()
  n.deleteAttribute('uv')
  return n
}

function merge(list: THREE.BufferGeometry[]) {
  const g = mergeGeometries(list.map(stripUv))
  list.forEach((x) => x.dispose())
  return g
}

export const NEON_WORDS: [string, string][] = [
  ['ARCADE', '#ff2fd0'],
  ['HAWKINS', '#ff2a2a'],
  ['STARCOURT', '#36e3ff'],
  ['SCOOPS AHOY', '#ff7a2f'],
  ['PALACE', '#ff2fd0'],
  ['MOTEL', '#36e3ff'],
  ['RADIO SHACK', '#ff2a2a'],
  ['BENNY\u2019S', '#ffd23a'],
]

export class Assets {
  wood: THREE.MeshStandardMaterial
  woodDark = new THREE.MeshStandardMaterial({ color: '#2a1612', roughness: 0.85 })
  bark = new THREE.MeshStandardMaterial({ color: '#170d0d', roughness: 0.95 })
  flesh = new THREE.MeshStandardMaterial({
    color: '#3d0a0e',
    emissive: '#ff1626',
    emissiveIntensity: 0.4,
    roughness: 0.35,
  })
  fleshDark = new THREE.MeshStandardMaterial({ color: '#1e0507', roughness: 0.5, emissive: '#5a0006', emissiveIntensity: 0.3 })
  barrel: THREE.MeshStandardMaterial
  car = new THREE.MeshStandardMaterial({ color: '#23403f', roughness: 0.6, metalness: 0.4 })
  carDark = new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 0.3, metalness: 0.6 })
  tail = new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false })
  head = new THREE.MeshBasicMaterial({ color: '#fff2c0', toneMapped: false })
  house: THREE.MeshStandardMaterial
  roof = new THREE.MeshStandardMaterial({ color: '#0d0809', roughness: 0.9 })
  bulb = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
  coin = new THREE.MeshStandardMaterial({
    color: '#ffd24a',
    metalness: 0.7,
    roughness: 0.3,
    emissive: '#ff9d00',
    emissiveIntensity: 0.5,
  })
  rift = new THREE.MeshBasicMaterial({ color: '#ff1a1a', toneMapped: false, transparent: true, opacity: 0.9 })
  riftGlow = new THREE.MeshBasicMaterial({
    color: '#ff3030',
    toneMapped: false,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  runBoard: THREE.MeshStandardMaterial
  shieldOrb = new THREE.MeshBasicMaterial({ color: '#ff4d6d', toneMapped: false })
  magnetBody = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.4, metalness: 0.5 })
  magnetGlow = new THREE.MeshBasicMaterial({ color: '#36e3ff', toneMapped: false })
  halo: THREE.SpriteMaterial
  arrow = new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false, side: THREE.DoubleSide })
  neon: THREE.MeshBasicMaterial[]
  houseMats: THREE.MeshStandardMaterial[]

  postGeo = new THREE.BoxGeometry(0.22, 1.4, 0.22)
  railGeo = new THREE.BoxGeometry(0.14, 0.14, 1)
  bulbGeo = new THREE.SphereGeometry(0.07, 6, 4)
  coinGeo: THREE.BufferGeometry
  supportGeo = new THREE.BoxGeometry(0.3, 4.5, 0.3)
  treeGeos: THREE.BufferGeometry[] = []
  vineGeos: THREE.BufferGeometry[] = []
  tendrilGeos: THREE.BufferGeometry[] = []
  railVineGeos: THREE.BufferGeometry[] = []
  barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14)
  carBody: THREE.BufferGeometry
  carGlass: THREE.BufferGeometry
  pillarGeo: THREE.BufferGeometry
  houseGeo = new THREE.BoxGeometry(6, 5, 6)
  roofGeo = new THREE.ConeGeometry(4.8, 2.6, 4)
  signGeo = new THREE.PlaneGeometry(5.2, 1.6)
  signPoleGeo = new THREE.CylinderGeometry(0.08, 0.08, 6, 6)
  arrowGeo: THREE.ShapeGeometry

  // ---- zone floors & sides ----
  asphalt!: THREE.MeshStandardMaterial
  dirt!: THREE.MeshStandardMaterial
  labTile!: THREE.MeshStandardMaterial
  mallTile!: THREE.MeshStandardMaterial
  fleshFloor!: THREE.MeshStandardMaterial
  grass = new THREE.MeshStandardMaterial({ color: '#1f2c18', roughness: 1 })
  forestFloor = new THREE.MeshStandardMaterial({ color: '#1a1a0e', roughness: 1 })
  concrete = new THREE.MeshStandardMaterial({ color: '#3a4448', roughness: 0.9 })
  mallFloorSide = new THREE.MeshStandardMaterial({ color: '#2a1a34', roughness: 0.5, metalness: 0.2 })
  curb = new THREE.MeshStandardMaterial({ color: '#7a7a74', roughness: 0.9 })

  // ---- town ----
  metal = new THREE.MeshStandardMaterial({ color: '#4a4e54', roughness: 0.5, metalness: 0.6 })
  lampGlow = new THREE.MeshBasicMaterial({ color: '#ffd89a', toneMapped: false })
  coneMat = new THREE.MeshStandardMaterial({ color: '#ff6a1a', roughness: 0.6, emissive: '#5a1a00', emissiveIntensity: 0.4 })
  barricadeMat!: THREE.MeshStandardMaterial
  policeLight = new THREE.MeshBasicMaterial({ color: '#2a6aff', toneMapped: false })
  lampPoleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.2, 6)
  lampArmGeo = new THREE.BoxGeometry(1.4, 0.08, 0.08)
  lampHeadGeo = new THREE.BoxGeometry(0.5, 0.14, 0.3)
  coneGeo: THREE.BufferGeometry
  boardGeo = new THREE.BoxGeometry(2.0, 0.32, 0.08)
  legGeo = new THREE.BoxGeometry(0.08, 1.0, 0.08)

  // ---- forest ----
  logGeo: THREE.BufferGeometry
  bushGeo = new THREE.IcosahedronGeometry(1, 0)
  leaf = new THREE.MeshStandardMaterial({ color: '#132a14', roughness: 1, flatShading: true })

  // ---- lab ----
  laser = new THREE.MeshBasicMaterial({
    color: '#ff1a2a',
    toneMapped: false,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  laserGeo = new THREE.BoxGeometry(HALF_W * 2 + 0.6, 0.05, 0.05)
  emitterGeo = new THREE.BoxGeometry(0.25, 2.6, 0.25)
  labWall = new THREE.MeshStandardMaterial({ color: '#56646a', roughness: 0.7, metalness: 0.2 })
  labPanel = new THREE.MeshBasicMaterial({ color: '#5ae8ff', toneMapped: false })
  wallGeo = new THREE.BoxGeometry(0.4, 4.2, 2.5)
  panelGeo = new THREE.BoxGeometry(0.06, 0.18, 2.2)
  beamGeo = new THREE.BoxGeometry(HALF_W * 2 + 1.2, 0.3, 0.4)
  doorGeo = new THREE.BoxGeometry(1.9, 2.8, 0.35)
  doorMat!: THREE.MeshStandardMaterial

  // ---- mall ----
  cartGeo: THREE.BufferGeometry
  chrome = new THREE.MeshStandardMaterial({ color: '#c8ccd4', roughness: 0.25, metalness: 0.9 })
  arcadeGeo = new THREE.BoxGeometry(0.95, 1.95, 0.85)
  arcadeScreenGeo = new THREE.PlaneGeometry(0.7, 0.55)
  arcadeBody = new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.5 })
  arcadeScreens: THREE.MeshBasicMaterial[] = ['#36e3ff', '#ff2fd0', '#ffd23a'].map(
    (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }),
  )
  shopGlass: THREE.MeshBasicMaterial[] = ['#ff5ad8', '#5ae0ff', '#ffb43a', '#8a5aff'].map(
    (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.55 }),
  )
  shopGeo = new THREE.BoxGeometry(0.3, 3.6, 7.5)
  shopFrameGeo = new THREE.BoxGeometry(0.5, 4.6, 0.5)

  // ---- creatures & powers ----
  batBodyGeo = new THREE.SphereGeometry(0.16, 6, 4)
  batWingGeo: THREE.BufferGeometry
  bat = new THREE.MeshStandardMaterial({ color: '#2a0a0e', roughness: 0.6, emissive: '#5a0010', emissiveIntensity: 0.6, side: THREE.DoubleSide })
  rockGeo = new THREE.DodecahedronGeometry(0.8, 0)
  rock = new THREE.MeshStandardMaterial({ color: '#2a1416', roughness: 0.9, emissive: '#3a0006', emissiveIntensity: 0.4, flatShading: true })
  elevenOrb = new THREE.MeshBasicMaterial({ color: '#d79bff', toneMapped: false })

  constructor(dot: THREE.Texture) {
    const tiled = (tex: THREE.Texture, color = '#ffffff', rough = 0.8, metal = 0.05) =>
      new THREE.MeshStandardMaterial({ map: tex, color, roughness: rough, metalness: metal })
    this.asphalt = tiled(makeAsphaltTexture(), '#b8b8c0', 0.85)
    this.dirt = tiled(makeDirtTexture(), '#c8b8a8', 1)
    this.labTile = tiled(makeTileTexture('#9aa6aa', '#9aa6aa', '#3a4448', false), '#c8d8dc', 0.4, 0.1)
    this.mallTile = tiled(makeTileTexture('#e8e0d8', '#3a2a4a', '#2a1a30', true), '#e0d8e0', 0.25, 0.15)
    this.barricadeMat = new THREE.MeshStandardMaterial({ map: makeSignTexture('ROAD CLOSED', '#f2f2ec', '#d01a1a'), roughness: 0.6 })
    this.doorMat = new THREE.MeshStandardMaterial({ map: makeSignTexture('RESTRICTED', '#d8b020', '#141414'), roughness: 0.5, metalness: 0.4 })

    const cone = new THREE.ConeGeometry(0.32, 0.85, 10)
    cone.translate(0, 0.43, 0)
    const coneBase = new THREE.BoxGeometry(0.7, 0.06, 0.7)
    coneBase.translate(0, 0.03, 0)
    this.coneGeo = merge([cone, coneBase])

    const log = new THREE.CylinderGeometry(0.42, 0.48, HALF_W * 2 + 2.2, 9)
    log.rotateZ(Math.PI / 2)
    log.translate(0, 0.42, 0)
    const stubs: THREE.BufferGeometry[] = [log]
    for (let i = 0; i < 4; i++) {
      const x = -HALF_W + 0.8 + i * 1.8
      stubs.push(tube([new THREE.Vector3(x, 0.6, 0), new THREE.Vector3(x + 0.3, 1.0, 0.3), new THREE.Vector3(x + 0.6, 1.2, 0.1)], 0.07, 4))
    }
    this.logGeo = merge(stubs)

    const cart: THREE.BufferGeometry[] = []
    const basket = new THREE.BoxGeometry(0.9, 0.55, 1.1, 1, 1, 1)
    basket.translate(0, 0.75, 0)
    cart.push(basket)
    const handle = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5)
    handle.rotateZ(Math.PI / 2)
    handle.translate(0, 1.15, 0.6)
    cart.push(handle)
    for (const [x, z] of [[-0.38, -0.45], [0.38, -0.45], [-0.38, 0.45], [0.38, 0.45]]) {
      const leg = new THREE.CylinderGeometry(0.025, 0.025, 0.45, 4)
      leg.translate(x, 0.3, z)
      const wheel = new THREE.SphereGeometry(0.08, 6, 4)
      wheel.translate(x, 0.08, z)
      cart.push(leg, wheel)
    }
    this.cartGeo = merge(cart)

    const wing = new THREE.BufferGeometry()
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0.7, 0.05, 0, 0, 0, 0.18, 0.7, 0.05, 0, 0.45, -0.12, 0.12, 0, 0, 0.18], 3))
    wing.computeVertexNormals()
    this.batWingGeo = wing

    const woodTex = makeWoodTexture()
    this.wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6, metalness: 0.1, color: '#9a7d74' })
    this.fleshFloor = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.4,
      color: '#b04848',
      emissive: '#3a0004',
      emissiveIntensity: 0.6,
    })
    this.barrel = new THREE.MeshStandardMaterial({ map: makeBarrelTexture(), roughness: 0.5, metalness: 0.3 })
    this.runBoard = new THREE.MeshStandardMaterial({ map: makeRunBoardTexture(), roughness: 0.8 })
    this.house = new THREE.MeshStandardMaterial({ map: makeHouseTexture(), roughness: 0.9 })
    this.houseMats = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ map: makeHouseTexture(), roughness: 0.9 }))
    this.neon = NEON_WORDS.map(
      ([w, c]) =>
        new THREE.MeshBasicMaterial({
          map: makeNeonTexture(w, c),
          transparent: true,
          toneMapped: false,
          fog: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
    )
    this.halo = new THREE.SpriteMaterial({
      map: dot,
      color: '#ff4d6d',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })

    const coin = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20)
    coin.rotateX(Math.PI / 2)
    this.coinGeo = coin

    for (let v = 0; v < 3; v++) this.treeGeos.push(this.buildTree())
    for (let v = 0; v < 4; v++) this.vineGeos.push(this.buildVineWall())
    for (let v = 0; v < 3; v++) this.tendrilGeos.push(this.buildTendrils())
    for (let v = 0; v < 3; v++) this.railVineGeos.push(this.buildRailVine())

    const body = new THREE.BoxGeometry(1.8, 0.8, 3.8)
    body.translate(0, 0.65, 0)
    const hood = new THREE.BoxGeometry(1.7, 0.2, 1.2)
    hood.translate(0, 1.0, -1.1)
    const wheels: THREE.BufferGeometry[] = []
    for (const [x, z] of [
      [-0.9, -1.2],
      [0.9, -1.2],
      [-0.9, 1.2],
      [0.9, 1.2],
    ]) {
      const w = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 10)
      w.rotateZ(Math.PI / 2)
      w.translate(x, 0.36, z)
      wheels.push(w)
    }
    this.carBody = merge([body, hood, ...wheels])
    const cabin = new THREE.BoxGeometry(1.6, 0.7, 1.9)
    cabin.translate(0, 1.4, 0.3)
    this.carGlass = merge([cabin])

    const pillar: THREE.BufferGeometry[] = []
    const base = new THREE.CylinderGeometry(0.35, 0.7, 2.6, 8)
    base.translate(0, 1.3, 0)
    pillar.push(base)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const pts = [
        new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5),
        new THREE.Vector3(Math.cos(a) * 0.4, 1.2, Math.sin(a) * 0.4),
        new THREE.Vector3(Math.cos(a + 0.6) * 0.7, 2.3, Math.sin(a + 0.6) * 0.7),
        new THREE.Vector3(Math.cos(a + 1) * 1.1, 2.9, Math.sin(a + 1) * 1.1),
      ]
      pillar.push(tube(pts, 0.08, 5))
    }
    this.pillarGeo = merge(pillar)

    const arrow = new THREE.Shape()
    arrow.moveTo(-0.9, 0.25)
    arrow.lineTo(0.2, 0.25)
    arrow.lineTo(0.2, 0.6)
    arrow.lineTo(0.95, 0)
    arrow.lineTo(0.2, -0.6)
    arrow.lineTo(0.2, -0.25)
    arrow.lineTo(-0.9, -0.25)
    arrow.closePath()
    this.arrowGeo = new THREE.ShapeGeometry(arrow)

    void dot
  }

  private buildTree() {
    const parts: THREE.BufferGeometry[] = []
    const h = 7 + Math.random() * 4
    const trunk = new THREE.CylinderGeometry(0.18, 0.5, h, 7)
    trunk.translate(0, h / 2, 0)
    parts.push(trunk)
    const branches = 4 + Math.floor(Math.random() * 3)
    for (let i = 0; i < branches; i++) {
      const y = h * (0.45 + Math.random() * 0.5)
      const a = Math.random() * Math.PI * 2
      const len = 2 + Math.random() * 2.5
      const pts = [
        new THREE.Vector3(0, y, 0),
        new THREE.Vector3(Math.cos(a) * len * 0.5, y + len * 0.4, Math.sin(a) * len * 0.5),
        new THREE.Vector3(Math.cos(a + 0.3) * len, y + len * 0.55 + Math.random(), Math.sin(a + 0.3) * len),
      ]
      parts.push(tube(pts, 0.1, 4))
    }
    return merge(parts)
  }

  private buildVineWall() {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 6; i++) {
      const pts: THREE.Vector3[] = []
      const phase = Math.random() * 6
      for (let k = 0; k <= 8; k++) {
        const x = -HALF_W - 0.3 + (k / 8) * (HALF_W * 2 + 0.6)
        pts.push(new THREE.Vector3(x, 0.15 + Math.abs(Math.sin(k * 0.9 + phase)) * 0.55, (Math.random() - 0.5) * 0.6))
      }
      parts.push(tube(pts, 0.07 + Math.random() * 0.07, 6))
    }
    for (let i = 0; i < 10; i++) {
      const thorn = new THREE.ConeGeometry(0.06, 0.35, 4)
      thorn.translate((Math.random() - 0.5) * HALF_W * 2, 0.6 + Math.random() * 0.2, (Math.random() - 0.5) * 0.4)
      parts.push(thorn)
    }
    return merge(parts)
  }

  private buildTendrils() {
    const parts: THREE.BufferGeometry[] = []
    const beam = new THREE.CylinderGeometry(0.32, 0.38, HALF_W * 2 + 1.6, 8)
    beam.rotateZ(Math.PI / 2)
    beam.translate(0, 2.05, 0)
    parts.push(beam)
    for (const side of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.22, 0.3, 3.2, 6)
      post.translate(side * (HALF_W + 0.4), 1.6, 0)
      parts.push(post)
    }
    for (let i = 0; i < 9; i++) {
      const x = -HALF_W + 0.3 + (i / 8) * (HALF_W * 2 - 0.6)
      const end = 1.32 + Math.random() * 0.15
      const pts = [
        new THREE.Vector3(x, 2.0, 0),
        new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, (2 + end) / 2, (Math.random() - 0.5) * 0.3),
        new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, end, 0),
      ]
      parts.push(tube(pts, 0.05, 5))
    }
    return merge(parts)
  }

  private buildRailVine() {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 10; k++) {
      pts.push(new THREE.Vector3(Math.sin(k * 1.3) * 0.18, 0.4 + Math.abs(Math.sin(k * 0.7)) * 0.9, -k * 0.9))
    }
    return tube(pts, 0.06, 5)
  }
}
