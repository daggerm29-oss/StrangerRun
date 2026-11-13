import * as THREE from 'three'
import { HALF_W } from './props'

/** Hidden ambusher waiting in a front lawn. t < 0 until the runner comes close enough to trigger it. */
export interface Lurk {
  side: number
  t: number
  homeX: number
  toX: number
  /** current lateral position, used for collision */
  x: number
}

const ROOT_BASE = HALF_W + 3.2
const ROOT_LEN = ROOT_BASE + 1.0
const ZOMBIE_HOME = HALF_W + 2.6

const easeOut = (t: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3)
const easeIn = (t: number) => Math.pow(THREE.MathUtils.clamp(t, 0, 1), 2.2)

/** A tube that tapers from a thick lawn base to a thin tip, with knotted bulges along its length. */
function taperedTube(points: THREE.Vector3[], radius: number, tip: number) {
  const curve = new THREE.CatmullRomCurve3(points)
  const tubular = 56
  const radial = 9
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let k = 0; k < pos.count; k++) {
    const i = Math.floor(k / (radial + 1))
    const u = i / tubular
    curve.getPointAt(Math.min(1, u), c)
    v.fromBufferAttribute(pos, k).sub(c)
    const knots = 1 + Math.sin(u * 38) * 0.14 + Math.sin(u * 91 + 1.3) * 0.06
    v.multiplyScalar((1 - (1 - tip) * u) * knots)
    pos.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z)
  }
  geo.computeVertexNormals()
  return geo
}

let shared: {
  root: THREE.BufferGeometry
  tendril: THREE.BufferGeometry
  crater: THREE.BufferGeometry
  limb: THREE.BufferGeometry
  torso: THREE.BufferGeometry
  head: THREE.BufferGeometry
  eye: THREE.BufferGeometry
  blob: THREE.BufferGeometry
  skin: THREE.MeshStandardMaterial
  shirt: THREE.MeshStandardMaterial
  pants: THREE.MeshStandardMaterial
  eyeMat: THREE.MeshBasicMaterial
  dirt: THREE.MeshStandardMaterial
} | null = null

function kit() {
  if (shared) return shared
  shared = {
    // points along -X so the root reaches from the lawn on the right across the road
    root: taperedTube(
      [
        new THREE.Vector3(0, -0.15, 0),
        new THREE.Vector3(-1.4, 0.32, 0.25),
        new THREE.Vector3(-3.3, 0.42, -0.2),
        new THREE.Vector3(-5.2, 0.34, 0.2),
        new THREE.Vector3(-ROOT_LEN, 0.18, 0),
      ],
      0.36,
      0.25,
    ),
    tendril: taperedTube(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, 0.6, 0.1), new THREE.Vector3(-0.1, 1.2, -0.1), new THREE.Vector3(0.1, 1.7, 0)],
      0.12,
      0.15,
    ),
    crater: new THREE.CircleGeometry(1.1, 14).rotateX(-Math.PI / 2),
    limb: new THREE.BoxGeometry(1, 1, 1),
    torso: new THREE.BoxGeometry(0.5, 0.66, 0.28),
    head: new THREE.IcosahedronGeometry(0.17, 1),
    eye: new THREE.SphereGeometry(0.03, 6, 4),
    blob: new THREE.IcosahedronGeometry(0.12, 0),
    skin: new THREE.MeshStandardMaterial({ color: '#7d8a6c', roughness: 0.85 }),
    shirt: new THREE.MeshStandardMaterial({ color: '#5b2621', roughness: 0.95 }),
    pants: new THREE.MeshStandardMaterial({ color: '#232a3a', roughness: 0.95 }),
    eyeMat: new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false }),
    dirt: new THREE.MeshStandardMaterial({ color: '#120a08', roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }),
  }
  return shared
}

/** Fleshy root that erupts from a front lawn and slams down across two lanes. Jump it or take the far lane. */
export function buildRoots(side: number, flesh: THREE.Material, fleshDark: THREE.Material) {
  const k = kit()
  const g = new THREE.Group()
  const base = new THREE.Group()
  base.position.x = side * ROOT_BASE
  base.rotation.y = side > 0 ? 0 : Math.PI
  g.add(base)

  const crater = new THREE.Mesh(k.crater, k.dirt)
  crater.position.y = 0.03
  crater.visible = false
  base.add(crater)

  const pivot = new THREE.Group()
  base.add(pivot)
  const root = new THREE.Mesh(k.root, flesh)
  pivot.add(root)
  const tendrils: THREE.Object3D[] = []
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(k.tendril, i === 1 ? fleshDark : flesh)
    t.position.set((Math.random() - 0.2) * 0.8, 0, (Math.random() - 0.5) * 1.2)
    t.scale.setScalar(0.6 + Math.random() * 0.5)
    t.userData.phase = Math.random() * Math.PI * 2
    base.add(t)
    tendrils.push(t)
  }
  g.userData = { pivot, crater, tendrils }
  g.visible = false
  return g
}

