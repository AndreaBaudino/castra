import { useMemo } from 'react'
import { useI18n } from '../i18n'
import type { EloRow, MetaDataset, MetaTournament } from './meta'

// The Elo of docs/elo.md as the app shows it: the meta build computes each tournament's numbers (EloRow); what
// depends on today (the pause, the inactive, the 30 days, the ranking, the rank) is worked out here.

export const BASE = 1000
const IDLE = 10 // points lost for each whole month without tournaments, from the second on (scripts/meta/elo.mjs)
const START = 100
const PAUSE = 5
const PROVISIONAL = 80 // margin above which the Elo is provisional
const AWAY = 90 // days without tournaments after which a player is inactive

export const today = () => new Date().toISOString().slice(0, 10)
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5
/** What a pause costs: IDLE points for each whole month without tournaments from the second on, never below BASE. */
export const idleLoss = (elo: number, from: string, to: string) =>
  Math.min(IDLE * Math.max(0, Math.floor(days(from, to) / 30) - 1), Math.max(0, elo - BASE))

// ---------- ranks ----------

export type Tier = 'tirone' | 'legionario' | 'decano' | 'optio' | 'centurione' | 'primipilo' | 'imperatore' | 'legato' | 'tribuno'
export const TIERS: Tier[] = ['tirone', 'legionario', 'decano', 'optio', 'centurione', 'primipilo']
export const PODIUM: Tier[] = ['imperatore', 'legato', 'tribuno']
export interface Rank {
  tier: Tier
  div: 0 | 1 | 2 | 3 // 0: no divisions (Primipilo and the podium)
}

/** The rank of an Elo, every 100 points from Optio at 1000; divisions of about 33 counted upwards (I, II, III). */
export function rankOf(elo: number, podium?: number): Rank {
  if (podium != null && podium < 3) return { tier: PODIUM[podium], div: 0 }
  const e = Math.round(elo)
  if (e >= 1200) return { tier: 'primipilo', div: 0 }
  const i = Math.max(0, Math.min(4, Math.floor((e - 700) / 100)))
  const off = e - 700 - 100 * i
  return { tier: TIERS[i], div: off >= 67 ? 3 : off >= 33 ? 2 : 1 }
}
const divFloor = (tier: number, div: number) => 700 + 100 * tier + [0, 33, 67][div - 1]
/** The next step up (division or rank) and the points to it; none from Primipilo. */
export function nextStep(elo: number): { rank: Rank; points: number; done: number } | null {
  const r = rankOf(elo)
  const i = TIERS.indexOf(r.tier)
  if (r.tier === 'primipilo') return null
  const e = Math.round(elo)
  const from = i === 0 && r.div === 1 ? Math.min(e, 700) : divFloor(i, r.div)
  const to = r.div < 3 ? divFloor(i, r.div + 1) : 800 + 100 * i
  const rank = r.div < 3 ? { tier: r.tier, div: (r.div + 1) as 2 | 3 } : rankOf(to)
  return { rank, points: to - e, done: Math.max(0, Math.min(1, (e - from) / (to - from))) }
}
export const sameRank = (a: Rank, b: Rank) => a.tier === b.tier && a.div === b.div
/** Higher rank first: tiers, then divisions. */
export const rankValue = (r: Rank) => (PODIUM.includes(r.tier) ? 100 : TIERS.indexOf(r.tier) * 4 + r.div)

// ---------- a player ----------

export interface EloStep extends EloRow {
  entry: number // index in dataset.entries
  t: MetaTournament
  day: string
  rankChange?: { from: Rank; to: Rank; up: boolean }
}

export type EloStatus = 'ranked' | 'provisional' | 'inactive'

export interface PlayerElo {
  key: string
  name: string
  league?: string // where they play most stages
  steps: EloStep[] // in time order
  elo: number // today, with the pause since the last tournament
  rd: number // today: the margin widens with the pause
  status: EloStatus
  idle: number // what the current pause costs so far
  d30: number // change in the last 30 days
  games: number
}

const level = (t: MetaTournament) => t.kind === 'l1' || t.kind === 'l2'

