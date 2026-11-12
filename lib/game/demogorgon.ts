import * as THREE from 'three'

const skin = new THREE.MeshStandardMaterial({ color: '#6a433c', roughness: 0.38, metalness: 0.05 })
const skinDark = new THREE.MeshStandardMaterial({ color: '#3a2220', roughness: 0.5 })
const petalInner = new THREE.MeshStandardMaterial({
  color: '#8a0d12',
  emissive: '#ff1a1a',
  emissiveIntensity: 0.35,
  roughness: 0.3,
  side: THREE.DoubleSide,
})
const teethMat = new THREE.MeshStandardMaterial({ color: '#f1e6d0', roughness: 0.3 })
const mouthMat = new THREE.MeshBasicMaterial({ color: '#1a0000' })

function capsule(r: number, len: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat)
  return m
}

/** limb segment hanging down from a pivot: returns pivot group */
function limb(r: number, len: number, mat: THREE.Material) {
  const pivot = new THREE.Group()
  const m = capsule(r, len, mat)
  m.position.y = -len / 2
  pivot.add(m)
  return pivot
}

function petalGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.22, 0.12, 0.26, 0.42, 0, 0.62)
  shape.bezierCurveTo(-0.26, 0.42, -0.22, 0.12, 0, 0)
  const g = new THREE.ShapeGeometry(shape, 10)
  return g
}

function buildHead(scale: number) {
  const head = new THREE.Group()
  const petals: THREE.Group[] = []
  const pg = petalGeometry()
  for (let i = 0; i < 5; i++) {
    const holder = new THREE.Group()
    holder.rotation.z = (i / 5) * Math.PI * 2
    const hinge = new THREE.Group()
    hinge.position.y = 0.08
    const front = new THREE.Mesh(pg, petalInner)
    const back = new THREE.Mesh(pg, skin)
    back.position.z = -0.012
    hinge.add(front, back)
    holder.add(hinge)
    head.add(holder)
    petals.push(hinge)
    // teeth along the inner petal
    for (let k = 0; k < 4; k++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 5), teethMat)
      tooth.position.set((k % 2 ? 1 : -1) * 0.06, 0.15 + k * 0.1, 0.02)
      tooth.rotation.x = Math.PI / 2
      hinge.add(tooth)
    }
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), mouthMat)
  mouth.position.z = -0.02
  head.add(mouth)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 16), petalInner)
  head.add(ring)
  head.scale.setScalar(scale)
  return { head, petals }
}

export class Demogorgon {
  root = new THREE.Group()
  body = new THREE.Group()
  legs: THREE.Group[] = []
  shins: THREE.Group[] = []
  arms: THREE.Group[] = []
  forearms: THREE.Group[] = []
  petals: THREE.Group[] = []
  headGroup: THREE.Group
  phase = 0
  open = 0.3

