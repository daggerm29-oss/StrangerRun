import * as THREE from 'three'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  return { c, g }
}

function finish(c: HTMLCanvasElement, repeat = false) {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export function makeWoodTexture() {
  const { c, g } = canvas(256, 512)
  const planks = 8
  const ph = 512 / planks
  for (let i = 0; i < planks; i++) {
    const y = i * ph
    const base = 38 + Math.random() * 26
    g.fillStyle = `rgb(${base + 22},${base * 0.6},${base * 0.5})`
    g.fillRect(0, y, 256, ph)
    for (let k = 0; k < 46; k++) {
      g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.28})`
      g.lineWidth = Math.random() * 2 + 0.3
      g.beginPath()
      const yy = y + Math.random() * ph
      g.moveTo(0, yy)
      g.bezierCurveTo(80, yy + Math.random() * 6 - 3, 170, yy + Math.random() * 6 - 3, 256, yy + Math.random() * 4 - 2)
      g.stroke()
    }
    // wet red sheen streaks
    for (let k = 0; k < 4; k++) {
      g.fillStyle = `rgba(160,20,20,${Math.random() * 0.12})`
      g.fillRect(Math.random() * 256, y + 4, 30 + Math.random() * 90, ph - 8)
    }
    // plank seam
    g.fillStyle = 'rgba(6,0,0,0.95)'
    g.fillRect(0, y, 256, 5)
    // nails
    g.fillStyle = '#120806'
    for (const nx of [14, 242]) {
      g.beginPath()
      g.arc(nx, y + ph / 2, 3, 0, Math.PI * 2)
      g.fill()
    }
    // random cracks
    if (Math.random() > 0.5) {
      g.fillStyle = 'rgba(0,0,0,0.6)'
      g.fillRect(Math.random() * 200, y + ph * 0.4, 40 + Math.random() * 40, 2)
    }
  }
  return finish(c, true)
}

export function makeDotTexture() {
  const { c, g } = canvas(64, 64)
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.3, 'rgba(255,255,255,0.6)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  return t
}

export function makeShadowTexture() {
  const { c, g } = canvas(128, 128)
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(0,0,0,0.75)')
  grd.addColorStop(0.6, 'rgba(0,0,0,0.35)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export function makeNeonTexture(text: string, color: string) {
  const { c, g } = canvas(512, 160)
  g.clearRect(0, 0, 512, 160)
  g.font = 'bold 84px "Arial Narrow", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 6
  g.shadowColor = color
  g.shadowBlur = 30
  g.strokeStyle = color
  g.strokeText(text, 256, 82)
  g.shadowBlur = 12
  g.strokeText(text, 256, 82)
  g.lineWidth = 2
  g.strokeStyle = '#ffffff'
  g.shadowBlur = 0
  g.strokeText(text, 256, 82)
  // frame
  g.shadowColor = color
  g.shadowBlur = 20
  g.strokeStyle = color
  g.lineWidth = 5
  g.strokeRect(14, 12, 484, 136)
  return finish(c)
}

export function makeRunBoardTexture() {
  const { c, g } = canvas(512, 192)
  g.fillStyle = '#5b4632'
  g.fillRect(0, 0, 512, 192)
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.25})`
    g.beginPath()
    const y = Math.random() * 192
    g.moveTo(0, y)
    g.lineTo(512, y + Math.random() * 8 - 4)
    g.stroke()
  }
  g.font = 'bold 120px Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#120404'
  g.fillText('R U N', 256, 104)
  return finish(c)
}

