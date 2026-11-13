import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { HALF_W } from './props'
import type { ZoneId } from './zones'

/** human-sized rift: a little taller than the runner, just wide enough to dive through */
const RIFT_W = 2.0
const RIFT_H = 2.8
const RIFT_Y = RIFT_H / 2
/** the opening torn through the wall, slightly inside the ring so its rim hides the cut */
const HOLE_A = RIFT_W * 0.46
const HOLE_B = RIFT_H * 0.46
const MOUNT_HALF = HALF_W + 3.2

type PortalState = 'hidden' | 'opening' | 'open' | 'closing'
type MountStyle = 'brick' | 'concrete' | 'tile' | 'rock' | 'darkRock' | 'flesh'

const STYLE_FOR: Record<ZoneId, MountStyle> = {
  town: 'brick',
  forest: 'rock',
  lab: 'concrete',
  mall: 'tile',
  upside: 'darkRock',
  vecna: 'flesh',
}

const PALETTE: Record<MountStyle, [string, string]> = {
  brick: ['#7a2e22', '#a4463a'],
  concrete: ['#5d6268', '#7f858c'],
  tile: ['#8a7d6c', '#b3a690'],
  rock: ['#3f4639', '#66705a'],
  darkRock: ['#1c1f2a', '#353a4a'],
  flesh: ['#4a1418', '#7a2a2c'],
}

const inHole = (x: number, y: number, pad: number) => {
  const dx = x / (HOLE_A + pad)
  const dy = (y - RIFT_Y) / (HOLE_B + pad)
  return dx * dx + dy * dy
}

/** scorch the material around the tear so the rift looks burned into it */
const scorch = (c: THREE.Color, x: number, y: number) => {
  const e = Math.sqrt(inHole(x, y, 0))
  const k = THREE.MathUtils.clamp((e - 1) / 0.9, 0, 1)
  c.multiplyScalar(0.25 + 0.75 * k)
  if (k < 0.5) c.lerp(new THREE.Color('#ff2a2a'), (0.5 - k) * 0.35)
  return c
}

function buildBlocks(style: MountStyle) {
  const [dark, light] = PALETTE[style].map((c) => new THREE.Color(c))
  const bw = style === 'tile' ? 0.6 : style === 'concrete' ? 0.8 : 0.5
  const bh = style === 'tile' ? 0.6 : style === 'concrete' ? 0.4 : 0.25
  const geo = new THREE.BoxGeometry(bw * 0.96, bh * 0.92, 0.7)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 })
  const mats: THREE.Matrix4[] = []
  const cols: THREE.Color[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const rows = Math.ceil(4.8 / bh)
  for (let row = 0; row < rows; row++) {
    const y = bh / 2 + row * bh
    const offset = row % 2 ? bw / 2 : 0
    for (let x = -MOUNT_HALF + offset; x <= MOUNT_HALF; x += bw) {
      // ruined, uneven top edge that sags towards the ends
      const top = 3.9 + Math.sin(x * 1.7) * 0.35 + Math.sin(x * 4.3 + 1) * 0.2 - Math.abs(x) * 0.06
      if (y > top) continue
      if (inHole(x, y, 0.05) < 1) continue
      if (Math.random() < 0.025 && inHole(x, y, 0) > 2.2) continue
      e.set((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.04)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(x, y, (Math.random() - 0.5) * 0.06), q, new THREE.Vector3(1, 1, 1))
      mats.push(m.clone())
      cols.push(scorch(dark.clone().lerp(light, Math.random()), x, y))
    }
  }
  return instanced(geo, mat, mats, cols)
}

