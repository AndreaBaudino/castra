import { useCallback, useEffect, useState } from 'react'
import { POTY_SPOTS } from '../config'
import type { CircuitSheet } from './circuits'
import { parseCsv } from './meta'
import { readStored, writeStored } from './storage'

// The circuit sheet (players, leagues, big events) read into the app's own model: players, events and
// leagues linked together, so every view can filter, sort and cross-reference them.

export interface EventResult {
  key: string // player key
  place?: number // known for the top 8 only
  points: number // 2 = participation only; 0 when invited to the POTY instead
  poty: boolean // invited to the Player of the Year (replaces the points)
}

export interface CircuitEvent {
  id: string
  name: string
  order: number // position in the sheet, which is chronological
  year?: number
  month?: number // 1-12
  day?: number
  level?: 1 | 2
  players: number
  results: EventResult[]
}

export interface LeagueEntry {
  points: number
  league: string
  leaguePlayers: number
  stages: number
  leagueRank: number
  /** other leagues played that season: only the best one counts for the ranking */
  also?: string[]
}

export interface PlayerEvent {
  eventId: string
  place?: number
  points: number
  poty: boolean
}

export interface Player {
  key: string
  name: string
  rank?: number // official overall rank
  total: number // official total (leagues + events)
  s1?: LeagueEntry
  s2?: LeagueEntry
  events: PlayerEvent[] // in chronological order
  eventPoints: number
  top8: number
  best?: number // best placing in a top 8
  potyInvited: boolean
}

export interface League {
  season: 's1' | 's2'
  name: string
  players: number // as declared in the sheet
  stages: number
  entries: { key: string; points: number; rank: number }[] // by points
}

export interface Circuit {
  players: Player[] // by official rank
  leagues: League[]
  events: CircuitEvent[] // in sheet (chronological) order
  updatedAt: string
  year?: number // missing in caches from before there was one sheet per year
  poty?: number // players invited to the Player of the Year by ranking (POTY_SPOTS when missing)
}

export const playerKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const int = (s: string | undefined) => {
  const v = parseInt((s ?? '').trim(), 10)
  return Number.isFinite(v) ? v : undefined
}

const findHeader = (rows: string[][]) => rows.findIndex((r) => r.some((c) => /player name/i.test(c)))
const colOf = (header: string[], re: RegExp) => header.findIndex((c) => re.test(c.trim()))

// ---------- event names: "Cogoleto - FEB 22 - 34 PL", "Albisola - LV2- 20 settembre2026", "23/08 - LV1 - Rocca3Corvi" ----------

const MONTHS: [RegExp, number][] = [
  [/^(gen(naio)?|jan(uary)?)$/, 1],
  [/^(feb(braio|ruary)?)$/, 2],
  [/^(mar(zo|ch)?)$/, 3],
  [/^(apr(ile|il)?)$/, 4],
  [/^(mag(gio)?|may)$/, 5],
  [/^(giu(gno)?|june?)$/, 6],
  [/^(lug(lio)?|july?)$/, 7],
  [/^(ago(sto)?|aug(ust)?)$/, 8],
  [/^(set(tembre)?|sep(t(ember)?)?)$/, 9],
  [/^(ott(obre)?|oct(ober)?)$/, 10],
  [/^(nov(embre|ember)?)$/, 11],
  [/^(dic(embre)?|dec(ember)?)$/, 12],
]
const monthOf = (word: string) => MONTHS.find(([re]) => re.test(word.toLowerCase()))?.[1]

export function parseEventName(name: string) {
  const out: Pick<CircuitEvent, 'year' | 'month' | 'day' | 'level'> & { declared?: number } = {}
  const pl = name.match(/(\d+)\s*PL\b/i)
  if (pl) out.declared = +pl[1]
  const lv = name.match(/(?:\blvl?|livello)\s*([12])\b/i)
  if (lv) out.level = +lv[1] as 1 | 2
  const year = name.match(/20\d\d/)
  if (year) out.year = +year[0]
  const numeric = name.match(/\b(\d{1,2})\/(\d{1,2})\b/)
  if (numeric && +numeric[2] >= 1 && +numeric[2] <= 12) {
    out.day = +numeric[1]
    out.month = +numeric[2]
    return out
  }
  // a month word, with the day just before or after it ("FEB 22", "20 settembre")
  const words = [...name.matchAll(/[a-zà-ú]+/gi)]
  for (const w of words) {
    const m = monthOf(w[0])
    if (!m) continue
    out.month = m
    const before = name.slice(0, w.index).match(/\b(\d{1,2})\s*$/)
    const after = name.slice(w.index! + w[0].length).match(/^\s*(\d{1,2})\b/)
    const day = int(before?.[1] ?? after?.[1])
    if (day && day <= 31) out.day = day
    break
  }
  return out
}

