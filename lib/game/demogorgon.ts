import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

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

/**
 * The supplied Demogorgon GLB is a static sculpt (no skeleton), so its gallop is
 * produced in the vertex shader. Model space is centimetres, Z up, -Y is the front:
 * legs below the hips (z≈80), arms hang from the shoulders (|x|>24, z≈128), head above z≈140.
 */
const demoHeader = /* glsl */ `
uniform float uDPhase;
uniform float uDStride;
uniform float uDReach;
uniform float uDLean;
uniform float uDHeadPitch;
uniform float uDHeadYaw;
uniform float uDSpread;
vec2 dRot(vec2 v, float a){ float c = cos(a); float s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
vec3 demoDeform(vec3 p){
  float side = p.x >= 0.0 ? 1.0 : -1.0;
  float ph = uDPhase + (side > 0.0 ? 0.0 : 3.14159);
  float legW = 1.0 - smoothstep(72.0, 86.0, p.z);
  if (legW > 0.0) {
    float thigh = sin(ph) * uDStride;
    thigh *= thigh < 0.0 ? 1.25 : 0.85;
    float knee = (max(0.0, -cos(ph)) * 1.5 + max(0.0, sin(ph)) * 0.45) * uDStride + 0.18;
    float kneeW = 1.0 - smoothstep(34.0, 48.0, p.z);
    vec2 yz = dRot(vec2(p.y, p.z - 41.0), knee * kneeW);
    p.y = yz.x; p.z = 41.0 + yz.y;
    yz = dRot(vec2(p.y, p.z - 82.0), thigh * legW);
    p.y = yz.x; p.z = 82.0 + yz.y;
  }
  float armW = smoothstep(21.0, 30.0, abs(p.x)) * (1.0 - smoothstep(120.0, 133.0, p.z));
  if (armW > 0.0) {
    float swing = -sin(ph) * uDStride * 0.7 - uDReach;
    vec2 xz = dRot(vec2(p.x - side * 30.0, p.z - 128.0), side * uDSpread);
    p.x = side * 30.0 + mix(p.x - side * 30.0, xz.x, armW);
    p.z = 128.0 + mix(p.z - 128.0, xz.y, armW);
    vec2 yz = dRot(vec2(p.y, p.z - 128.0), swing * armW);
    p.y = yz.x; p.z = 128.0 + yz.y;
  }
  float headW = smoothstep(126.0, 148.0, p.z);
  if (headW > 0.0) {
    vec2 yz = dRot(vec2(p.y, p.z - 134.0), uDHeadPitch * headW);
    p.y = yz.x; p.z = 134.0 + yz.y;
    vec2 xy = dRot(p.xy, uDHeadYaw * headW);
    p.x = xy.x; p.y = xy.y;
  }
  float torsoW = smoothstep(78.0, 96.0, p.z);
  vec2 yz = dRot(vec2(p.y, p.z - 82.0), uDLean * torsoW);
  p.y = yz.x; p.z = 82.0 + yz.y;
  return p;
}
`

const TARGET_HEIGHT = 2.7

export class Demogorgon {
  root = new THREE.Group()
  private body = new THREE.Group()
  phase = 0
  /** forward lunge in metres, read by the engine to close the gap in bursts */
  surge = 0
  private surgeT = 2.5
  private surgeV = 0
  private twitchT = 0
  private twitch = 0
  private uniforms = {
    uDPhase: { value: 0 },
    uDStride: { value: 0.6 },
    uDReach: { value: 0.6 },
    uDLean: { value: 0.5 },
    uDHeadPitch: { value: 0 },
    uDHeadYaw: { value: 0 },
    uDSpread: { value: 0 },
  }

  constructor() {
    this.root.add(this.body)
  }

  async load(url: string) {
    try {
      const gltf = await new GLTFLoader().loadAsync(url)
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const scale = TARGET_HEIGHT / (box.max.y - box.min.y)
      model.scale.setScalar(scale)
      model.position.y = -box.min.y * scale
      // the sculpt faces +Z; the chase rig faces -Z
      model.rotation.y = Math.PI
      const uniforms = this.uniforms
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.frustumCulled = false
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          m.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms)
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', `#include <common>\n${demoHeader}`)
              .replace(
                '#include <beginnormal_vertex>',
                `vec3 objectNormal = normalize(demoDeform(position + normal * 0.6) - demoDeform(position));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif`,
              )
              .replace('#include <begin_vertex>', 'vec3 transformed = demoDeform(position);')
          }
          m.customProgramCacheKey = () => 'demogorgon-deform'
          const std = m as THREE.MeshStandardMaterial
          if (std.isMeshStandardMaterial) {
            std.roughness = Math.min(std.roughness ?? 0.6, 0.55)
            std.envMapIntensity = 1.2
          }
          m.needsUpdate = true
        }
      })
      this.body.add(model)
    } catch (err) {
      console.log('[v0] demogorgon load failed', err)
    }
  }

  /** roar 0..1 rears the monster up with arms flung wide and head thrashing */
  update(dt: number, speed: number, roar: number) {
    const u = this.uniforms
    const k = 1 - Math.exp(-dt * 8)
    const running = speed > 0.5
    this.phase += dt * (running ? 5.5 + speed * 0.42 : 1.2)
    const p = this.phase
    u.uDPhase.value = p

    // lunges: every few seconds it bursts forward, then falls back to its pace
    this.surgeT -= dt
    if (running && this.surgeT <= 0) {
      this.surgeV = 4.5
      this.surgeT = 2.2 + Math.random() * 3
    }
    this.surge += this.surgeV * dt
    this.surgeV -= dt * 9
    if (this.surge <= 0) {
      this.surge = 0
      this.surgeV = Math.max(0, this.surgeV)
    }
    this.surge = Math.min(this.surge, 1.4)
    const lunging = this.surgeV > 0 ? 1 : 0

    // sudden head twitches like a predator sniffing for prey
    this.twitchT -= dt
    if (this.twitchT <= 0) {
      this.twitch = (Math.random() - 0.5) * 0.7
      this.twitchT = 0.35 + Math.random() * 1.2
    }

    const stride = running ? 0.62 + Math.min(speed, 32) * 0.009 : 0.12
    const lean = running ? 0.55 + lunging * 0.25 - roar * 0.5 : 0.2 - roar * 0.15
    const reach = running ? 0.75 + lunging * 0.7 + roar * 1.1 : 0.35 + roar * 1.3
    const spread = roar * 0.55
    const pitch = -0.35 * lean + roar * -0.5 + Math.sin(p * 2) * 0.06
    const yaw = this.twitch * (1 - roar) + Math.sin(this.phase * 9) * 0.12 * roar
    u.uDStride.value += (stride - u.uDStride.value) * k
    u.uDLean.value += (lean - u.uDLean.value) * k
    u.uDReach.value += (reach - u.uDReach.value) * k
    u.uDSpread.value += (spread - u.uDSpread.value) * k
    u.uDHeadPitch.value += (pitch - u.uDHeadPitch.value) * k
    u.uDHeadYaw.value += (yaw - u.uDHeadYaw.value) * Math.min(1, dt * 14)

    // galloping body: heavy bounce on each footfall, shoulders rolling side to side
    const bounce = running ? Math.pow(Math.abs(Math.sin(p)), 0.7) * 0.16 : Math.sin(p) * 0.02
    this.body.position.y = bounce
    this.body.rotation.z = Math.sin(p) * (running ? 0.07 : 0.02)
    this.body.rotation.y = Math.sin(p * 0.5) * 0.05
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
