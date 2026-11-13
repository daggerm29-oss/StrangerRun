import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

export type Motion = 'idle' | 'run' | 'jump' | 'slide' | 'fall'

// GLTFLoader strips reserved characters such as ':' from node names, so track names use the sanitized form
const HIPS = THREE.PropertyBinding.sanitizeNodeName('mixamorig:Hips')

/**
 * Clip indices inside runner.glb. Only "Running" and "Walking" are named; the
 * jump and slide clips were identified from their hip trajectories.
 */
const CLIPS = {
  run: { name: 'Running' },
  idle: { name: 'Walking' },
  jump: { name: 'Jump', from: 0.3, to: 1.25 },
  slide: { name: 'Slide', from: 0.12, to: 1.62 },
} as const

/**
 * The game moves the runner forward and up itself, so the clips' own root
 * motion is removed: hips are pinned horizontally and, for the jump, never
 * rise above standing height (the anticipation crouch and landing dip remain).
 */
function stripRootMotion(clip: THREE.AnimationClip, rest: THREE.Vector3, capRise: boolean) {
  const track = clip.tracks.find((t) => t.name === `${HIPS}.position`)
  if (!track) return
  const v = track.values
  // pin every clip to the same rest spot so crossfades never slide the body sideways or forward
  const standY = capRise ? rest.y : Infinity
  for (let i = 0; i < v.length; i += 3) {
    v[i] = rest.x
    v[i + 2] = rest.z
    if (v[i + 1] > standY) v[i + 1] = standY
  }
}

function subclip(src: THREE.AnimationClip, name: string, from: number, to: number) {
  const fps = 30
  return THREE.AnimationUtils.subclip(src, name, Math.round(from * fps), Math.round(to * fps), fps)
}

export class Player {
  root = new THREE.Group()
  pivot = new THREE.Group()
  model: THREE.Object3D | null = null
  shadow: THREE.Mesh
  shieldBubble: THREE.Mesh
  private mixer: THREE.AnimationMixer | null = null
  private actions: Partial<Record<Exclude<Motion, 'fall'>, THREE.AnimationAction>> = {}
  private motion: Motion | null = null
  private current: THREE.AnimationAction | null = null

  constructor(shadowTex: THREE.Texture) {
    this.root.add(this.pivot)
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.02
    this.root.add(this.shadow)
    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 24, 16),
      new THREE.MeshBasicMaterial({
        color: '#ff3d5a',
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.shieldBubble.position.y = 0.95
    this.shieldBubble.visible = false
    this.root.add(this.shieldBubble)
  }

  async load(url: string, onProgress: (p: number) => void) {
    const draco = new DRACOLoader().setDecoderPath('/draco/')
    const loader = new GLTFLoader().setDRACOLoader(draco)
    try {
      const gltf = await loader.loadAsync(url, (e) => {
        if (e.total) onProgress(e.loaded / e.total)
      })
      const model = gltf.scene
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const scale = 1.8 / (box.max.y - box.min.y)
      model.scale.setScalar(scale)
      model.position.y = -box.min.y * scale
      model.rotation.y = Math.PI
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.frustumCulled = false
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial
          if (std.isMeshStandardMaterial) {
            std.envMapIntensity = 1
            std.roughness = Math.max(0.35, std.roughness)
          }
        })
      })
      this.setupAnimations(model, gltf.animations)
      this.model = model
    } catch (err) {
      console.log('[v0] model load failed, using fallback', err)
      const fallback = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 1.0, 4, 12),
        new THREE.MeshStandardMaterial({ color: '#c4262e' }),
      )
      body.position.y = 0.85
      fallback.add(body)
      this.model = fallback
    } finally {
      draco.dispose()
    }
    this.pivot.add(this.model)
  }

  private setupAnimations(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    const mixer = new THREE.AnimationMixer(model)
    const byName = (n: string) => clips.find((c) => c.name === n)
    const rest = model.getObjectByName(HIPS)?.position.clone() ?? new THREE.Vector3()
    const strip = (clip: THREE.AnimationClip, capRise = false) => stripRootMotion(clip, rest, capRise)

    const run = byName(CLIPS.run.name)?.clone()
    const idle = byName(CLIPS.idle.name)?.clone()
    const jumpSrc = byName(CLIPS.jump.name)
    const slideSrc = byName(CLIPS.slide.name)

    if (run) {
      strip(run)
      this.actions.run = mixer.clipAction(run)
    }
    if (idle) {
      strip(idle)
      this.actions.idle = mixer.clipAction(idle)
    }
    if (jumpSrc) {
      const jump = subclip(jumpSrc, 'Jump', CLIPS.jump.from, CLIPS.jump.to)
      strip(jump, true)
      const a = mixer.clipAction(jump)
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
      this.actions.jump = a
    }
    if (slideSrc) {
      const slide = subclip(slideSrc, 'Slide', CLIPS.slide.from, CLIPS.slide.to)
      strip(slide)
      const a = mixer.clipAction(slide)
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
      this.actions.slide = a
    }
    this.mixer = mixer
    this.play('idle')
  }

  /**
   * Switch motion with a crossfade. `duration` stretches one-shot clips to the
   * gameplay window (airtime for jumps, slide time for slides).
   */
  play(motion: Motion, opts: { duration?: number; restart?: boolean } = {}) {
    if (!this.mixer) return
    if (motion === this.motion && !opts.restart) return
    // falling into a gap reuses the airborne pose of the jump
    const key = motion === 'fall' ? 'jump' : motion
    const next = this.actions[key] ?? this.actions.run
    if (!next) return
    this.motion = motion

    next.reset()
    next.enabled = true
    next.setEffectiveWeight(1)
    if (opts.duration && next.loop === THREE.LoopOnce) {
      next.setEffectiveTimeScale(next.getClip().duration / opts.duration)
    } else {
      next.setEffectiveTimeScale(1)
    }
    if (motion === 'fall') next.time = next.getClip().duration * 0.55

    const fade = motion === 'jump' || motion === 'slide' ? 0.1 : 0.18
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false)
    else if (!this.current) next.fadeIn(fade)
    next.play()
    this.current = next
  }

  /** Scale the looping cadence (e.g. faster legs at higher speeds). */
  setLoopSpeed(scale: number) {
    if (this.current && this.current.loop !== THREE.LoopOnce) this.current.setEffectiveTimeScale(scale)
  }

  get currentMotion() {
    return this.motion
  }

  update(dt: number) {
    this.mixer?.update(dt)
  }

  freeze() {
    if (this.current) this.current.paused = true
  }

  reset() {
    this.motion = null
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.current = null
      this.play('idle')
    }
  }
}
