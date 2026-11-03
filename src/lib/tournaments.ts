import { useEffect, useMemo, useState } from 'react'
import type { AppUser } from './auth'
import { cloudEnabled, fb, useLiveCollection } from './firebase'
import { fmt } from './timer'
import type { T } from '../i18n'
import type { MetaDataset } from './meta'
import type { Deck } from './decks'
import type { Match as Played } from './matches'
import { PUBLISH_URL } from '../config'
import { type Source, type SourceKind, isEvent } from './sources'
import {
  type Entrant,
  type Match,
  type Score,
  type Standing,
  cutPairings,
  cutSeeds,
  finalOrder,
  nextCut,
  pairRound,
  standings,
} from './swiss'

// Tournaments run in the app by their organizers (docs/tornei.md): tournaments/{id}, one for each sheet (a stage of a
// league, or a level 1 or 2), with its players and matches below. Every phone follows them live; only the TOs who run
// that sheet (and the admins) write them, as firestore.rules checks. Pairings and standings come from swiss.ts.

export const ROUND_MINUTES = 50

export type Status = 'open' | 'swiss' | 'cut' | 'done' // registering, Swiss rounds, top cut, over

export interface Tournament {
  drive: string // the sheet it goes into
  kind: SourceKind // league, l1 or l2
  name: string // the league or the event
  stage?: number // leagues: the stage, a numbered tab of the sheet
  date: string // ISO day
  status: Status
  rounds: number // Swiss rounds: planned, then played once the top cut starts
  cut: 0 | 2 | 4 | 8
  round: number // the one being played, Swiss and top cut in a row (0: not started)
  started: { toMillis: () => number } | null // the round's clock, at the server's time
  filed: boolean // its results are in the sheet: until then the TO keeps finding it
  code?: string | null // to register from the app (#join~CODE): none once round 1 starts
  at: string
  by: string
}

/** A player at a tournament: players/{player key}. */
export interface Player {
  name: string
  commander: string | null // asked before the first round
  joined?: number // a late entry: the first round played
  drop?: number // the last round played
  uid?: string // the account that registered (or confirmed) from the app
  pending?: boolean // registered from the app with a claim not verified yet: in once a TO confirms
  deck?: string // the player's deck in the app, for their stats
  list?: boolean // they gave their decklist (the link is in players/{key}/private/deck)
  at: string
  by: string
}

/** A match: matches/r{round}t{table}, the bye at table 0. */
export interface TableMatch extends Match {
  table: number
  extra?: number // minutes added to this table's clock
  reportedBy?: string // the player who entered the result, until the other confirms it (missing: the TO entered it)
  confirmed?: boolean
}

/** A result one player entered and the other hasn't confirmed yet. */
export const unconfirmed = (m: TableMatch) => !!m.score && !!m.reportedBy && !m.confirmed

// six letters and digits, without the ones easy to mix up (0 O 1 I)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % 32]).join('')
export const joinLink = (code: string) => `${location.origin}${location.pathname}#join~${code}`

/** One tournament for each sheet: the sheet, and for a league the stage. */
export const tournamentId = (drive: string, stage?: number) => (stage ? `${drive}~${stage}` : drive)
const matchId = (round: number, table: number) => `r${round}t${table}`

/** The next stage of a league's sheet: after the highest one in the meta or already started in the app. */
export function nextStage(s: Source, meta: MetaDataset | null, app: [string, Tournament][]) {
  const same = (t: MetaDataset['tournaments'][number]) => t.kind === 'league' && t.league === s.league && t.season === s.season
  const inMeta = meta && meta.year === s.year ? meta.tournaments.filter(same) : []
  const inApp = app.filter(([, t]) => t.drive === s.drive)
  return Math.max(0, ...inMeta.map((t) => t.stage ?? 0), ...inApp.map(([, t]) => t.stage ?? 0)) + 1
}

/** What the engine needs, from the documents: the players waiting for a TO to confirm them aren't in. */
export const entrantsOf = (players: [string, Player][]): Entrant[] =>
  players.filter(([, p]) => !p.pending).map(([id, p]) => ({ id, joined: p.joined, drop: p.drop }))

