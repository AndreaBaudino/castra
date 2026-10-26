import { useCallback, useEffect, useState } from 'react'
import { META_SHEET_ID, META_SHEET_TAB, META_SUMMARY_TAB } from '../config'
import { readStored, writeStored } from './storage'

export interface MetaDeck {
  name: string
  colors: string // WUBRG letters, '' if unknown
  games: number
  wins: number
  losses: number
  draws: number
  share: number // 0..1
}

export interface MetaData {
  decks: MetaDeck[]
  summary: string[] // editorial paragraphs, may be empty
  updatedAt: string // ISO
  demo: boolean
}

export const winrate = (d: MetaDeck) => (d.games ? d.wins / d.games : 0)

/** Wilson score interval (95%) — tells small samples apart from solid ones. */
export function wilson(wins: number, n: number): [number, number] {
  if (!n) return [0, 0]
  const z = 1.96
  const p = wins / n
  const den = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)
  return [Math.max(0, (centre - margin) / den), Math.min(1, (centre + margin) / den)]
}

export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Finds the meta entry for a commander name (exact, then partial match for partners / short names). */
export function findMetaDeck(decks: MetaDeck[], commanderNames: string[]): MetaDeck | undefined {
  const names = commanderNames.map(normName).filter(Boolean)
  if (!names.length) return
  const full = names.join(' ')
  return (
    decks.find((d) => normName(d.name) === full) ??
    decks.find((d) => names.every((n) => normName(d.name).includes(n.split(' ').slice(0, 2).join(' '))))
  )
}

// ---------- CSV ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const num = (s: string | undefined) => {
  if (!s) return 0
  const v = parseFloat(s.replace('%', '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['mazzo', 'comandante', 'deck', 'commander', 'archetipo', 'archetype', 'nome', 'name'],
  games: ['partite', 'games', 'match', 'matches', 'giocate', 'played'],
  wins: ['vittorie', 'wins', 'vinte', 'w'],
  losses: ['sconfitte', 'losses', 'perse', 'l'],
  draws: ['pareggi', 'draws', 'patte', 'd'],
  colors: ['colori', 'colors', 'colours', 'identita', 'identity'],
  share: ['meta', 'meta %', 'share', 'meta share', 'quota', 'presenza'],
}

export function metaFromRows(rows: string[][]): MetaDeck[] {
  if (rows.length < 2) return []
  const header = rows[0].map(normName)
  const col = (key: string) => {
    const aliases = COLUMN_ALIASES[key].map(normName)
    let i = header.findIndex((h) => aliases.includes(h))
    if (i < 0) i = header.findIndex((h) => aliases.some((a) => a.length > 2 && h.startsWith(a)))
    return i
  }
  const c = Object.fromEntries(Object.keys(COLUMN_ALIASES).map((k) => [k, col(k)])) as Record<string, number>
  if (c.name < 0) c.name = 0

  const decks = rows.slice(1).flatMap((r): MetaDeck[] => {
    const name = r[c.name]?.trim()
    if (!name) return []
    const wins = num(r[c.wins])
    const losses = c.losses >= 0 ? num(r[c.losses]) : 0
    const draws = c.draws >= 0 ? num(r[c.draws]) : 0
    const games = c.games >= 0 ? num(r[c.games]) : wins + losses + draws
    let share = c.share >= 0 ? num(r[c.share]) : -1
    if (share > 1) share /= 100
    return [
      {
        name,
        colors: (c.colors >= 0 ? r[c.colors] : '').toUpperCase().replace(/[^WUBRGC]/g, ''),
        games,
        wins,
        losses: c.losses >= 0 ? losses : Math.max(0, games - wins - draws),
        draws,
        share,
      },
    ]
  })
  const total = decks.reduce((s, d) => s + d.games, 0)
  for (const d of decks) if (d.share < 0) d.share = total ? d.games / total : 0
  return decks
}

const sheetCsvUrl = (tab: string) =>
  `https://docs.google.com/spreadsheets/d/${META_SHEET_ID}/gviz/tq?tqx=out:csv` +
  (tab ? `&sheet=${encodeURIComponent(tab)}` : '')

// ---------- demo data (placeholder until the official sheet exists) ----------

const DEMO_ROWS: [string, string, number, number][] = [
  ['Tymna the Weaver / Thrasios, Triton Hero', 'WUBG', 188, 109],
  ['Kinnan, Bonder Prodigy', 'UG', 164, 92],
  ["Atraxa, Praetors' Voice", 'WUBG', 142, 73],
  ['Najeela, the Blade-Blossom', 'WUBRG', 131, 72],
  ['Rograkh, Son of Rohgahh / Silas Renn, Seeker Adept', 'UBR', 118, 61],
  ['Urza, Lord High Artificer', 'U', 104, 55],
  ['Winota, Joiner of Forces', 'RW', 97, 46],
  ['Yuriko, the Tiger\'s Shadow', 'UB', 92, 50],
  ['Light-Paws, Emperor\'s Voice', 'W', 76, 35],
  ['Sisay, Weatherlight Captain', 'WUBRG', 61, 31],
  ['Malcolm, Keen-Eyed Navigator / Tana, the Bloodsower', 'URG', 54, 26],
  ['Zur the Enchanter', 'WUB', 47, 26],
  ['Derevi, Empyrial Tactician', 'WUG', 39, 17],
  ['Krenko, Mob Boss', 'R', 33, 14],
  ['Selvala, Heart of the Wilds', 'G', 22, 13],
  ['Grand Arbiter Augustin IV', 'WU', 14, 6],
]

function demoData(): MetaData {
  const total = DEMO_ROWS.reduce((s, r) => s + r[2], 0)
  return {
    decks: DEMO_ROWS.map(([name, colors, games, wins]) => ({
      name,
      colors,
      games,
      wins,
      draws: Math.round(games * 0.03),
      losses: games - wins - Math.round(games * 0.03),
      share: games / total,
    })),
    summary: [],
    updatedAt: new Date().toISOString(),
    demo: true,
  }
}

// ---------- hook ----------

const CACHE_KEY = 'cc.meta.cache'

export function useMeta() {
  const [data, setData] = useState<MetaData>(() =>
    META_SHEET_ID ? readStored<MetaData | null>(CACHE_KEY, null) ?? { ...demoData(), decks: [] } : demoData(),
  )
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const refresh = useCallback(async () => {
    if (!META_SHEET_ID) return
    setStatus('loading')
    try {
      const res = await fetch(sheetCsvUrl(META_SHEET_TAB))
      if (!res.ok) throw new Error(String(res.status))
      const decks = metaFromRows(parseCsv(await res.text()))
      let summary: string[] = []
      if (META_SUMMARY_TAB) {
        const s = await fetch(sheetCsvUrl(META_SUMMARY_TAB))
        if (s.ok) summary = parseCsv(await s.text()).map((r) => r[0]?.trim()).filter(Boolean)
      }
      const next: MetaData = { decks, summary, updatedAt: new Date().toISOString(), demo: false }
      writeStored(CACHE_KEY, next)
      setData(next)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, status, refresh }
}
