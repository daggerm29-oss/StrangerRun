import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
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

  constructor(dot: THREE.Texture) {
    const woodTex = makeWoodTexture()
    this.wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6, metalness: 0.1, color: '#9a7d74' })
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