/** The Swiss standings (the top cut aside) and the final order (the top cut first). */
export function results(t: Tournament, players: [string, Player][], matches: TableMatch[]) {
  const cut = t.status === 'cut' || t.status === 'done' ? matches.filter((m) => m.round > t.rounds) : []
  const st: Standing[] = standings(entrantsOf(players), matches.filter((m) => !cut.includes(m)))
  return { standings: st, order: finalOrder(st, cut) }
}

export interface RankRow {
  id: string
  name: string
  commander: string | null
  points: number
  wins: number
  losses: number
  draws: number
  omwp: number
  dropped: boolean
}

/**
 * The standings as shown: during the Swiss rounds and the top cut the Swiss ones; once over the final order, with the
 * records and points the sheet will have (the top cut counted).
 */
export function ranking(t: Tournament, players: [string, Player][], matches: TableMatch[]): RankRow[] {
  const { standings: st, order } = results(t, players, matches)
  const swiss = new Map(st.map((s) => [s.id, s]))
  const all = t.status === 'done' ? new Map(standings(entrantsOf(players), matches).map((s) => [s.id, s])) : swiss
  const names = new Map(players)
  return (t.status === 'done' ? order : st.map((s) => s.id)).map((id) => {
    const s = swiss.get(id)!
    const r = all.get(id)!
    const p = names.get(id)
    const { points, wins, losses, draws } = r
    return { id, name: p?.name ?? id, commander: p?.commander ?? null, points, wins, losses, draws, omwp: s.omwp, dropped: s.dropped }
  })
}

export interface SheetRow {
  name: string
  commander: string | null
  w: number
  l: number
  d: number
  bye: boolean
  list: string // the decklist link, or ''
}

/**
 * What goes into the sheet's stage tab (or a level's "Classifica"), in the final order: name and commander (columns
 * B-C), wins, losses, draws, bye and decklist (E-I); the points (D) are a formula. Wins count the bye, as in the sheets;
 * losses the rounds a late entry missed; both the top cut.
 */
export function sheetData(t: Tournament, players: [string, Player][], matches: TableMatch[], lists = new Map<string, string>()): SheetRow[] {
  const rec = new Map(standings(entrantsOf(players), matches).map((s) => [s.id, s]))
  const names = new Map(players)
  return results(t, players, matches).order.map((id) => {
    const r = rec.get(id)!
    const p = names.get(id)!
    return { name: p.name, commander: p.commander, w: r.wins, l: r.losses, d: r.draws, bye: r.byes > 0, list: lists.get(id) ?? '' }
  })
}

/** The same rows to paste by hand, in the two blocks around the points column: B-C, then E-I. */
export function sheetRows(t: Tournament, players: [string, Player][], matches: TableMatch[], lists?: Map<string, string>) {
  const rows = sheetData(t, players, matches, lists)
  return {
    names: rows.map((r) => `${r.name}\t${r.commander ?? ''}`).join('\n'),
    results: rows.map((r) => [r.w, r.l, r.d, r.bye ? 'TRUE' : 'FALSE', r.list].join('\t')).join('\n'),
  }
}

/** A result from one player's side: their games first. */
export const sideScore = (s: Score, flip: boolean) => {
  const [a, b, d] = flip ? [s[1], s[0], s[2]] : s
  return d ? `${a}-${b}-${d}` : `${a}-${b}`
}

/**
 * The player's matches of a finished tournament, as their own records (the stats): the opponent and their commander,
 * the games, the deck of the app they registered with. Ids from the tournament and round, so recording them again
 * (another phone, another visit) changes nothing.
 */
export function personalMatches(
  id: string,
  t: Tournament,
  players: [string, Player][],
  matches: TableMatch[],
  me: string,
  decks: Deck[],
  notes: string,
): Played[] {
  const names = new Map(players)
  const p = names.get(me)
  const deck = decks.find((d) => d.id === p?.deck)
  return matches
    .filter((m) => m.p2 && m.score && (m.p1 === me || m.p2 === me))
    .map((m) => {
      const flip = m.p2 === me
      const opp = (flip ? m.p1 : m.p2)!
      const [a, b] = flip ? [m.score![1], m.score![0]] : [m.score![0], m.score![1]]
      return {
        id: `${id}~r${m.round}`,
        // the rounds in their order, on the tournament's day
        date: new Date(Date.parse(`${t.date}T10:00:00`) + m.round * 3_600_000).toISOString(),
        result: a > b ? 'W' : b > a ? 'L' : 'D',
        format: 'bo3',
        score: [a, b],
        ...(deck ? { deckId: deck.id } : {}),
        deckName: deck?.name ?? p?.commander ?? '',
        opponent: names.get(opp)?.commander ?? '',
        opponentName: names.get(opp)?.name ?? opp,
        opponentPlayer: opp,
        kind: 'tournament',
        notes,
      }
    })
}