// ---------- sheets → model ----------

function parseLeague(rows: string[][], season: League['season']) {
  const out = new Map<string, LeagueEntry & { name: string }>()
  const leagues: League[] = []
  const h = findHeader(rows)
  if (h < 0) return { best: out, leagues }
  const H = rows[h]
  const [iName, iPts, iLeague, iPlayers, iStages] = [/player name/i, /^points?$|^punti$/i, /^lega$|^league$/i, /#\s*players|giocatori/i, /tappe|stages/i].map(
    (re) => colOf(H, re),
  )
  const all: (LeagueEntry & { name: string; key: string })[] = []
  for (const r of rows.slice(h + 1)) {
    const name = r[iName]?.trim()
    if (!name) continue
    all.push({
      key: playerKey(name),
      name,
      points: int(r[iPts]) ?? 0,
      league: r[iLeague]?.trim() || '—',
      leaguePlayers: int(r[iPlayers]) ?? 0,
      stages: int(r[iStages]) ?? 0,
      leagueRank: 0,
    })
  }
  // rank inside each league
  const byLeague = new Map<string, typeof all>()
  all.forEach((e) => byLeague.set(e.league, [...(byLeague.get(e.league) ?? []), e]))
  byLeague.forEach((list, name) => {
    list.sort((a, b) => b.points - a.points).forEach((e, i) => (e.leagueRank = i + 1))
    leagues.push({
      season,
      name,
      players: Math.max(...list.map((e) => e.leaguePlayers), list.length),
      stages: Math.max(...list.map((e) => e.stages)),
      entries: list.map((e) => ({ key: e.key, points: e.points, rank: e.leagueRank })),
    })
  })
  // someone in two leagues keeps the best one (the one that counts in the leaderboard)
  for (const { key, ...e } of [...all].sort((a, b) => b.points - a.points)) {
    const best = out.get(key)
    if (best) best.also = [...(best.also ?? []), e.league]
    else out.set(key, e)
  }
  return { best: out, leagues }
}