export function makeBarrelTexture() {
  const { c, g } = canvas(256, 128)
  g.fillStyle = '#c99a12'
  g.fillRect(0, 0, 256, 128)
  g.fillStyle = '#1a1206'
  g.fillRect(0, 14, 256, 10)
  g.fillRect(0, 104, 256, 10)
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(90,30,0,${Math.random() * 0.4})`
    g.beginPath()
    g.arc(Math.random() * 256, Math.random() * 128, Math.random() * 10, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#1a1206'
  g.font = 'bold 22px Arial, sans-serif'
  g.textAlign = 'center'
  g.fillText('HAWKINS LAB', 64, 70)
  g.fillText('HAWKINS LAB', 192, 70)
  return finish(c)
}

export function makeHouseTexture() {
  const { c, g } = canvas(128, 128)
  g.fillStyle = '#1c1416'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`
    g.fillRect(0, Math.random() * 128, 128, 2)
  }
  const wins = [
    [18, 30],
    [74, 30],
    [18, 76],
    [74, 76],
  ]
  for (const [x, y] of wins) {
    const r = Math.random()
    g.fillStyle = r > 0.75 ? '#ff3a2a' : r > 0.6 ? '#3ad6c6' : '#060304'
    g.fillRect(x, y, 34, 26)
    g.fillStyle = '#0b0607'
    g.fillRect(x + 16, y, 3, 26)
  }
  return finish(c)
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, light = false) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${Math.random() * alpha})` : `rgba(0,0,0,${Math.random() * alpha})`
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3)
  }
}

/** night asphalt with dashed lane lines between the three lanes */
export function makeAsphaltTexture() {
  const { c, g } = canvas(256, 512)
  g.fillStyle = '#2a2a2e'
  g.fillRect(0, 0, 256, 512)
  speckle(g, 256, 512, 2600, 0.35)
  speckle(g, 256, 512, 700, 0.08, true)
  for (let k = 0; k < 5; k++) {
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 1.5
    g.beginPath()
    let x = Math.random() * 256
    let y = Math.random() * 512
    g.moveTo(x, y)
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 40
      y += Math.random() * 30
      g.lineTo(x, y)
    }
    g.stroke()
  }
  g.fillStyle = '#e8d27a'
  for (const lx of [256 / 3, (256 * 2) / 3]) for (let y = 0; y < 512; y += 128) g.fillRect(lx - 3, y + 20, 6, 70)
  g.fillStyle = '#d8d8d0'
  g.fillRect(4, 0, 6, 512)
  g.fillRect(246, 0, 6, 512)
  return finish(c, true)
}

export function makeDirtTexture() {
  const { c, g } = canvas(256, 512)
  g.fillStyle = '#3a2a1c'
  g.fillRect(0, 0, 256, 512)
  speckle(g, 256, 512, 3000, 0.4)
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${90 + Math.random() * 40},${70 + Math.random() * 30},${40},${0.25})`
    g.beginPath()
    g.ellipse(Math.random() * 256, Math.random() * 512, 4 + Math.random() * 14, 2 + Math.random() * 6, Math.random() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // leaves
  for (let i = 0; i < 120; i++) {
    g.fillStyle = ['#5a3a12', '#6a4a1a', '#3a2a0a', '#7a2a10'][i % 4]
    g.beginPath()
    g.ellipse(Math.random() * 256, Math.random() * 512, 3, 1.6, Math.random() * 3, 0, Math.PI * 2)
    g.fill()
  }
  return finish(c, true)
}

/** square floor tiles, used for the lab (cold) and the mall (checkerboard) */
export function makeTileTexture(a: string, b: string, grout: string, checker: boolean) {
  const { c, g } = canvas(256, 512)
  const size = 64
  for (let y = 0; y < 512; y += size) {
    for (let x = 0; x < 256; x += size) {
      const odd = ((x + y) / size) % 2 === 1
      g.fillStyle = checker && odd ? b : a
      g.fillRect(x, y, size, size)
      g.fillStyle = 'rgba(255,255,255,0.05)'
      g.fillRect(x + 4, y + 4, size * 0.4, size * 0.15)
    }
  }
  speckle(g, 256, 512, 900, 0.18)
  g.fillStyle = grout
  for (let y = 0; y <= 512; y += size) g.fillRect(0, y - 1.5, 256, 3)
  for (let x = 0; x <= 256; x += size) g.fillRect(x - 1.5, 0, 3, 512)
  return finish(c, true)
}

function fitFont(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, family: string) {
  let s = size
  g.font = `bold ${s}px ${family}`
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2
    g.font = `bold ${s}px ${family}`
  }
  return s
}