// ---------- showing ----------

/** Ticks every second, for the round's clock. */
export function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])
  return now
}

/** Time left in the round (negative once it's over), or null when no round is being played. */
export const timeLeft = (tour: Tournament, now: number, extra = 0) =>
  tour.started && tour.status !== 'done' && tour.status !== 'open' ? tour.started.toMillis() + (ROUND_MINUTES + extra) * 60_000 - now : null
export const clockLabel = (ms: number | null, t: T) => (ms == null ? '' : ms > 0 ? fmt(ms) : t('run.time'))

export const tournamentTitle = (tour: Tournament, t: T) => (tour.stage ? `${tour.name} · ${t('run.stage', { n: tour.stage })}` : tour.name)

export function tournamentStatus(tour: Tournament, t: T) {
  if (tour.status === 'open') return t('run.status.open')
  if (tour.status === 'done') return t('run.status.done')
  if (tour.status === 'cut') return t('run.status.cut')
  return t('run.round', { n: tour.round, of: tour.rounds || '?' })
}

// ---------- reading ----------

/** The tournaments from yesterday on: the ones being played, about to be, and just over. */
export function useTournaments() {
  const [since] = useState(() => new Date(Date.now() - 864e5).toISOString().slice(0, 10))
  const { docs, loaded } = useLiveCollection<Tournament>('tournaments', ['date', '>=', since])
  return { tournaments: docs, loaded }
}

/** The tournaments whose results aren't in the sheet yet, however old. */
export function useUnfiled() {
  return useLiveCollection<Tournament>('tournaments', ['filed', '==', false]).docs
}

/** Every tournament on a sheet, also the old ones: the stages played in the app may not be in the meta yet. */
export async function tournamentsOf(drive: string) {
  const { db, fs } = await fb()
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'tournaments'), fs.where('drive', '==', drive)))
  return snap.docs.map((d): [string, Tournament] => [d.id, d.data() as Tournament])
}

/** The open tournament with this registration code, if any. */
export async function findByCode(code: string): Promise<string | null> {
  const { db, fs } = await fb()
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'tournaments'), fs.where('code', '==', code.toUpperCase())))
  return snap.docs.find((d) => (d.data() as Tournament).status === 'open')?.id ?? null
}

/** A tournament with its players and matches, live. */
export function useTournament(id: string | null) {
  const [t, setT] = useState<Tournament | null>(null)
  useEffect(() => {
    setT(null)
    if (!cloudEnabled || !id) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      const ref = fs.doc(db, 'tournaments', id)
      unsub = fs.onSnapshot(ref, (snap) => setT((snap.data() as Tournament) ?? null), () => setT(null))
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [id])
  const players = useLiveCollection<Player>(id && `tournaments/${id}/players`).docs
  const docs = useLiveCollection<TableMatch>(id && `tournaments/${id}/matches`).docs
  const matches = useMemo(() => docs.map(([, m]) => m).sort((a, b) => a.round - b.round || a.table - b.table), [docs])
  return { t, players, matches }
}

// ---------- writing (the TOs) ----------

const now = () => new Date().toISOString()

/** Starts registering a tournament on a sheet; fails ('taken') when a TO already did. */
export async function createTournament(user: AppUser, s: Source, date: string, stage?: number) {
  const { db, fs } = await fb()
  const ref = fs.doc(db, 'tournaments', tournamentId(s.drive, isEvent(s.kind) ? undefined : stage))
  await fs.runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new Error('taken')
    const t: Tournament = {
      drive: s.drive,
      kind: s.kind,
      name: (isEvent(s.kind) ? s.name : s.league) ?? '',
      ...(isEvent(s.kind) ? {} : { stage }),
      date,
      status: 'open',
      rounds: 0,
      cut: 0,
      round: 0,
      started: null,
      filed: false,
      code: newCode(),
      at: now(),
      by: user.uid,
    }
    tx.set(ref, t)
  })
  return ref.id
}