  constructor() {
    this.root.add(this.body)
    // forward is -Z
    const pelvis = capsule(0.22, 0.2, skin)
    pelvis.rotation.z = Math.PI / 2
    pelvis.position.y = 1.15
    this.body.add(pelvis)

    const torso = new THREE.Group()
    torso.position.y = 1.2
    torso.rotation.x = -0.45
    this.body.add(torso)
    const chest = capsule(0.27, 0.65, skin)
    chest.position.y = 0.5
    torso.add(chest)
    // ribs
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 5, 12, Math.PI), skinDark)
      rib.position.set(0, 0.35 + i * 0.13, -0.05)
      rib.rotation.set(Math.PI / 2, 0, Math.PI)
      torso.add(rib)
    }
    const neck = capsule(0.1, 0.25, skin)
    neck.position.set(0, 1.05, -0.08)
    neck.rotation.x = -0.6
    torso.add(neck)
    const { head, petals } = buildHead(1.15)
    head.position.set(0, 1.28, -0.28)
    head.rotation.y = Math.PI
    head.rotation.x = 0.2
    torso.add(head)
    this.headGroup = head
    this.petals = petals

    for (const side of [-1, 1]) {
      const thigh = limb(0.11, 0.5, skin)
      thigh.position.set(side * 0.2, 1.12, 0)
      this.body.add(thigh)
      const shin = limb(0.08, 0.55, skin)
      shin.position.y = -0.62
      thigh.add(shin)
      const foot = new THREE.Group()
      foot.position.y = -0.65
      shin.add(foot)
      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 5), skinDark)
        claw.rotation.x = -Math.PI / 2
        claw.position.set(c * 0.05, 0, -0.12)
        foot.add(claw)
      }
      this.legs.push(thigh)
      this.shins.push(shin)

      const arm = limb(0.08, 0.6, skin)
      arm.position.set(side * 0.36, 0.85, 0)
      arm.rotation.z = side * 0.35
      torso.add(arm)
      const fore = limb(0.06, 0.7, skin)
      fore.position.y = -0.72
      arm.add(fore)
      const hand = new THREE.Group()
      hand.position.y = -0.82
      fore.add(hand)
      for (let c = 0; c < 4; c++) {
        const finger = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.38, 5), skinDark)
        finger.position.set((c - 1.5) * 0.04, -0.17, -0.02 * c)
        finger.rotation.x = Math.PI + (c - 1.5) * 0.12
        hand.add(finger)
      }
      this.arms.push(arm)
      this.forearms.push(fore)
    }
    this.root.scale.setScalar(1.1)
  }

  update(dt: number, speed: number, roar: number) {
    this.phase += dt * (4 + speed * 0.35)
    const p = this.phase
    for (let i = 0; i < 2; i++) {
      const o = i === 0 ? 0 : Math.PI
      this.legs[i].rotation.x = Math.sin(p + o) * 0.9
      this.shins[i].rotation.x = Math.max(0, Math.sin(p + o + 1.4)) * 1.3
      this.arms[i].rotation.x = -Math.sin(p + o) * 0.9 - 0.6 - roar * 1.2
      this.forearms[i].rotation.x = -0.6 - Math.max(0, Math.sin(p + o)) * 0.6
    }
    this.body.position.y = Math.abs(Math.sin(p)) * 0.12
    this.body.rotation.z = Math.sin(p) * 0.06
    const target = 0.25 + roar * 0.9 + Math.sin(p * 0.5) * 0.08
    this.open += (target - this.open) * Math.min(1, dt * 8)
    for (const petal of this.petals) petal.rotation.x = (1 - Math.min(1, this.open)) * 1.25 - 0.15
  }
}

export class Demodog {
  root = new THREE.Group()
  legs: THREE.Group[] = []
  petals: THREE.Group[] = []
  phase = Math.random() * 10

  constructor() {
    const body = capsule(0.22, 0.75, skin)
    body.rotation.x = Math.PI / 2
    body.position.y = 0.62
    this.root.add(body)
    const { head, petals } = buildHead(0.75)
    head.position.set(0, 0.75, -0.62)
    head.rotation.y = Math.PI
    this.root.add(head)
    this.petals = petals
    const spots: [number, number][] = [
      [-0.16, -0.32],
      [0.16, -0.32],
      [-0.16, 0.32],
      [0.16, 0.32],
    ]
    for (const [x, z] of spots) {
      const leg = limb(0.06, 0.48, skin)
      leg.position.set(x, 0.6, z)
      this.root.add(leg)
      this.legs.push(leg)
    }
    const tail = capsule(0.04, 0.4, skinDark)
    tail.position.set(0, 0.7, 0.6)
    tail.rotation.x = 0.9
    this.root.add(tail)
  }

  update(dt: number) {
    this.phase += dt * 14
    const p = this.phase
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(p + (i % 2 === 0 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.8))
    for (const petal of this.petals) petal.rotation.x = 0.5 + Math.sin(p * 0.3) * 0.5
  }
}
