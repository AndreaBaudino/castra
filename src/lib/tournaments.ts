import { useEffect, useMemo, useState } from 'react'
import type { AppUser } from './auth'
import { cloudEnabled, fb, useLiveCollection } from './firebase'
import type { MetaDataset } from './meta'
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
  at: string
  by: string
}

/** A player at a tournament: players/{player key}. */
export interface Player {
  name: string
  commander: string | null // asked before the first round
  joined?: number // a late entry: the first round played
  drop?: number // the last round played
  at: string
  by: string
}

/** A match: matches/r{round}t{table}, the bye at table 0. */
export interface TableMatch extends Match {
  table: number
  extra?: number // minutes added to this table's clock
}

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

/** What the engine needs, from the documents. */
export const entrantsOf = (players: [string, Player][]): Entrant[] =>
  players.map(([id, p]) => ({ id, joined: p.joined, drop: p.drop }))

/** The Swiss standings (the top cut aside) and the final order (the top cut first). */
export function results(t: Tournament, players: [string, Player][], matches: TableMatch[]) {
  const cut = t.status === 'cut' || t.status === 'done' ? matches.filter((m) => m.round > t.rounds) : []
  const st: Standing[] = standings(entrantsOf(players), matches.filter((m) => !cut.includes(m)))
  return { standings: st, order: finalOrder(st, cut) }
}

// ---------- reading ----------

/** The tournaments from yesterday on: the ones being played, about to be, and just over. */
export function useTournaments() {
  const [since] = useState(() => new Date(Date.now() - 864e5).toISOString().slice(0, 10))
  const { docs, loaded } = useLiveCollection<Tournament>('tournaments', ['date', '>=', since])
  return { tournaments: docs, loaded }
}

/** Every tournament on a sheet, also the old ones: the stages played in the app may not be in the meta yet. */
export async function tournamentsOf(drive: string) {
  const { db, fs } = await fb()
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'tournaments'), fs.where('drive', '==', drive)))
  return snap.docs.map((d): [string, Tournament] => [d.id, d.data() as Tournament])
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
      at: now(),
      by: user.uid,
    }
    tx.set(ref, t)
  })
  return ref.id
}

/** Date, Swiss rounds and top cut, while they can still change. */
export async function setTournament(id: string, patch: Partial<Pick<Tournament, 'date' | 'rounds' | 'cut'>>) {
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

export async function removePlayer(id: string, key: string) {
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'tournaments', id, 'players', key))
}

/** Drops a player after `round` (null: takes the drop back). */
export async function setDrop(id: string, key: string, round: number | null) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'players', key), { drop: round ?? fs.deleteField() })
}

export async function setScore(id: string, m: TableMatch, score: Score | null) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), { score })
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
) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  for (const m of old) if (m.round === round) batch.delete(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)))
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
  await writeRound(id, round, pairRound(entrantsOf(players), matches, round), matches, { status: 'swiss' })
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

/** Cancels a tournament, with its players and matches: the sheet can be started again. */
export async function deleteTournament(id: string, players: [string, Player][], matches: TableMatch[]) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  for (const [key] of players) batch.delete(fs.doc(db, 'tournaments', id, 'players', key))
  for (const m of matches) batch.delete(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)))
  batch.delete(fs.doc(db, 'tournaments', id))
  await batch.commit()
}