/** Date, Swiss rounds, top cut and registration code, while they can still change. */
export async function setTournament(id: string, patch: Partial<Pick<Tournament, 'date' | 'rounds' | 'cut' | 'code'>>) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id), patch)
}

/** Adds a player (a late one from the round they join), or changes their commander. */
export async function savePlayer(user: AppUser, id: string, key: string, p: Pick<Player, 'name' | 'commander' | 'joined'>) {
  const { db, fs } = await fb()
  // Firestore takes no undefined fields
  const data = { name: p.name, commander: p.commander, ...(p.joined ? { joined: p.joined } : {}), at: now(), by: user.uid }
  await fs.setDoc(fs.doc(db, 'tournaments', id, 'players', key), data, { merge: true })
}

/** Takes a player off (the TO), or the player leaves before round 1: their decklist goes with them. */
export async function removePlayer(id: string, key: string) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  batch.delete(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))
  batch.delete(fs.doc(db, 'tournaments', id, 'players', key))
  await batch.commit()
}

/** Drops a player after `round` (null: takes the drop back). */
export async function setDrop(id: string, key: string, round: number | null) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'players', key), { drop: round ?? fs.deleteField() })
}

/** A result entered by the TO: it needs no confirmation. */
export async function setScore(id: string, m: TableMatch, score: Score | null) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), {
    score,
    reportedBy: fs.deleteField(),
    confirmed: fs.deleteField(),
  })
}

export async function setExtra(id: string, m: TableMatch, minutes: number) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), { extra: minutes })
}

/**
 * Writes a round's pairings and starts its clock, in one go: every phone sees them at once. The round's matches
 * already there go (pairing a round again after a mistake).
 */
async function writeRound(
  id: string,
  round: number,
  pairs: [string, string | null][],
  old: TableMatch[],
  patch: Partial<Tournament>,
  gone: string[] = [],
) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  for (const m of old) if (m.round === round) batch.delete(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)))
  for (const key of gone) {
    batch.delete(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))
    batch.delete(fs.doc(db, 'tournaments', id, 'players', key))
  }
  let table = 0
  for (const [p1, p2] of pairs) {
    const n = p2 ? ++table : 0
    const m: TableMatch = { round, table: n, p1, p2, score: null }
    batch.set(fs.doc(db, 'tournaments', id, 'matches', matchId(round, n)), m)
  }
  batch.update(fs.doc(db, 'tournaments', id), { ...patch, round, started: fs.serverTimestamp() })
  await batch.commit()
}

/** The next Swiss round; `again`: the current one paired again. */
export async function pairSwiss(id: string, t: Tournament, players: [string, Player][], matches: TableMatch[], again = false) {
  const round = again ? t.round : t.round + 1
  // round 1 closes registration: the code stops working and the requests not confirmed are turned down
  const first = t.status === 'open'
  const gone = first ? players.filter(([, p]) => p.pending).map(([k]) => k) : []
  await writeRound(id, round, pairRound(entrantsOf(players), matches, round), matches, { status: 'swiss', ...(first ? { code: null } : {}) }, gone)
}

/** The first round of the top cut, from the Swiss standings: the Swiss rounds end with the one just played. */
export async function startCut(id: string, t: Tournament, players: [string, Player][], matches: TableMatch[]) {
  const seeds = cutSeeds(standings(entrantsOf(players), matches), t.cut)
  await writeRound(id, t.round + 1, cutPairings(seeds), matches, { status: 'cut', rounds: t.round })
}

/** The next round of the top cut; null when the current one isn't over or was the final. */
export async function nextCutRound(id: string, t: Tournament, matches: TableMatch[]) {
  const pairs = nextCut(matches.filter((m) => m.round === t.round))
  if (pairs) await writeRound(id, t.round + 1, pairs, matches, {})
  return pairs
}

export async function finishTournament(id: string) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id), { status: 'done' })
}

/** Marks the results as copied into the sheet (or not). */
export async function setFiled(id: string, filed: boolean) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id), { filed })
}