/** Every player's Elo of the year, today. Empty when the meta has no Elo. */
export function eloPlayers(ds: MetaDataset, day = today()): Map<string, PlayerElo> {
  const out = new Map<string, PlayerElo>()
  const elo = ds.elo
  if (!elo) return out
  const byKey = new Map<string, EloStep[]>()
  const stages = new Map<string, Map<string, number>>()
  let games = new Map<string, number>()
  ds.entries.forEach((e, i) => {
    const row = elo.rows[i]
    if (!row || !e.key) return
    const t = ds.tournaments[e.t]
    ;(byKey.get(e.key) ?? byKey.set(e.key, []).get(e.key)!).push({ ...row, entry: i, t, day: elo.days[e.t] })
    games = games.set(e.key, (games.get(e.key) ?? 0) + (e.w ?? 0) + e.l + e.d - (e.bye ? 1 : 0))
    if (!level(t) && t.league) {
      const m = stages.get(e.key) ?? stages.set(e.key, new Map()).get(e.key)!
      m.set(t.league, (m.get(t.league) ?? 0) + 1)
    }
  })
  for (const [key, steps] of byKey) {
    steps.sort((a, b) => a.day.localeCompare(b.day) || (a.t.stage ?? 0) - (b.t.stage ?? 0))
    // a change of rank or division between two tournaments, while the player has one (not provisional)
    steps.forEach((s, i) => {
      const prev = steps[i - 1]
      if (!prev || prev.rd > PROVISIONAL || s.rd > PROVISIONAL) return
      const from = rankOf(prev.after - s.idle)
      const to = rankOf(s.after)
      if (!sameRank(from, to)) s.rankChange = { from, to, up: rankValue(to) > rankValue(from) }
    })
    const last = steps[steps.length - 1]
    const idle = idleLoss(last.after, last.day, day)
    const away = days(last.day, day)
    // the Elo of a day: the last tournament up to then, with the pause after it
    const at = (d: string) => {
      const s = [...steps].reverse().find((x) => x.day <= d)
      return s ? s.after - idleLoss(s.after, s.day, d) : steps[0].start
    }
    const month = new Date(Date.parse(day) - 30 * 864e5).toISOString().slice(0, 10)
    const league = [...(stages.get(key) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0]
    const now = last.after - idle
    out.set(key, {
      key,
      name: ds.entries[last.entry].player ?? key,
      league,
      steps,
      elo: now,
      rd: Math.min(START, Math.sqrt(last.rd ** 2 + PAUSE * PAUSE * Math.max(0, away))),
      status: away > AWAY ? 'inactive' : last.rd > PROVISIONAL ? 'provisional' : 'ranked',
      idle,
      d30: now - at(month),
      games: games.get(key) ?? 0,
    })
  }
  return out
}

/** The year's Elo ranking: the ranked (the first three on the podium), the provisional, the inactive. */
export function eloRanking(players: Map<string, PlayerElo>) {
  const by = (s: EloStatus) => [...players.values()].filter((p) => p.status === s).sort((a, b) => b.elo - a.elo)
  return { ranked: by('ranked'), provisional: by('provisional'), inactive: by('inactive') }
}

/** A player's rank: none while provisional; the podium only for the first three of the ranking. */
export function rankOfPlayer(p: PlayerElo, ranked: PlayerElo[]): Rank | null {
  if (p.status === 'provisional') return null
  const i = p.status === 'ranked' ? ranked.indexOf(p) : -1
  return rankOf(p.elo, i >= 0 ? i : undefined)
}

// ---------- two players ----------

const Q = Math.log(10) / 400
const g = (rd: number) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / Math.PI ** 2)

/** How often a beats b in a match, from their Elo and margins. */
export const winChance = (a: PlayerElo, b: PlayerElo) => 1 / (1 + 10 ** ((-g(Math.hypot(a.rd, b.rd)) * (a.elo - b.elo)) / 400))

/** What one match of a league stage would move a's Elo: [if a wins, if a loses]. */
export function matchMoves(a: PlayerElo, b: PlayerElo): [number, number] {
  const gb = g(b.rd)
  const e = 1 / (1 + 10 ** ((-gb * (a.elo - b.elo)) / 400))
  const v = 1 / (1 / a.rd ** 2 + Q * Q * gb * gb * e * (1 - e))
  return [Q * v * gb * (1 - e), Q * v * gb * -e]
}

// ---------- hooks ----------

/** Every player's Elo and the ranking, today; null when the meta has none. */
export function useElo(dataset: MetaDataset | null) {
  return useMemo(() => {
    if (!dataset?.elo) return null
    const players = eloPlayers(dataset)
    return { players, ...eloRanking(players) }
  }, [dataset])
}

const ROMAN = ['', 'I', 'II', 'III']
/** "Centurione III", "Primipilo", "Imperatore". */
export function useRankName() {
  const { t } = useI18n()
  return (r: Rank) => t(`rank.${r.tier}`) + (r.div ? ` ${ROMAN[r.div]}` : '')
}