function buildRocks(style: MountStyle) {
  const [dark, light] = PALETTE[style].map((c) => new THREE.Color(c))
  const geo = new THREE.IcosahedronGeometry(1, 0)
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true })
  const mats: THREE.Matrix4[] = []
  const cols: THREE.Color[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const step = 0.62
  for (let y = 0.3; y < 5.2; y += step * 0.8) {
    for (let x = -MOUNT_HALF; x <= MOUNT_HALF; x += step) {
      const top = 4.3 + Math.sin(x * 0.9) * 0.6 - Math.abs(x) * 0.12
      if (y > top) continue
      const r = 0.42 + Math.random() * 0.38
      const jx = x + (Math.random() - 0.5) * 0.3
      const jy = y + (Math.random() - 0.5) * 0.25
      if (inHole(jx, jy, r * 0.75) < 1) continue
      e.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(jx, jy, (Math.random() - 0.5) * 0.5), q, new THREE.Vector3(r, r * (0.8 + Math.random() * 0.3), r * 0.9))
      mats.push(m.clone())
      cols.push(scorch(dark.clone().lerp(light, Math.random()), jx, jy))
    }
  }
  return instanced(geo, mat, mats, cols)
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cols: THREE.Color[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length)
  mats.forEach((mm, i) => {
    mesh.setMatrixAt(i, mm)
    mesh.setColorAt(i, cols[i])
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

/** The swirling, fleshy surface stretched across the tear. */
function buildMembrane() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpen;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + r * 11.0 - uTime * 4.0) * 0.5 + 0.5;
        float swirl2 = sin(a * 3.0 - r * 7.0 + uTime * 2.3) * 0.5 + 0.5;
        float veins = smoothstep(0.82, 1.0, swirl * swirl2);
        vec3 core = vec3(0.02, 0.0, 0.01);
        vec3 rim = vec3(1.0, 0.12, 0.08);
        vec3 col = mix(core, rim, pow(r, 2.2) * 0.9 + veins * 0.6);
        col += vec3(1.0, 0.3, 0.2) * smoothstep(0.75, 1.0, r) * 0.6;
        float edge = 1.0 - smoothstep(0.92, 1.0, r);
        gl_FragColor = vec4(col, edge * uOpen * 0.96);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat)
  mesh.scale.set(HOLE_A * 1.08, HOLE_B * 1.08, 1)
  mesh.position.y = RIFT_Y
  mesh.renderOrder = 2
  return mesh
}

/** The Demogorgon's rift, torn through a wall or rock face across the road. The runner dives through it into the next map. */
export class Portal {
  root = new THREE.Group()
  private holder = new THREE.Group()
  private mountHolder = new THREE.Group()
  private mounts = new Map<MountStyle, THREE.Object3D>()
  private membrane = buildMembrane()
  private mixer: THREE.AnimationMixer | null = null
  private openAction: THREE.AnimationAction | null = null
  private light = new THREE.PointLight('#ff2a2a', 0, 14, 1.6)
  private glow: THREE.Sprite
  private state: PortalState = 'hidden'
  private grow = 0
  private t = 0

  constructor(halo: THREE.SpriteMaterial) {
    this.root.visible = false
    this.root.add(this.mountHolder)
    this.holder.position.y = RIFT_Y
    this.root.add(this.holder)
    this.root.add(this.membrane)
    this.light.position.set(0, RIFT_Y, 1.4)
    this.root.add(this.light)
    const glowMat = halo.clone()
    glowMat.color.set('#ff2a2a')
    glowMat.opacity = 0.6
    glowMat.depthWrite = false
    this.glow = new THREE.Sprite(glowMat)
    this.glow.scale.set(RIFT_W * 2.4, RIFT_H * 1.9, 1)
    this.glow.position.set(0, RIFT_Y, 0.45)
    this.root.add(this.glow)
  }

  async load(url: string) {
    try {
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(MeshoptDecoder)
      const gltf = await loader.loadAsync(url)
      const model = gltf.scene
      const skinned: THREE.SkinnedMesh[] = []
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.frustumCulled = false
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(mesh as THREE.SkinnedMesh)
      })
      this.mixer = new THREE.AnimationMixer(model)
      const clip = gltf.animations.find((a) => /\|Open$/.test(a.name))
      if (clip) {
        this.openAction = this.mixer.clipAction(clip)
        this.openAction.setLoop(THREE.LoopOnce, 1)
        this.openAction.clampWhenFinished = true
        // measure the rig in its fully opened pose: the bones, not the bind pose, decide its real orientation
        this.openAction.play()
        this.mixer.setTime(clip.duration)
      }