/** multi-line placard: signs, billboards, warning plates */
export function makePlacardTexture(lines: string[], bg: string, fg: string, opts: { w?: number; h?: number; wood?: boolean; family?: string } = {}) {
  const w = opts.w ?? 512
  const h = opts.h ?? 256
  const family = opts.family ?? 'Impact, "Arial Black", sans-serif'
  const { c, g } = canvas(w, h)
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  if (opts.wood) {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(0, (i * h) / 6, w, 3)
    }
    for (let k = 0; k < 90; k++) {
      g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.25})`
      g.beginPath()
      const y = Math.random() * h
      g.moveTo(0, y)
      g.lineTo(w, y + Math.random() * 6 - 3)
      g.stroke()
    }
  } else {
    speckle(g, w, h, 500, 0.12)
    g.strokeStyle = fg
    g.lineWidth = 8
    g.strokeRect(10, 10, w - 20, h - 20)
  }
  g.fillStyle = fg
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const lh = (h - 40) / lines.length
  lines.forEach((t, i) => {
    fitFont(g, t, w - 60, Math.min(lh * 0.82, 120), family)
    g.fillText(t, w / 2, 20 + lh * (i + 0.5) + 2)
  })
  return finish(c)
}

export function makePosterTexture() {
  const { c, g } = canvas(256, 340)
  g.fillStyle = '#e6e0cf'
  g.fillRect(0, 0, 256, 340)
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(120,90,40,${Math.random() * 0.12})`
    g.beginPath()
    g.arc(Math.random() * 256, Math.random() * 340, 10 + Math.random() * 40, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#141210'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  fitFont(g, 'MISSING', 220, 64, 'Impact, "Arial Black", sans-serif')
  g.fillText('MISSING', 128, 44)
  g.fillStyle = '#7a7670'
  g.fillRect(58, 82, 140, 150)
  g.fillStyle = '#3a3834'
  g.beginPath()
  g.arc(128, 140, 34, 0, Math.PI * 2)
  g.fill()
  g.fillRect(80, 180, 96, 52)
  g.fillStyle = '#141210'
  fitFont(g, 'WILL BYERS', 220, 34, 'Impact, "Arial Black", sans-serif')
  g.fillText('WILL BYERS', 128, 258)
  g.font = 'bold 15px Arial, sans-serif'
  g.fillText('LAST SEEN NOV 6 - MIRKWOOD', 128, 286)
  g.fillText('CALL HAWKINS POLICE', 128, 306)
  for (let x = 8; x < 256; x += 24) {
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.fillRect(x, 318, 1, 22)
  }
  return finish(c)
}

/** Joyce's living-room wall: floral wallpaper with painted letters */
export function makeAlphabetTexture() {
  const { c, g } = canvas(1024, 512)
  g.fillStyle = '#5a4a32'
  g.fillRect(0, 0, 1024, 512)
  for (let y = 0; y < 512; y += 48) {
    for (let x = (y / 48) % 2 ? 24 : 0; x < 1024; x += 48) {
      g.fillStyle = 'rgba(160,120,70,0.35)'
      g.beginPath()
      g.arc(x, y, 9, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(60,80,40,0.35)'
      g.beginPath()
      g.ellipse(x + 10, y + 8, 7, 3, 0.6, 0, Math.PI * 2)
      g.fill()
    }
  }
  speckle(g, 1024, 512, 4000, 0.25)
  const rows = ['ABCDEFGH', 'IJKLMNOPQ', 'RSTUVWXYZ']
  g.fillStyle = '#0c0a08'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  rows.forEach((row, r) => {
    const n = row.length
    for (let i = 0; i < n; i++) {
      g.save()
      const x = 70 + (i / (n - 1)) * 884
      const y = 110 + r * 150
      g.translate(x, y)
      g.rotate((Math.random() - 0.5) * 0.25)
      g.font = `bold ${78 + Math.random() * 14}px "Brush Script MT", Georgia, serif`
      g.fillText(row[i], 0, 0)
      g.restore()
    }
  })
  return finish(c)
}

export function makeTowerTexture() {
  const { c, g } = canvas(1024, 256)
  g.fillStyle = '#8c9294'
  g.fillRect(0, 0, 1024, 256)
  speckle(g, 1024, 256, 3000, 0.25)
  for (let x = 0; x < 1024; x += 64) {
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(x, 0, 2, 256)
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(90,50,20,${Math.random() * 0.3})`
    g.fillRect(Math.random() * 1024, Math.random() * 120 + 120, 3 + Math.random() * 4, 40 + Math.random() * 90)
  }
  g.fillStyle = '#16181a'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = 'bold 120px Impact, "Arial Black", sans-serif'
  g.fillText('HAWKINS', 256, 132)
  g.fillText('HAWKINS', 768, 132)
  return finish(c, true)
}

export function makeBannerTexture(text: string, from: string, to: string) {
  const { c, g } = canvas(512, 128)
  const grd = g.createLinearGradient(0, 0, 512, 0)
  grd.addColorStop(0, from)
  grd.addColorStop(1, to)
  g.fillStyle = grd
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = 'rgba(255,255,255,0.15)'
  for (let i = 0; i < 6; i++) g.fillRect(0, 10 + i * 6, 512, 2)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = '#000000'
  g.shadowBlur = 8
  fitFont(g, text, 470, 78, 'Impact, "Arial Black", sans-serif')
  g.fillText(text, 256, 70)
  return finish(c)
}

export function makeSignTexture(text: string, bg: string, fg: string) {
  const { c, g } = canvas(512, 128)
  g.fillStyle = bg
  g.fillRect(0, 0, 512, 128)
  g.strokeStyle = fg
  g.lineWidth = 8
  g.strokeRect(8, 8, 496, 112)
  g.fillStyle = fg
  g.font = 'bold 64px Impact, Arial Black, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 68)
  return finish(c)
}
