import * as THREE from 'three'

export type ZoneId = 'town' | 'forest' | 'lab' | 'mall' | 'upside' | 'vecna'

export interface Zone {
  id: ZoneId
  name: string
  tagline: string
  tone: 'red' | 'cyan' | 'gold'
  /** world floor is flat ground (road, dirt, tile) instead of a boardwalk floating over the void */
  flat: boolean
  skyHorizon: THREE.Color
  skyGlow: THREE.Color
  skyTop: THREE.Color
  fog: THREE.Color
  fogDensity: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  ground: THREE.Color
  particles: THREE.Color
  /** red lightning strike rate, 0 disables */
  lightning: number
}

const c = (hex: string) => new THREE.Color(hex)

/** metres at which each map begins; every map lasts twice as long as the one before it */
export const ZONE_STARTS = [0, 800, 1600, 3200, 6400, 12800]

export const ZONES: Zone[] = [
  {
    id: 'town',
    name: 'HAWKINS',
    tagline: 'Get out of town before dark',
    tone: 'gold',
    flat: true,
    skyHorizon: c('#3a2a3a'),
    skyGlow: c('#7a4a3a'),
    skyTop: c('#0a0c1c'),
    fog: c('#1c1826'),
    fogDensity: 0.016,
    hemiSky: c('#b7b4ff'),
    hemiGround: c('#2a1c18'),
    ground: c('#1e2a1a'),
    particles: c('#ffe2a8'),
    lightning: 0,
  },
  {
    id: 'forest',
    name: 'MIRKWOOD',
    tagline: 'Something is in the trees',
    tone: 'cyan',
    flat: true,
    skyHorizon: c('#2c5a4c'),
    skyGlow: c('#4a8a70'),
    skyTop: c('#0c1e1e'),
    fog: c('#1e3c34'),
    fogDensity: 0.014,
    hemiSky: c('#b0ffe0'),
    hemiGround: c('#2a4020'),
    ground: c('#2a3c20'),
    particles: c('#c8ff6a'),
    lightning: 0.2,
  },
  {
    id: 'lab',
    name: 'HAWKINS LAB',
    tagline: 'Department of Energy - Restricted',
    tone: 'cyan',
    flat: true,
    skyHorizon: c('#123038'),
    skyGlow: c('#1e5a66'),
    skyTop: c('#03080c'),
    fog: c('#0e1e24'),
    fogDensity: 0.02,
    hemiSky: c('#a8f4ff'),
    hemiGround: c('#0c1418'),
    ground: c('#1a2226'),
    particles: c('#7ae8ff'),
    lightning: 0,
  },
  {
    id: 'mall',
    name: 'STARCOURT MALL',
    tagline: 'Open late. Very late.',
    tone: 'gold',
    flat: true,
    skyHorizon: c('#3a1440'),
    skyGlow: c('#7a2a7a'),
    skyTop: c('#0c0418'),
    fog: c('#22102c'),
    fogDensity: 0.018,
    hemiSky: c('#ffb0f0'),
    hemiGround: c('#1a0c20'),
    ground: c('#20142a'),
    particles: c('#ff8ae0'),
    lightning: 0,
  },
  {
    id: 'upside',
    name: 'THE UPSIDE DOWN',
    tagline: 'The gate is open',
    tone: 'red',
    flat: false,
    skyHorizon: c('#400608'),
    skyGlow: c('#9e1210'),
    skyTop: c('#120103'),
    fog: c('#3a0709'),
    fogDensity: 0.022,
    hemiSky: c('#ff7a6a'),
    hemiGround: c('#1a0406'),
    ground: c('#160305'),
    particles: c('#ff3a18'),
    lightning: 1,
  },
  {
    id: 'vecna',
    name: "VECNA'S LAIR",
    tagline: 'He sees you',
    tone: 'red',
    flat: false,
    skyHorizon: c('#2a0206'),
    skyGlow: c('#c0101a'),
    skyTop: c('#0a0002'),
    fog: c('#2a0306'),
    fogDensity: 0.028,
    hemiSky: c('#ff4a5a'),
    hemiGround: c('#100103'),
    ground: c('#0c0102'),
    particles: c('#ff1a3a'),
    lightning: 1.8,
  },
]

export function zoneIndexAt(dist: number) {
  let i = 0
  for (let k = 1; k < Math.min(ZONE_STARTS.length, ZONES.length); k++) if (dist >= ZONE_STARTS[k]) i = k
  return i
}

export function zoneAt(dist: number) {
  return ZONES[zoneIndexAt(dist)]
}