/** Infected Hawkins resident that claws up out of the lawn and lunges into a lane. */
export function buildZombie(side: number, fleshDark: THREE.Material) {
  const k = kit()
  const g = new THREE.Group()
  const body = new THREE.Group()
  g.add(body)
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.scale.set(sx, sy, sz)
    return mesh
  }
  const legL = part(k.limb, k.pants, -0.13, 0.45, 0, 0.19, 0.9, 0.21)
  const legR = part(k.limb, k.pants, 0.13, 0.45, 0, 0.19, 0.9, 0.21)
  body.add(legL, legR)

  const upper = new THREE.Group()
  upper.position.y = 0.9
  upper.rotation.x = 0.28
  body.add(upper)
  upper.add(part(k.torso, k.shirt, 0, 0.33, 0))
  // Upside Down infection bursting through the shirt
  upper.add(part(k.blob, fleshDark, 0.12, 0.42, 0.13, 1.1, 0.9, 0.7))
  upper.add(part(k.blob, fleshDark, -0.16, 0.2, 0.12, 0.8, 0.8, 0.6))

  const head = new THREE.Group()
  head.position.set(0, 0.82, 0.04)
  head.rotation.z = 0.25
  upper.add(head)
  head.add(part(k.head, k.skin, 0, 0, 0, 1, 1.12, 1))
  head.add(part(k.eye, k.eyeMat, -0.065, 0.03, 0.15))
  head.add(part(k.eye, k.eyeMat, 0.065, 0.03, 0.15))

  const arms: THREE.Group[] = []
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group()
    shoulder.position.set(sx * 0.32, 0.6, 0)
    shoulder.rotation.x = -1.35
    shoulder.add(part(k.limb, k.shirt, 0, -0.18, 0, 0.14, 0.36, 0.14))
    shoulder.add(part(k.limb, k.skin, 0, -0.5, 0, 0.11, 0.34, 0.11))
    shoulder.userData.sx = sx
    upper.add(shoulder)
    arms.push(shoulder)
  }

  const crater = new THREE.Mesh(k.crater, k.dirt)
  crater.scale.setScalar(0.75)
  crater.position.set(side * ZOMBIE_HOME, 0.03, 0)
  crater.visible = false
  g.add(crater)

  body.position.x = side * ZOMBIE_HOME
  g.userData = { body, upper, head, arms, legL, legR, crater }
  g.visible = false
  return g
}

export const zombieHome = (side: number) => side * ZOMBIE_HOME

/** Animate a triggered roots/zombie ambush. */
export function updateLurker(kind: 'roots' | 'zombie', obj: THREE.Object3D, lurk: Lurk, dt: number, time: number) {
  lurk.t += dt
  const t = lurk.t
  const u = obj.userData
  if (kind === 'roots') {
    const pivot = u.pivot as THREE.Object3D
    const REAR = -1.35
    const rise = easeOut(t / 0.22)
    const slam = easeIn((t - 0.32) / 0.26)
    const bounce = t > 0.58 ? Math.sin((t - 0.58) * 22) * Math.exp(-(t - 0.58) * 7) * 0.08 : 0
    pivot.position.y = -6 * (1 - rise)
    pivot.rotation.z = REAR * (1 - slam) - bounce
    // writhing once it has landed
    pivot.rotation.x = Math.sin(time * 5 + lurk.side) * 0.05 * slam
    ;(u.crater as THREE.Object3D).visible = true
    for (const td of u.tendrils as THREE.Object3D[]) {
      const p = td.userData.phase as number
      td.rotation.z = Math.sin(time * 4 + p) * 0.45
      td.rotation.x = Math.cos(time * 3.3 + p) * 0.35
      td.position.y = -1.8 * (1 - rise)
    }
    return
  }

  const body = u.body as THREE.Object3D
  const upper = u.upper as THREE.Object3D
  const head = u.head as THREE.Object3D
  const arms = u.arms as THREE.Object3D[]
  ;(u.crater as THREE.Object3D).visible = true
  const rise = easeOut(t / 0.32)
  const lunge = easeOut((t - 0.3) / 0.45)
  const x = THREE.MathUtils.lerp(lurk.homeX, lurk.toX, lunge)
  const moving = t > 0.3 && t < 0.75
  body.position.set(x + Math.sin(time * 3) * 0.06 * lunge, -2 * (1 - rise) + (Math.random() - 0.5) * 0.04 * (1 - rise), 0)
  // twist toward the lunge direction, then turn to face the runner
  body.rotation.y = moving ? -lurk.side * 0.7 : -lurk.side * 0.7 * (1 - lunge)
  upper.rotation.x = 0.28 + (moving ? 0.25 : 0) + Math.sin(time * 2.2) * 0.06
  head.rotation.z = 0.25 + Math.sin(time * 6.1) * 0.12 * (Math.sin(time * 1.3) > 0.6 ? 1 : 0.15)
  for (const a of arms) {
    const sx = a.userData.sx as number
    a.rotation.x = -1.35 + Math.sin(time * 5 + sx) * 0.22
    a.rotation.z = sx * 0.1 + Math.sin(time * 3.7 + sx * 2) * 0.08
  }
  const step = Math.sin(time * (moving ? 18 : 6))
  ;(u.legL as THREE.Object3D).rotation.x = step * 0.4
  ;(u.legR as THREE.Object3D).rotation.x = -step * 0.4
  lurk.x = x
}
