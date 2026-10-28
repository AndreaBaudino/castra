import { useCallback, useEffect, useMemo, useState } from 'react'
import { META_YEAR } from '../config'
import { playerKey } from './circuit'
import { readStored, writeStored } from './storage'

// The deck meta of the circuit, from the tournament sheets (built by scripts/build-meta.mjs into
// public/meta-<year>.json): every player's result at every event and league stage. Everything shown
// (shares, winrates, a commander's or a player's record) is computed here from those rows, for any filter.

export type Season = 's1' | 's2'
export type TournamentKind = 'league' | 'l1' | 'l2' | 'online'

export interface MetaTournament {
  index: number
  id: string
  kind: TournamentKind
  season: Season
  name: string // events: the venue; leagues: the venue of the stages
  league?: string // leagues: their name in the circuit sheet
  stage?: number
  date?: string // ISO day, missing for a few stages
  players: number
  circuit?: string // events: the event's title in the circuit sheet
}

export interface MetaCommander {
  id: number
  name: string // Scryfall names, partners as "A / B"
  colors: string // WUBRG
}

/** One player at one tournament. A row may lack the player (anonymous), the deck, or the results. */
export interface MetaEntry {
  t: number // tournament index
  player: string | null
  key: string | null // playerKey(player)
  cmd: number // commander id, -1 when unknown
  place: number
  w: number | null // null: results not filled in
  l: number
  d: number
  bye: boolean // a bye ticked in the sheet: one of the wins, left out of the winrate
  list: string | null
}

export interface MetaDataset {
  year: number
  updated: string
  tournaments: MetaTournament[]
  commanders: MetaCommander[]
  entries: MetaEntry[]
}

export interface MetaDeck {
  id: number // commander id
  name: string
  colors: string // WUBRG letters, '' if unknown
  entries: number // times registered at a tournament
  players: number // different players
  games: number
  wins: number
  losses: number
  draws: number
  share: number // 0..1 of the registered decks
}

export interface MetaData {
  decks: MetaDeck[]
  entries: number
  tournaments: number
  updatedAt: string // ISO
}

/** Win rate without draws (as in the official sheets): the whole field averages 50%. */
export const winrate = (d: { wins: number; losses: number }) => (d.wins + d.losses ? d.wins / (d.wins + d.losses) : 0)

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

/** The name for lists: front faces only ("Ajani, Nacatl Pariah" for "Ajani, Nacatl Pariah // Ajani, Nacatl Avenger"). */
export const shortName = (name: string) =>
  name
    .split(' / ')
    .map((p) => p.split(' // ')[0])
    .join(' / ')

// ---------- filters and records ----------

export interface MetaFilter {
  season: Season | '' // '' = the whole year
  kind: TournamentKind | ''
  league: string
}
export const ALL: MetaFilter = { season: '', kind: '', league: '' }

export const inFilter = (t: MetaTournament, f: MetaFilter) =>
  (!f.season || t.season === f.season) && (!f.kind || t.kind === f.kind) && (!f.league || t.league === f.league)

export const entriesOf = (ds: MetaDataset, f: MetaFilter) => ds.entries.filter((e) => inFilter(ds.tournaments[e.t], f))

export interface MetaRecord {
  wins: number
  losses: number
  draws: number
  games: number
}

/** Wins, losses and draws of some rows, ticked byes left out. */
export function recordOf(entries: MetaEntry[]): MetaRecord {
  const r = { wins: 0, losses: 0, draws: 0, games: 0 }
  for (const e of entries) {
    if (e.w == null) continue
    r.wins += e.w - (e.bye ? 1 : 0)
    r.losses += e.l
    r.draws += e.d
  }
  r.games = r.wins + r.losses + r.draws
  return r
}

export function aggregate(ds: MetaDataset, f: MetaFilter): MetaData {
  const rows = entriesOf(ds, f)
  const byCmd = new Map<number, MetaEntry[]>()
  for (const e of rows) if (e.cmd >= 0) byCmd.set(e.cmd, [...(byCmd.get(e.cmd) ?? []), e])
  const total = [...byCmd.values()].reduce((s, l) => s + l.length, 0)
  const decks = [...byCmd].map(([id, list]): MetaDeck => {
    const c = ds.commanders[id]
    return {
      id,
      name: c.name,
      colors: c.colors,
      entries: list.length,
      players: new Set(list.map((e) => e.key).filter(Boolean)).size,
      share: list.length / total,
      ...recordOf(list),
    }
  })
  return {
    decks: decks.sort((a, b) => b.entries - a.entries),
    entries: rows.length,
    tournaments: new Set(rows.map((e) => e.t)).size,
    updatedAt: ds.updated,
  }
}

// ---------- the data file ----------

type RawTournament = { id: string; k: TournamentKind; s: Season; n: string; lg?: string; st?: number; d?: string; p: number; c?: string }
type RawEntry = [number, string | null, number, number, number | null, number | null, number | null, 0 | 1, string | null]
interface RawMeta {
  v: number
  year: number
  updated: string
  t: RawTournament[]
  c: { n: string; c: string }[]
  e: RawEntry[]
}

function fromRaw(raw: RawMeta): MetaDataset {
  return {
    year: raw.year,
    updated: raw.updated,
    tournaments: raw.t.map((t, index) => ({
      index,
      id: t.id,
      kind: t.k,
      season: t.s,
      name: t.n,
      league: t.lg,
      stage: t.st,
      date: t.d,
      players: t.p,
      circuit: t.c,
    })),
    commanders: raw.c.map((c, id) => ({ id, name: c.n, colors: c.c })),
    entries: raw.e.map(([t, player, cmd, place, w, l, d, bye, list]) => ({
      t,
      player,
      key: player ? playerKey(player) : null,
      cmd,
      place,
      w,
      l: l ?? 0,
      d: d ?? 0,
      bye: !!bye,
      list,
    })),
  }
}

/**
 * The commander name of a match or deck as the meta writes it, so the user's own stats line up with it.
 * Partners in any order and the front face of a double-faced card are enough.
 */
export function metaCommanderOf(ds: MetaDataset | null, name: string) {
  if (!ds) return
  const n = normName(name)
  return ds.commanders.find((c) => normName(c.name) === n || normName(c.name.split(' // ')[0]) === n)
}

const CACHE_KEY = 'cc.meta.data'
const dataUrl = `${import.meta.env.BASE_URL}meta-${META_YEAR}.json`

export function useMeta() {
  const [raw, setRaw] = useState<RawMeta | null>(() => readStored<RawMeta | null>(CACHE_KEY, null))
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch(dataUrl, { cache: 'no-cache' })
      if (!res.ok) throw new Error(String(res.status))
      const next = (await res.json()) as RawMeta
      writeStored(CACHE_KEY, next)
      setRaw(next)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const dataset = useMemo(() => (raw ? fromRaw(raw) : null), [raw])
  const data = useMemo<MetaData>(
    () => (dataset ? aggregate(dataset, ALL) : { decks: [], entries: 0, tournaments: 0, updatedAt: '' }),
    [dataset],
  )
  return { dataset, data, status, refresh }
}

// ---------- CSV (the circuit sheet) ----------

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
