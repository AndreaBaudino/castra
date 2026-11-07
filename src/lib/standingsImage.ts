// The final standings as a picture, for the TO to post in the group chat: drawn on a canvas with the app's colors and fonts.
import type { RankRow } from './tournaments'
import { inkOn } from './theme'

export interface ImageText {
  title: string
  subtitle: string // the date and how many played
  head: [string, string, string, string, string] // place, name, points, record, OMW
  dropped: string
}

const W = 1080
const PAD = 48
const TOP = 230
const ROW = 84

export async function standingsImage(rows: RankRow[], txt: ImageText, lang: string): Promise<Blob> {
  const css = getComputedStyle(document.documentElement)
  const v = (k: string) => css.getPropertyValue(k).trim()
  // fonts not on screen yet aren't loaded: the canvas would fall back silently
  await Promise.all(['700 64px "Space Grotesk"', '400 30px Inter', '600 30px Inter'].map((f) => document.fonts.load(f).catch(() => {})))
  const c = document.createElement('canvas')
  c.width = W
  c.height = TOP + rows.length * ROW + 110
  const g = c.getContext('2d')!
  g.fillStyle = v('--bg')
  g.fillRect(0, 0, W, c.height)
  g.fillStyle = v('--gold')
  g.fillRect(0, 0, W, 10)

  const fit = (s: string, max: number) => {
    if (g.measureText(s).width <= max) return s
    while (s && g.measureText(s + '…').width > max) s = s.slice(0, -1)
    return s + '…'
  }
  // the app's icon on the left of the title
  // on a light page the icon's dark square goes: the helmet alone, outlined in dark to stand out from the page
  let svg = await fetch(`${import.meta.env.BASE_URL}icon.svg`).then((r) => r.text()).catch(() => '')
  if (inkOn(v('--bg')) !== '#ffffff') {
    const ink = '#0b0b0c'
    const paths = svg.match(/<path[^>]*>/g) ?? []
    const shapes = paths.filter((d) => !d.includes(ink))
    const cuts = paths.filter((d) => d.includes(ink)).map((d) => d.replace(ink, v('--bg')))
    const line = (w: number, ps: string[]) =>
      `<g stroke="${ink}" stroke-width="${w}" stroke-linejoin="round">${ps.join('')}</g>`
    const outline = shapes.map((d) => d.replace(/fill="[^"]*"/, 'fill="none"'))
    svg = svg
      .replace(/<rect[^>]*>/, '')
      .replace(/(<g transform="[^"]*">)[\s\S]*<\/g>/, `$1${line(48, outline)}${shapes.join('')}${line(24, cuts)}</g>`)
  }
  const icon = new Image()
  icon.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await icon.decode().catch(() => {})
  const IC = 116
  if (icon.complete && icon.naturalWidth) g.drawImage(icon, PAD, 52, IC, IC)
  const xT = PAD + IC + 28
  g.textBaseline = 'alphabetic'
  g.fillStyle = v('--text')
  g.font = '700 56px "Space Grotesk", sans-serif'
  g.fillText(fit(txt.title.toUpperCase(), W - PAD - xT), xT, 112)
  g.fillStyle = v('--muted')
  g.font = '400 30px Inter, sans-serif'
  g.fillText(fit(txt.subtitle, W - PAD - xT), xT, 156)

  // columns: right edges of the numbers, the name in between
  const xPlace = PAD + 70
  const xName = PAD + 100
  const xPts = 730
  const xRec = 880
  const xOmw = W - PAD
  g.font = '600 24px Inter, sans-serif'
  g.fillStyle = v('--muted')
  const [hPlace, hName, hPts, hRec, hOmw] = txt.head
  g.textAlign = 'right'
  g.fillText(hPlace, xPlace, TOP - 20)
  g.fillText(hPts, xPts, TOP - 20)
  g.fillText(hRec, xRec, TOP - 20)
  g.fillText(hOmw, xOmw, TOP - 20)
  g.textAlign = 'left'
  g.fillText(hName, xName, TOP - 20)

  const pct = (n: number) => (n * 100).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
  rows.forEach((r, i) => {
    const y = TOP + i * ROW
    if (i % 2 === 0) {
      g.fillStyle = v('--surface')
      g.fillRect(PAD - 16, y, W - 2 * PAD + 32, ROW)
    }
    g.fillStyle = i === 0 ? v('--gold') : v('--text')
    g.font = '600 30px Inter, sans-serif'
    g.textAlign = 'right'
    g.fillText(String(i + 1), xPlace, y + 40)
    g.fillText(String(r.points), xPts, y + 52)
    g.font = '400 30px Inter, sans-serif'
    g.fillStyle = v('--text')
    g.fillText(`${r.wins}-${r.losses}-${r.draws}`, xRec, y + 52)
    g.fillText(pct(r.omwp), xOmw, y + 52)
    g.textAlign = 'left'
    g.font = '600 30px Inter, sans-serif'
    g.fillText(fit(r.name + (r.dropped ? ` · ${txt.dropped}` : ''), xPts - 80 - xName), xName, y + 40)
    g.fillStyle = v('--muted')
    g.font = '400 22px Inter, sans-serif'
    g.fillText(fit(r.commander ?? '', xPts - 80 - xName), xName, y + 70)
  })

  g.fillStyle = v('--muted')
  g.font = '700 26px "Space Grotesk", sans-serif'
  g.textAlign = 'right'
  g.fillText('CASTRA', W - PAD, c.height - 44)
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('canvas'))), 'image/png'))
}

/** Shares the picture where the phone can (to save it or send it straight away), otherwise downloads it. */
export async function savePicture(blob: Blob, name: string) {
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] }).catch(() => {})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