function parseEvents(rows: string[][], names: Map<string, string>): CircuitEvent[] {
  const H = rows[0] ?? []
  const iName = colOf(H, /player name/i)
  const iPts = colOf(H, /^points?$|^punti$/i)
  const iPlace = colOf(H, /^#$/)
  const events: (CircuitEvent & { explicit: boolean })[] = []
  for (const r of rows.slice(1)) {
    const title = r[0]?.replace(/\s+/g, ' ').trim()
    if (title) {
      events.push({ id: String(events.length), name: title, order: events.length, players: 0, results: [], explicit: false })
    }
    const ev = events[events.length - 1]
    const name = r[iName]?.trim()
    if (!ev || !name) continue
    const key = playerKey(name)
    if (!names.has(key)) names.set(key, name)
    const raw = r[iPts]?.trim() ?? ''
    const poty = /poty/i.test(raw)
    const place = int(r[iPlace])
    if (place) ev.explicit = true
    if (ev.results.some((r) => r.key === key)) continue // listed twice by mistake
    ev.results.push({ key, place, points: poty ? 0 : (int(raw) ?? 0), poty })
  }
  return events.map(({ explicit, ...ev }) => {
    // when the top 8 isn't numbered, it's the first rows scoring more than the participation points
    if (!explicit)
      ev.results.forEach((res, i) => {
        if (i < 8 && (res.poty || res.points > 2)) res.place = i + 1
      })
    const meta = parseEventName(ev.name)
    const { declared, ...rest } = meta
    return { ...ev, ...rest, players: declared ?? ev.results.length }
  })
}

export function buildCircuit(sheets: { leaderboard: string; s1: string; s2: string; events: string }): Circuit {
  const names = new Map<string, string>()
  const { best: s1, leagues: l1 } = parseLeague(parseCsv(sheets.s1), 's1')
  const { best: s2, leagues: l2 } = parseLeague(parseCsv(sheets.s2), 's2')
  const events = parseEvents(parseCsv(sheets.events), names)
  // events without a year belong to the season of the others
  const years = events.map((e) => e.year).filter(Boolean) as number[]
  const season = years.length ? Math.max(...years) : new Date().getFullYear()
  events.forEach((e) => (e.year ??= season))

  // official rank and total
  const lb = parseCsv(sheets.leaderboard)
  const official = new Map<string, { rank?: number; total: number }>()
  const h = findHeader(lb)
  if (h >= 0) {
    const H = lb[h]
    const [iRank, iName, iTotal] = [/^#$/, /player name/i, /^total/i].map((re) => colOf(H, re))
    for (const r of lb.slice(h + 1)) {
      const name = r[iName]?.trim()
      if (!name) continue
      const key = playerKey(name)
      names.set(key, name)
      official.set(key, { rank: int(r[iRank]), total: int(r[iTotal]) ?? 0 })
    }
  }
  s1.forEach((e, k) => !names.has(k) && names.set(k, e.name))
  s2.forEach((e, k) => !names.has(k) && names.set(k, e.name))

  const players: Player[] = [...names].map(([key, name]) => {
    const evs: PlayerEvent[] = []
    for (const ev of events) {
      const res = ev.results.find((r) => r.key === key)
      if (res) evs.push({ eventId: ev.id, place: res.place, points: res.points, poty: res.poty })
    }
    const eventPoints = evs.reduce((s, e) => s + e.points, 0)
    const places = evs.map((e) => e.place).filter(Boolean) as number[]
    const strip = <T extends { name: string }>(e?: T) => e && (({ name: _, ...rest }) => rest)(e)
    const p1 = strip(s1.get(key))
    const p2 = strip(s2.get(key))
    return {
      key,
      name,
      rank: official.get(key)?.rank,
      total: official.get(key)?.total ?? (p1?.points ?? 0) + (p2?.points ?? 0) + eventPoints,
      s1: p1,
      s2: p2,
      events: evs,
      eventPoints,
      top8: places.length,
      best: places.length ? Math.min(...places) : undefined,
      potyInvited: evs.some((e) => e.poty),
    }
  })
  players.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.total - a.total || a.name.localeCompare(b.name))
  // the tail of the leaderboard has no position: rank them by points (ties share the position)
  players.forEach((p) => (p.rank ??= 1 + players.filter((o) => o.total > p.total).length))
  return { players, leagues: [...l1, ...l2], events, updatedAt: new Date().toISOString() }
}

// ---------- POTY ----------

/**
 * The Player of the Year invites: whoever won one at an event, plus the best POTY spots of the others
 * by total points (an invited player in the top spots lets the next one in).
 */
export function potyStatus(c: Circuit) {
  const zone = new Set<string>()
  let cutoff = 0
  for (const p of c.players) {
    if (p.potyInvited) continue
    if (zone.size >= (c.poty ?? POTY_SPOTS)) break
    zone.add(p.key)
    cutoff = p.total
  }
  return { zone, cutoff, isIn: (p: Player) => p.potyInvited || zone.has(p.key) }
}

// ---------- hook ----------

const cacheKey = (year: number) => `cc.circuit.v2.${year}` // bumped when the model changes
const OLD_CACHE_KEY = 'cc.circuit.v2' // 2026, from before there was one sheet per year
const csvUrl = (sheet: string, gid: string) => `https://docs.google.com/spreadsheets/d/${sheet}/export?format=csv&gid=${gid}`

/** Reads a year's leaderboard sheet: fails on a sheet that can't be read or has no players. */
export async function fetchCircuit(s: CircuitSheet): Promise<Circuit> {
  // export keeps text cells such as "invito Poty" (the gviz endpoint drops them from numeric columns)
  const [leaderboard, s1, s2, events] = await Promise.all(
    [s.tabs.leaderboard, s.tabs.s1, s.tabs.s2, s.tabs.events].map(async (gid) => {
      const res = await fetch(csvUrl(s.sheet, gid))
      if (!res.ok) throw new Error(String(res.status))
      return res.text()
    }),
  )
  const c = buildCircuit({ leaderboard, s1, s2, events })
  if (!c.players.length) throw new Error('empty')
  return { ...c, year: s.year, poty: s.poty }
}

function cached(year: number) {
  const c = readStored<Circuit | null>(cacheKey(year), null)
  if (c || year !== 2026) return c
  const old = readStored<Circuit | null>(OLD_CACHE_KEY, null)
  return old && { ...old, year }
}

/** One year's circuit, from its sheet (null: none); the last one read is kept for offline. */
export function useCircuit(sheet: CircuitSheet | null) {
  const year = sheet?.year ?? null
  const [data, setData] = useState<Circuit | null>(() => (year ? cached(year) : null))
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const key = sheet && JSON.stringify(sheet)

  const refresh = useCallback(async () => {
    if (!sheet) return
    setStatus('loading')
    try {
      const next = await fetchCircuit(sheet)
      writeStored(cacheKey(sheet.year), next)
      setData(next)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData(year ? cached(year) : null)
    setStatus('idle')
    refresh()
  }, [refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, status, refresh }
}

// ---------- labels ----------

export function eventDateLabel(e: CircuitEvent, lang: string) {
  if (!e.month) return ''
  const d = new Date(e.year ?? 2000, e.month - 1, e.day ?? 1)
  return d.toLocaleDateString(lang, e.day ? { day: 'numeric', month: 'short' } : { month: 'long' })
}

// ---------- what changed since the last time ----------

/** What the user saw last time: their position, the followed players', the events. */
export interface CircuitSnapshot {
  year?: number // a new year's circuit starts from scratch: nothing to compare with the last one
  me?: { key: string; rank: number; total: number }
  follow: Record<string, { rank: number; total: number }>
  events: string[]
}

export interface RankChange {
  key: string
  name: string
  from: number
  to: number
  points: number // gained since
}

export interface CircuitNotice {
  at: string
  me?: RankChange
  follow: RankChange[]
  events: string[] // new events
}

export function snapshotOf(c: Circuit, me: string | null, follow: string[]): CircuitSnapshot {
  const at = (k: string) => c.players.find((p) => p.key === k)
  const m = me ? at(me) : undefined
  const f: CircuitSnapshot['follow'] = {}
  follow.forEach((k) => {
    const p = at(k)
    if (p) f[k] = { rank: p.rank ?? 0, total: p.total }
  })
  return { year: c.year, me: m && { key: m.key, rank: m.rank ?? 0, total: m.total }, follow: f, events: c.events.map((e) => e.name) }
}

/** The differences worth telling, or null. A newly linked or followed player is not a change. */
export function noticeOf(prev: CircuitSnapshot, next: CircuitSnapshot, c: Circuit): CircuitNotice | null {
  if ((prev.year ?? 2026) !== (next.year ?? 2026)) return null
  const name = (k: string) => c.players.find((p) => p.key === k)?.name ?? k
  const change = (k: string, a: { rank: number; total: number }, b: { rank: number; total: number }): RankChange | undefined =>
    a.rank !== b.rank || a.total !== b.total ? { key: k, name: name(k), from: a.rank, to: b.rank, points: b.total - a.total } : undefined
  const me = prev.me && next.me && prev.me.key === next.me.key ? change(next.me.key, prev.me, next.me) : undefined
  const follow = Object.entries(next.follow)
    .map(([k, v]) => prev.follow[k] && change(k, prev.follow[k], v))
    .filter((x): x is RankChange => !!x)
  const events = next.events.filter((e) => !prev.events.includes(e))
  return me || follow.length || events.length ? { at: new Date().toISOString(), me, follow, events } : null
}

/** A notice not yet read absorbs the next one: positions keep their oldest "from". */
export function mergeNotices(old: CircuitNotice | null, add: CircuitNotice): CircuitNotice {
  if (!old) return add
  const merge = (a: RankChange | undefined, b: RankChange) => (a ? { ...b, from: a.from, points: a.points + b.points } : b)
  const follow = new Map(old.follow.map((f) => [f.key, f]))
  add.follow.forEach((f) => follow.set(f.key, merge(follow.get(f.key), f)))
  return {
    at: add.at,
    me: add.me ? merge(old.me, add.me) : old.me,
    follow: [...follow.values()].filter((f) => f.from !== f.to || f.points),
    events: [...old.events, ...add.events.filter((e) => !old.events.includes(e))],
  }
}
