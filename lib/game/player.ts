import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * The supplied GLB is a static T-pose with no animation clips, so the run cycle
 * is produced by deforming vertices in the vertex shader (arms lowered and
 * swung, legs and knees articulated around hip/knee pivots in model space, cm).
 */
const deformHeader = /* glsl */ `
uniform float uPhase;
uniform float uLegAmp;
uniform float uArmAmp;
uniform float uKnee;
uniform float uTuck;
uniform float uArmDown;
uniform float uElbow;
vec2 rot2(vec2 v, float a){ float c = cos(a); float s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
vec3 runDeform(vec3 p){
  float side = p.x >= 0.0 ? 1.0 : -1.0;
  float ax = abs(p.x);
  float armW = smoothstep(15.0, 23.0, ax) * smoothstep(128.0, 138.0, p.y);
  if (armW > 0.0) {
    float elbowW = smoothstep(40.0, 47.0, ax) * armW;
    vec2 xz = vec2(p.x - side * 44.0, p.z);
    xz = rot2(xz, side * uElbow * elbowW);
    p.x = side * 44.0 + xz.x; p.z = xz.y;
    vec2 sh = vec2(side * 17.0, 146.0);
    vec2 r = rot2(p.xy - sh, -side * uArmDown * armW);
    p.xy = sh + r;
    float swing = sin(uPhase + (side > 0.0 ? 0.0 : 3.14159)) * uArmAmp * armW;
    vec2 yz = rot2(vec2(p.y - 146.0, p.z), swing);
    p.y = 146.0 + yz.x; p.z = yz.y;
  }
  float legW = 1.0 - smoothstep(80.0, 98.0, p.y);
  if (legW > 0.0) {
    float s = clamp(p.x / 5.0, -1.0, 1.0) * 0.5 + 0.5;
    float phR = uPhase + 3.14159;
    float phL = uPhase;
    float aR = sin(phR) * uLegAmp - uTuck;
    float aL = sin(phL) * uLegAmp - uTuck;
    float kR = max(0.0, -cos(phR)) * uKnee + uTuck * 1.8;
    float kL = max(0.0, -cos(phL)) * uKnee + uTuck * 1.8;
    float a = mix(aL, aR, s);
    float k = mix(kL, kR, s);
    float kneeW = 1.0 - smoothstep(42.0, 54.0, p.y);
    vec2 yz = rot2(vec2(p.y - 48.0, p.z), k * kneeW);
    p.y = 48.0 + yz.x; p.z = yz.y;
    yz = rot2(vec2(p.y - 90.0, p.z), a * legW);
    p.y = 90.0 + yz.x; p.z = yz.y;
  }
  return p;
}
`

export class Player {
  root = new THREE.Group()
  pivot = new THREE.Group()
  model: THREE.Object3D | null = null
  shadow: THREE.Mesh
  shieldBubble: THREE.Mesh
  uniforms = {
    uPhase: { value: 0 },
    uLegAmp: { value: 0.75 },
    uArmAmp: { value: 0.7 },
    uKnee: { value: 1.3 },
    uTuck: { value: 0 },
    uArmDown: { value: 1.3 },
    uElbow: { value: 1.2 },
  }

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
    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(url, (e) => {
        if (e.total) onProgress(e.loaded / e.total)
      })
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const height = box.max.y - box.min.y
      const scale = 1.8 / height
      model.scale.setScalar(scale)
      model.position.y = -box.min.y * scale
      model.rotation.y = Math.PI
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.frustumCulled = false
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mats.forEach((m) => this.patchMaterial(m))
      })
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
    }
    this.pivot.add(this.model)
  }

  private patchMaterial(m: THREE.Material) {
    const uniforms = this.uniforms
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${deformHeader}`)
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = normalize(runDeform(position + normal * 0.6) - runDeform(position));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = runDeform(position);')
    }
    m.customProgramCacheKey = () => 'runner-deform'
    const std = m as THREE.MeshStandardMaterial
    if (std.isMeshStandardMaterial) {
      std.envMapIntensity = 1
      if (std.roughness !== undefined) std.roughness = Math.max(0.35, std.roughness)
    }
    m.needsUpdate = true
  }
}
