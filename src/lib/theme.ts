export interface Theme {
  mode: 'auto' | 'dark' | 'light'
  accent: string // primary buttons, hero
  highlight: string // active tab, links, charts
  p0: string // life counter, top player
  p1: string // life counter, bottom player
  scale: 'S' | 'M' | 'L'
}

export const DEFAULT_THEME: Theme = {
  mode: 'auto',
  accent: '#b8322a',
  highlight: '#d4a64a',
  p0: '#7d1f1a',
  p1: '#23405f',
  scale: 'M',
}

export const SWATCHES = ['#b8322a', '#d4a64a', '#7d1f1a', '#23405f', '#2f6b4f', '#5b3c88', '#1f6f8b', '#c2571a', '#8a8f98', '#a33d6c']

const FONT: Record<Theme['scale'], string> = { S: '14px', M: '15px', L: '16.5px' }

export function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t.mode === 'auto') delete root.dataset.theme
  else root.dataset.theme = t.mode
  // only override when customised, so the defaults keep their light/dark tuned variants
  const set = (name: string, v: string, def: string) =>
    v.toLowerCase() === def ? root.style.removeProperty(name) : root.style.setProperty(name, v)
  set('--red', t.accent, DEFAULT_THEME.accent)
  set('--gold', t.highlight, DEFAULT_THEME.highlight)
  root.style.setProperty('--p0', t.p0)
  root.style.setProperty('--p1', t.p1)
  root.style.fontSize = FONT[t.scale]
}