/** Cancels a tournament, with its players and matches: the sheet can be started again. */
export async function deleteTournament(id: string, players: [string, Player][], matches: TableMatch[]) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  for (const [key] of players) {
    batch.delete(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))
    batch.delete(fs.doc(db, 'tournaments', id, 'players', key))
  }
  for (const m of matches) batch.delete(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)))
  batch.delete(fs.doc(db, 'tournaments', id))
  await batch.commit()
}

/** Confirms a registration from the app; a claim not verified yet becomes verified, signed by this TO. */
export async function confirmPlayer(user: AppUser, id: string, key: string, verify: boolean) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  batch.update(fs.doc(db, 'tournaments', id, 'players', key), { pending: fs.deleteField() })
  if (verify) batch.update(fs.doc(db, 'claims', key), { verified: true, verifiedBy: user.uid, verifiedIn: id })
  await batch.commit()
}

// ---------- writing (the players, from the app) ----------

/**
 * Registers the account's player with the code, or changes their commander and deck: a new registration waits for a
 * TO when the claim isn't verified; one the TO already made is joined.
 */
export async function joinTournament(
  user: AppUser,
  id: string,
  key: string,
  p: { name: string; commander: string; deck: string | null; verified: boolean },
  existing: boolean,
) {
  const { db, fs } = await fb()
  const ref = fs.doc(db, 'tournaments', id, 'players', key)
  const mine = { commander: p.commander, deck: p.deck, uid: user.uid, at: now(), by: user.uid }
  if (existing) await fs.updateDoc(ref, mine)
  else await fs.setDoc(ref, { name: p.name, ...mine, ...(p.verified ? {} : { pending: true }) })
}

/** The decklist link (null: none), private until the tournament is over. */
export async function saveList(id: string, key: string, link: string | null) {
  const { db, fs } = await fb()
  const ref = fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck')
  if (link) await fs.setDoc(ref, { link })
  else await fs.deleteDoc(ref)
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'players', key), { list: !!link })
}

export async function loadList(id: string, key: string) {
  const { db, fs } = await fb()
  const snap = await fs.getDoc(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))
  return (snap.data()?.link as string | undefined) ?? null
}

/** Every decklist given, by player: for the TOs, and for everyone once the tournament is over. */
export async function loadLists(id: string, players: [string, Player][]) {
  const given = players.filter(([, p]) => p.list)
  const links = await Promise.all(given.map(([k]) => loadList(id, k)))
  return new Map(given.flatMap(([k], i): [string, string][] => (links[i] ? [[k, links[i]!]] : [])))
}

/** The decklists of a finished tournament, for whoever follows it. */
export function useLists(id: string, players: [string, Player][], on: boolean) {
  const [lists, setLists] = useState(new Map<string, string>())
  const keys = players.filter(([, p]) => p.list).map(([k]) => k).join()
  useEffect(() => {
    if (on && keys) loadLists(id, players).then(setLists, () => {})
  }, [id, on, keys]) // eslint-disable-line react-hooks/exhaustive-deps
  return lists
}

export const canPublish = !!PUBLISH_URL

/**
 * Writes the final standings into the tournament's sheet, through the Apps Script (scripts/meta/apps-script, doPost):
 * it checks with the TO's sign-in that they run this tournament, writes, and marks it as in the sheet. Throws the
 * script's message when it refuses.
 */
export async function publishTournament(id: string, rows: SheetRow[]) {
  const { auth } = await fb()
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('login')
  // plain text: a JSON content type would need a preflight, which Apps Script doesn't answer
  const res = await fetch(PUBLISH_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token, id, rows }) })
  const out = (await res.json()) as { ok?: boolean; error?: string; tab: string; players: string[]; commanders: string[]; manual: string[] }
  if (!out.ok) throw new Error(out.error ?? 'error')
  return out
}

/** A Moxfield deck's address, the only decklists taken for now. */
export const isListLink = (s: string) => /^https:\/\/(www\.)?moxfield\.com\/decks\/[-_A-Za-z0-9]+\/?$/.test(s)

/** A result entered by one of the two players: the other confirms it. */
export async function reportScore(id: string, m: TableMatch, score: Score, me: string) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), { score, reportedBy: me, confirmed: false })
}

export async function confirmScore(id: string, m: TableMatch) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), { confirmed: true })
}