      // orient → fit → model: orient turns the ring upright, fit centres and stretches it into a tall rift
      const orient = new THREE.Group()
      const fit = new THREE.Group()
      orient.add(model)
      fit.add(orient)
      const measure = () => {
        fit.updateMatrixWorld(true)
        for (const s of skinned) s.skeleton.update()
        return new THREE.Box3().setFromObject(orient, true)
      }
      const raw = measure().getSize(new THREE.Vector3())
      // the ring's thinnest axis is its facing direction; turn it to face down the road (Z)
      if (raw.y <= raw.x && raw.y <= raw.z) orient.rotation.x = Math.PI / 2
      else if (raw.x <= raw.y && raw.x <= raw.z) orient.rotation.y = Math.PI / 2

      const box = measure()
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const sx = RIFT_W / size.x
      const sy = RIFT_H / size.y
      const sz = Math.min(sx, sy)
      fit.scale.set(sx, sy, sz)
      fit.position.set(-center.x * sx, -center.y * sy, -center.z * sz + 0.2)
      this.holder.add(fit)
      this.openAction?.stop()
    } catch (err) {
      console.log('[v0] portal load failed', err)
    }
  }

  private mountFor(zone: ZoneId) {
    const style = STYLE_FOR[zone]
    let mount = this.mounts.get(style)
    if (!mount) {
      mount = style === 'rock' || style === 'darkRock' || style === 'flesh' ? buildRocks(style) : buildBlocks(style)
      this.mounts.set(style, mount)
      this.mountHolder.add(mount)
    }
    for (const [s, obj] of this.mounts) obj.visible = s === style
  }

  /** Stand the wall with its sealed rift across the road at a world position, facing the oncoming runner. */
  place(pos: THREE.Vector3, yaw: number, zone: ZoneId) {
    this.mountFor(zone)
    this.root.position.copy(pos)
    this.root.rotation.y = yaw
    this.root.visible = true
    this.state = 'hidden'
    this.grow = 0
    this.holder.scale.setScalar(0.001)
    this.glow.visible = false
    this.light.intensity = 0
    ;(this.membrane.material as THREE.ShaderMaterial).uniforms.uOpen.value = 0
  }

  open() {
    if (this.state !== 'hidden' || !this.root.visible) return
    this.state = 'opening'
    if (this.openAction) {
      this.openAction.reset()
      this.openAction.play()
    }
  }

  /** The runner has gone through: the rift seals behind her. */
  pass() {
    this.state = 'closing'
  }

  hide() {
    this.root.visible = false
    this.state = 'hidden'
  }

  update(dt: number) {
    if (!this.root.visible) return
    this.t += dt
    this.mixer?.update(dt)
    if (this.state === 'opening' || this.state === 'open') {
      this.grow = Math.min(1, this.grow + dt * 1.6)
      if (this.grow >= 1) this.state = 'open'
    } else if (this.state === 'closing') {
      this.grow = Math.max(0, this.grow - dt * 1.4)
      if (this.grow <= 0) this.hide()
    }
    const pulse = 1 + Math.sin(this.t * 6) * 0.03 + Math.sin(this.t * 13.7) * 0.015
    const g = THREE.MathUtils.smoothstep(this.grow, 0, 1)
    this.holder.scale.setScalar(Math.max(0.001, g * pulse))
    this.holder.rotation.z = Math.sin(this.t * 0.8) * 0.03
    const mu = (this.membrane.material as THREE.ShaderMaterial).uniforms
    mu.uTime.value = this.t
    mu.uOpen.value = g
    this.membrane.scale.set(HOLE_A * 1.08 * (0.15 + 0.85 * g) * pulse, HOLE_B * 1.08 * (0.3 + 0.7 * g) * pulse, 1)
    this.glow.visible = g > 0.02
    this.glow.material.opacity = 0.45 * g + Math.sin(this.t * 9) * 0.06 * g
    this.light.intensity = 26 * g * pulse
  }
}
