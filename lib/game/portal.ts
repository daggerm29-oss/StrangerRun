import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const DIAMETER = 7.2

type PortalState = 'hidden' | 'opening' | 'open' | 'closing'

/** The Demogorgon's rift. Opens across the road ahead and the runner dives through it into the next map. */
export class Portal {
  root = new THREE.Group()
  private holder = new THREE.Group()
  private mixer: THREE.AnimationMixer | null = null
  private openAction: THREE.AnimationAction | null = null
  private light = new THREE.PointLight('#ff2a2a', 0, 22, 1.6)
  private glow: THREE.Sprite
  private state: PortalState = 'hidden'
  private grow = 0
  private t = 0

  constructor(halo: THREE.SpriteMaterial) {
    this.root.visible = false
    this.root.add(this.holder)
    this.light.position.set(0, 3.2, 1.5)
    this.root.add(this.light)
    const glowMat = halo.clone()
    glowMat.color.set('#ff2a2a')
    glowMat.opacity = 0.75
    this.glow = new THREE.Sprite(glowMat)
    this.glow.scale.setScalar(DIAMETER * 1.6)
    this.glow.position.y = DIAMETER / 2 - 0.4
    this.root.add(this.glow)
  }

  async load(url: string) {
    try {
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(MeshoptDecoder)
      const gltf = await loader.loadAsync(url)
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const scale = DIAMETER / Math.max(size.x, size.y)
      model.scale.setScalar(scale)
      model.position.set(-center.x * scale, -center.y * scale + DIAMETER / 2 - 0.4, -center.z * scale)
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.frustumCulled = false
      })
      this.holder.add(model)
      this.mixer = new THREE.AnimationMixer(model)
      const clip = gltf.animations.find((a) => /\|Open$/.test(a.name))
      if (clip) {
        this.openAction = this.mixer.clipAction(clip)
        this.openAction.setLoop(THREE.LoopOnce, 1)
        this.openAction.clampWhenFinished = true
      }
    } catch (err) {
      console.log('[v0] portal load failed', err)
    }
  }

  /** Stand the closed portal across the road at a world position, facing the oncoming runner. */
  place(pos: THREE.Vector3, yaw: number) {
    this.root.position.copy(pos)
    this.root.rotation.y = yaw
    this.root.visible = true
    this.state = 'hidden'
    this.grow = 0
    this.holder.scale.setScalar(0.001)
    this.glow.visible = false
    this.light.intensity = 0
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
    this.holder.rotation.z = Math.sin(this.t * 0.8) * 0.04
    this.glow.visible = g > 0.02
    this.glow.material.opacity = 0.55 * g + Math.sin(this.t * 9) * 0.08 * g
    this.light.intensity = 38 * g * pulse
  }
}
