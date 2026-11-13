import * as THREE from 'three'
import type { Zone } from './zones'

export const FOG_COLOR = new THREE.Color('#3a0709')

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

const skyFrag = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashDir;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uTop;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 horizon = uHorizon;
  vec3 glow = uGlow;
  vec3 top = uTop;
  vec3 col = mix(horizon, glow, smoothstep(0.0, 0.14, h));
  col = mix(col, top, smoothstep(0.18, 0.85, h));
  vec2 uv = d.xz / (max(h, 0.0) + 0.22) * 0.9;
  uv += vec2(uTime * 0.018, uTime * 0.011);
  float c = fbm(uv * 1.4);
  float c2 = fbm(uv * 3.1 + c * 2.2 - uTime * 0.03);
  float clouds = smoothstep(0.32, 0.86, c * 0.62 + c2 * 0.5);
  float above = smoothstep(-0.02, 0.12, h);
  col = mix(col, col * 0.22, clouds * above);
  col += glow * 1.3 * pow(1.0 - clouds, 4.0) * 0.18 * above;
  float near = pow(max(dot(d, uFlashDir), 0.0), 6.0);
  col += vec3(1.0, 0.32, 0.3) * uFlash * (0.18 + 0.55 * (1.0 - clouds) + near * 1.4) * smoothstep(-0.1, 0.25, h);
  col = mix(col, horizon * 0.8, smoothstep(0.0, -0.12, h));
  gl_FragColor = vec4(col, 1.0);
}
`

const sporeVert = /* glsl */ `
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uSize;
uniform float uScale;
attribute float aSeed;
varying float vSeed;
varying float vFade;
void main(){
  vec3 p = position * uSize;
  p += vec3(sin(uTime * 0.3 + aSeed * 6.0) * 1.5, uTime * (0.25 + aSeed * 0.5), cos(uTime * 0.2 + aSeed * 4.0) * 1.5);
  vec3 w = mod(p - uCam + uSize * 0.5, uSize) - uSize * 0.5 + uCam;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_PointSize = (0.06 + aSeed * 0.14) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
  vSeed = aSeed;
  vFade = smoothstep(60.0, 20.0, -mv.z) * smoothstep(0.5, 3.0, -mv.z);
}
`

const sporeFrag = /* glsl */ `
uniform sampler2D uTex;
uniform float uFlash;
uniform vec3 uTint;
varying float vSeed;
varying float vFade;
void main(){
  vec4 t = texture2D(uTex, gl_PointCoord);
  vec3 ember = mix(uTint, uTint * 0.6 + 0.4, fract(vSeed * 7.0));
  vec3 ash = vec3(0.55, 0.5, 0.5);
  vec3 col = vSeed > 0.72 ? ash : ember;
  gl_FragColor = vec4(col * (1.0 + uFlash), t.a * vFade * 0.9);
}
`

interface Bolt {
  group: THREE.Group
  life: number
  max: number
}

export class Environment {
  scene: THREE.Scene
  sky: THREE.Mesh
  skyMat: THREE.ShaderMaterial
  hemi: THREE.HemisphereLight
  moon: THREE.DirectionalLight
  flashLight: THREE.DirectionalLight
  ground: THREE.Mesh
  spores: THREE.Points
  sporeMat: THREE.ShaderMaterial
  flash = 0
  lightning = 0
  /** 0..1 strength of Vecna's curse, thickens fog */
  curse = 0
  nextStrike = 2.5
  bolts: Bolt[] = []
  coreMat: THREE.MeshBasicMaterial
  glowMat: THREE.MeshBasicMaterial
  onThunder?: (delay: number, power: number) => void
  onFlash?: (power: number) => void

  constructor(scene: THREE.Scene, dotTex: THREE.Texture) {
    this.scene = scene
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.022)
    scene.background = FOG_COLOR.clone()

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uFlashDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uTop: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat)
    this.sky.renderOrder = -10
    this.sky.frustumCulled = false
    scene.add(this.sky)

    this.hemi = new THREE.HemisphereLight('#ff7a6a', '#1a0406', 0.6)
    scene.add(this.hemi)
    this.moon = new THREE.DirectionalLight('#9fb0ff', 1.3)
    this.moon.position.set(-20, 30, 20)
    scene.add(this.moon)
    this.flashLight = new THREE.DirectionalLight('#ffb0b0', 0)
    this.flashLight.position.set(10, 60, -40)
    scene.add(this.flashLight)

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({ color: '#160305', roughness: 0.75, metalness: 0.1 }),
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = -4.5
    scene.add(this.ground)

    const count = 650
    const pos = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random()
      pos[i * 3 + 1] = Math.random()
      pos[i * 3 + 2] = Math.random()
      seeds[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    this.sporeMat = new THREE.ShaderMaterial({
      vertexShader: sporeVert,
      fragmentShader: sporeFrag,
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uSize: { value: new THREE.Vector3(44, 16, 64) },
        uScale: { value: 800 },
        uTex: { value: dotTex },
        uFlash: { value: 0 },
        uTint: { value: new THREE.Color('#ff3a18') },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.spores = new THREE.Points(g, this.sporeMat)
    this.spores.frustumCulled = false
    scene.add(this.spores)

    this.coreMat = new THREE.MeshBasicMaterial({
      color: '#fff0f0',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    this.glowMat = new THREE.MeshBasicMaterial({
      color: '#ff2a2a',
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
  }

  /** blend sky, fog, light and particle colours between two zones */
  applyZone(a: Zone, b: Zone, t: number) {
    const u = this.skyMat.uniforms
    ;(u.uHorizon.value as THREE.Color).lerpColors(a.skyHorizon, b.skyHorizon, t)
    ;(u.uGlow.value as THREE.Color).lerpColors(a.skyGlow, b.skyGlow, t)
    ;(u.uTop.value as THREE.Color).lerpColors(a.skyTop, b.skyTop, t)
    const fog = this.scene.fog as THREE.FogExp2
    fog.color.lerpColors(a.fog, b.fog, t)
    fog.density = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, t) + this.curse * 0.012
    ;(this.scene.background as THREE.Color).copy(fog.color)
    this.hemi.color.lerpColors(a.hemiSky, b.hemiSky, t)
    this.hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, t)
    ;(this.ground.material as THREE.MeshStandardMaterial).color.lerpColors(a.ground, b.ground, t)
    ;(this.sporeMat.uniforms.uTint.value as THREE.Color).lerpColors(a.particles, b.particles, t)
    this.lightning = THREE.MathUtils.lerp(a.lightning, b.lightning, t)
  }

  setViewportHeight(h: number) {
    this.sporeMat.uniforms.uScale.value = h * 1.2
  }

  private buildBoltPath(start: THREE.Vector2, end: THREE.Vector2, depth: number, out: [THREE.Vector2, THREE.Vector2, number][], width: number) {
    let pts = [start.clone(), end.clone()]
    let disp = start.distanceTo(end) * 0.22
    for (let i = 0; i < depth; i++) {
      const next: THREE.Vector2[] = []
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k]
        const b = pts[k + 1]
        const mid = a.clone().add(b).multiplyScalar(0.5)
        mid.x += (Math.random() - 0.5) * disp
        mid.y += (Math.random() - 0.5) * disp * 0.3
        next.push(a, mid)
      }
      next.push(pts[pts.length - 1])
      pts = next
      disp *= 0.55
    }
    for (let k = 0; k < pts.length - 1; k++) {
      out.push([pts[k], pts[k + 1], width * (1 - (k / pts.length) * 0.5)])
      if (width > 1 && Math.random() < 0.06) {
        const dir = new THREE.Vector2((Math.random() - 0.5) * 60, -20 - Math.random() * 50)
        this.buildBoltPath(pts[k], pts[k].clone().add(dir), 4, out, width * 0.45)
      }
    }
  }

  private ribbon(segs: [THREE.Vector2, THREE.Vector2, number][], scale: number) {
    const positions: number[] = []
    for (const [a, b, w] of segs) {
      const dir = b.clone().sub(a).normalize()
      const n = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(w * scale * 0.5)
      const p0 = a.clone().add(n)
      const p1 = a.clone().sub(n)
      const p2 = b.clone().add(n)
      const p3 = b.clone().sub(n)
      positions.push(p0.x, p0.y, 0, p1.x, p1.y, 0, p2.x, p2.y, 0, p1.x, p1.y, 0, p3.x, p3.y, 0, p2.x, p2.y, 0)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }

  strike(camera: THREE.Camera, forward: THREE.Vector3, power = 1) {
    const segs: [THREE.Vector2, THREE.Vector2, number][] = []
    const topX = (Math.random() - 0.5) * 40
    this.buildBoltPath(new THREE.Vector2(topX, 190), new THREE.Vector2(topX + (Math.random() - 0.5) * 90, 0), 7, segs, 2.2)
    const group = new THREE.Group()
    group.add(new THREE.Mesh(this.ribbon(segs, 1), this.coreMat))
    group.add(new THREE.Mesh(this.ribbon(segs, 5), this.glowMat))
    const angle = Math.atan2(forward.x, forward.z) + (Math.random() - 0.5) * 1.3
    const dist = 240
    group.position.set(camera.position.x + Math.sin(angle) * dist, -10, camera.position.z + Math.cos(angle) * dist)
    group.rotation.y = angle + Math.PI
    group.children.forEach((c) => (c.frustumCulled = false))
    this.scene.add(group)
    this.bolts.push({ group, life: 0, max: 0.45 + Math.random() * 0.25 })
    this.flash = Math.max(this.flash, power)
    const dir = new THREE.Vector3(Math.sin(angle), 0.35, Math.cos(angle)).normalize()
    this.skyMat.uniforms.uFlashDir.value.copy(dir)
    this.flashLight.position.copy(dir).multiplyScalar(100)
    this.onThunder?.(0.15 + Math.random() * 0.6, power)
    this.onFlash?.(power)
  }

  update(dt: number, t: number, camera: THREE.Camera, forward: THREE.Vector3, intensity: number) {
    this.sky.position.copy(camera.position)
    this.ground.position.x = camera.position.x
    this.ground.position.z = camera.position.z
    this.skyMat.uniforms.uTime.value = t
    this.sporeMat.uniforms.uTime.value = t
    this.sporeMat.uniforms.uCam.value.copy(camera.position)

    this.nextStrike -= dt * this.lightning
    if (this.nextStrike <= 0 && this.lightning > 0.05) {
      this.strike(camera, forward, 0.8 + Math.random() * 0.4)
      if (Math.random() < 0.35) setTimeout(() => this.strike(camera, forward, 0.6), 180)
      this.nextStrike = (2.2 + Math.random() * 5) / (0.8 + intensity * 0.6)
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.life += dt
      const k = b.life / b.max
      const flicker = k < 0.15 ? 1 : k < 0.3 ? 0.25 : k < 0.5 ? 0.9 : 1 - k
      this.coreMat.opacity = Math.max(0, flicker)
      this.glowMat.opacity = Math.max(0, flicker * 0.45)
      if (b.life >= b.max) {
        this.scene.remove(b.group)
        b.group.children.forEach((c) => (c as THREE.Mesh).geometry.dispose())
        this.bolts.splice(i, 1)
      }
    }

    const flick = this.flash > 0.05 ? 0.6 + Math.random() * 0.4 : 1
    this.flash = Math.max(0, this.flash - dt * 2.6)
    const f = this.flash * flick
    this.skyMat.uniforms.uFlash.value = f
    this.sporeMat.uniforms.uFlash.value = f
    this.hemi.intensity = 0.75 + f * 2.4
    this.flashLight.intensity = f * 5
  }
}
