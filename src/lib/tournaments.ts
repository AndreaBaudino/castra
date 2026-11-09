import { useEffect, useMemo, useState } from 'react'
import type { AppUser } from './auth'
import { fb, useLiveCollection, useLiveDoc } from './firebase'
import type { WriteBatch } from 'firebase/firestore'
import { fmt } from './timer'
import type { T } from '../i18n'
import type { MetaDataset } from './meta'
import { type Deck, exportDecklist } from './decks'
import type { Match as Played } from './matches'
import { NOTIFY_URL, PUBLISH_URL } from '../config'
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
  // the calendar of the next tournaments: start, venue, its address for the maps; `hidden` by the TO keeps it out
  time?: string | null // HH:MM
  place?: string | null
  address?: string | null
  hidden?: boolean
  // what "Pubblica sul foglio" wrote, kept by the Apps Script to take it off again
  published?: { tab: string; first: number; rows: number; players: string[]; commanders: string[] }
  at: string
  by: string
}

/** A player at a tournament: players/{player key}. */
export interface Player {
  name: string
  commander: string | null // asked before the first round; secret until then (in players/{key}/private/deck)
  secret?: boolean // the commander given and kept secret, until round 1 brings it here
  joined?: number // a late entry: the first round played
  drop?: number // the last round played
  uid?: string // the account that registered (or confirmed) from the app
  pending?: boolean // registered from the app with a claim not verified yet: in once a TO confirms
  deck?: string // the player's deck in the app, for their stats
  invalid?: boolean // that deck failed the app's check when they registered
  list?: boolean // they gave their decklist (the link is in players/{key}/private/deck)
  at: string
  by: string
}

/** Whether the player gave their commander: maybe still secret. */
export const hasCommander = (p: Player) => !!p.commander || !!p.secret

/** What players/{key}/private/deck keeps: the decklist (a Moxfield link, or the photo of a deck of the app) and, until
 * round 1, the commander. */
export interface Private {
  link?: string
  commander?: string
  // the photo (docs/liste-mazzi.md, 8): the deck as it was when round 1 started, apart from the deck itself
  cards?: string // exportDecklist, without the sideboard
  name?: string
  at?: string // the deck's updatedAt when taken
  invalid?: boolean // it failed the app's check
}

/** A match: matches/r{round}t{table}, the bye at table 0. */
export interface TableMatch extends Match {
  table: number
  extra?: number // minutes added to this table's clock
  reportedBy?: string // the player who entered the result, until the other confirms it (missing: the TO entered it)
  confirmed?: boolean
}

/** What the log tells: the TO's actions, and the players' own (registering, results, drop). */
export type LogKind =
  | 'join' | 'commander' | 'leave' | 'report' | 'confirm' | 'drop' // also the players
  | 'undrop' | 'add' | 'remove' | 'accept' | 'score' | 'extra' | 'pair' | 'repair' | 'cut' | 'done'
  | 'filed' | 'unfiled' | 'publish' | 'unpublish' | 'cancel'
  | Penalty

/** What a TO writes down about a player (or a table, the deck check), in the log. */
export const PENALTIES = ['warning', 'gameLoss', 'matchLoss', 'dq', 'note'] as const
export type Penalty = (typeof PENALTIES)[number] | 'deckCheck'
// the most common ones in the tournament rules; the details go in the text
export const INFRACTIONS = ['tardiness', 'decklist', 'extraCards', 'rules', 'gameState', 'slowPlay', 'conduct', 'other'] as const
export type Infraction = (typeof INFRACTIONS)[number]

/** A line of the tournament's log, log/{auto}: only its TOs read it, nobody changes it. */
export interface LogEntry {
  at: { toMillis: () => number } | null // the server's time (null until the write reaches it)
  by: string // the account that did it
  kind: LogKind
  round?: number
  table?: number
  player?: string // the player it's about
  from?: string
  to?: string
  infraction?: Infraction
  text?: string
  uid?: string // the player's account, on a penalty: they see it too
}

/** A result one player entered and the other hasn't confirmed yet. */
export const unconfirmed = (m: TableMatch) => !!m.score && !!m.reportedBy && !m.confirmed

// six letters and digits, without the ones easy to mix up (0 O 1 I)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % 32]).join('')
export const joinLink = (code: string) => `${location.origin}${location.pathname}#join~${code}`

/** The page of a player's photographed list (#live/<tournament>@<player>), the link written in the sheet. */
// the app's base, not the page open now: the sheets' Apps Script takes only this address (scripts/meta/apps-script)
const app = () => `${location.origin}${import.meta.env.BASE_URL}`
export const photoLink = (id: string, key: string) => `${app()}#live/${encodeURIComponent(id)}@${encodeURIComponent(key)}`
/** A link to a page of the app, opened in place (App.tsx) rather than in another tab. */
export const isAppLink = (url: string) => url.startsWith(`${app()}#`)
/** The props of a link to a decklist: Moxfield in another tab, a photo in place. */
export const listLinkProps = (url: string) => (isAppLink(url) ? { href: url } : { href: url, target: '_blank', rel: 'noreferrer' })

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
  const place = t.status === 'done' ? ranking(t, players, matches).findIndex((r) => r.id === me) + 1 : 0
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
        ...(place ? { place } : {}),
        // registered with a deck of the app: the decklist is its photo
        ...(p?.deck && p.list ? { photo: me } : {}),
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

/** The calendar: tournaments not started yet, from today on, that their TO didn't hide; the soonest first. */
export const upcoming = (ts: [string, Tournament][]) => {
  const today = new Date().toLocaleDateString('sv') // the local day, as YYYY-MM-DD
  return ts
    .filter(([, x]) => x.status === 'open' && !x.hidden && x.date >= today)
    .sort(([, a], [, b]) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}

/** Which of these tournaments the player is in (a request waiting for the TO counts): undefined while reading. */
export function useEntered(ids: string[], me: string | null) {
  const [entered, setEntered] = useState<Set<string>>()
  const key = ids.join('|')
  useEffect(() => {
    if (!me || !ids.length) return setEntered(new Set())
    let on = true
    fb()
      .then(({ db, fs }) => Promise.all(ids.map((id) => fs.getDoc(fs.doc(db, 'tournaments', id, 'players', me)).then((d) => (d.exists() ? id : '')))))
      .then((r) => on && setEntered(new Set(r.filter(Boolean))), () => on && setEntered(new Set()))
    return () => {
      on = false
    }
  }, [key, me]) // eslint-disable-line react-hooks/exhaustive-deps
  return entered
}

/** The tournament as a calendar file (.ics): the day, or from its start time for four hours. */
export function icsOf(id: string, x: Tournament, title: string, url: string) {
  const day = x.date.replace(/-/g, '')
  const esc = (v: string) => v.replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n')
  const when = x.time
    ? [`DTSTART:${day}T${x.time.replace(':', '')}00`, `DURATION:PT4H`]
    : [`DTSTART;VALUE=DATE:${day}`, `DURATION:P1D`]
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Castra//IT',
    'BEGIN:VEVENT',
    `UID:${id.replace(/[^\w~-]/g, '')}@castra`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ...when,
    `SUMMARY:${esc(title)}`,
    ...(x.place || x.address ? [`LOCATION:${esc([x.place, x.address].filter(Boolean).join(', '))}`] : []),
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
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
export function useTournament(id: string | null, me?: string | null) {
  const t = useLiveDoc<Tournament>(id && `tournaments/${id}`)
  const players = useLiveCollection<Player>(id && `tournaments/${id}/players`).docs
  // a player's phone: only their own matches while it's played, so each result reaches the two at that table and not
  // every phone at the tournament (Firestore reads); all of them once it's over, for the final standings
  const mine: [string, '==', string][] | undefined = me && t?.status !== 'done' ? [['p1', '==', me], ['p2', '==', me]] : undefined
  const docs = useLiveCollection<TableMatch>(id && `tournaments/${id}/matches`, mine).docs
  const matches = useMemo(() => docs.map(([, m]) => m).sort((a, b) => a.round - b.round || a.table - b.table), [docs])
  return { t, players, matches }
}

// ---------- writing (the TOs) ----------

const now = () => new Date().toISOString()

const scoreText = (s?: Score | null) => (s ? s.slice(0, s[2] ? 3 : 2).join('-') : '—')

/** A new line of the tournament's log, signed and timed: written in the same go as the change it tells. */
function logLine({ db, fs, auth }: Awaited<ReturnType<typeof fb>>, id: string, e: Omit<LogEntry, 'at' | 'by'>) {
  // Firestore takes no undefined fields
  const data = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined))
  return [fs.doc(fs.collection(db, 'tournaments', id, 'log')), { ...data, at: fs.serverTimestamp(), by: auth.currentUser?.uid }] as const
}

/** A change made in one write, with its log line. */
async function logged(id: string, e: Omit<LogEntry, 'at' | 'by'>, write: (f: Awaited<ReturnType<typeof fb>>, batch: WriteBatch) => void) {
  const f = await fb()
  const batch = f.fs.writeBatch(f.db)
  write(f, batch)
  batch.set(...logLine(f, id, e))
  await batch.commit()
}

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
export async function setTournament(id: string, patch: Partial<Pick<Tournament, 'date' | 'rounds' | 'cut' | 'code' | 'time' | 'place' | 'address' | 'hidden'>>) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'tournaments', id), patch)
}

/**
 * Adds a player (a late one from the round they join), or changes their commander (`old`: as they were). While
 * registration is `open` the commander goes in the private document: secret until round 1.
 */
export async function savePlayer(user: AppUser, id: string, key: string, p: Pick<Player, 'name' | 'commander' | 'joined'>, open: boolean, old?: Player) {
  const hide = open && !!p.commander
  // Firestore takes no undefined fields
  const data = { name: p.name, commander: hide ? null : p.commander, secret: hide, ...(p.joined ? { joined: p.joined } : {}), at: now(), by: user.uid }
  const e = old
    ? { kind: 'commander' as const, player: key, from: old.commander ?? '—', to: p.commander ?? '—' }
    : { kind: 'add' as const, player: key, round: p.joined, to: p.commander ?? undefined }
  await logged(id, e, ({ db, fs }, b) => {
    if (hide) b.set(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'), { commander: p.commander }, { merge: true })
    b.set(fs.doc(db, 'tournaments', id, 'players', key), data, { merge: true })
  })
}

/** Takes a player off (the TO), or the player leaves before round 1 (`self`): their decklist goes with them. */
export async function removePlayer(id: string, key: string, self = false) {
  await logged(id, { kind: self ? 'leave' : 'remove', player: key }, ({ db, fs }, b) => {
    b.delete(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))
    b.delete(fs.doc(db, 'tournaments', id, 'players', key))
  })
}

/** Drops a player after `round` (null: takes the drop back). */
export async function setDrop(id: string, key: string, round: number | null) {
  await logged(id, round ? { kind: 'drop', player: key, round } : { kind: 'undrop', player: key }, ({ db, fs }, b) =>
    b.update(fs.doc(db, 'tournaments', id, 'players', key), { drop: round ?? fs.deleteField() }),
  )
}

/** A result entered by the TO: it needs no confirmation. */
export async function setScore(id: string, m: TableMatch, score: Score | null) {
  const e = { kind: 'score' as const, round: m.round, table: m.table, from: scoreText(m.score), to: scoreText(score) }
  await logged(id, e, ({ db, fs }, b) =>
    b.update(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), {
      score,
      reportedBy: fs.deleteField(),
      confirmed: fs.deleteField(),
    }),
  )
}

export async function setExtra(id: string, m: TableMatch, minutes: number) {
  await logged(id, { kind: 'extra', round: m.round, table: m.table, to: String(minutes) }, ({ db, fs }, b) =>
    b.update(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), { extra: minutes }),
  )
}

/**
 * Writes a round's pairings and starts its clock, in one go: every phone sees them at once. The round's matches
 * already there go (pairing a round again after a mistake). A transaction, not a batch: it fails ('stale') when the
 * tournament is no longer at the round `seen` (another phone moved it on), and it fails offline instead of waiting in
 * the queue, where it would replace a round already being played once back online.
 */
async function writeRound(
  id: string,
  seen: number,
  round: number,
  pairs: [string, string | null][],
  old: TableMatch[],
  patch: Partial<Tournament>,
  kind: LogKind,
  gone: string[] = [],
  reveal: string[] = [],
) {
  const f = await fb()
  const { db, fs } = f
  const ref = fs.doc(db, 'tournaments', id)
  const secretOf = (key: string) => fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck')
  await fs.runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).data()?.round !== seen) throw new Error('stale')
    // round 1: the secret commanders, read before any write (a transaction's rule)
    const secrets = await Promise.all(reveal.map(async (key) => [key, ((await tx.get(secretOf(key))).data() as Private | undefined)?.commander ?? null] as const))
    for (const [key, commander] of secrets) tx.update(fs.doc(db, 'tournaments', id, 'players', key), { commander, secret: fs.deleteField() })
    for (const m of old) if (m.round === round) tx.delete(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)))
    for (const key of gone) {
      tx.delete(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))
      tx.delete(fs.doc(db, 'tournaments', id, 'players', key))
    }
    let table = 0
    for (const [p1, p2] of pairs) {
      const n = p2 ? ++table : 0
      const m: TableMatch = { round, table: n, p1, p2, score: null }
      tx.set(fs.doc(db, 'tournaments', id, 'matches', matchId(round, n)), m)
    }
    tx.update(ref, { ...patch, round, started: fs.serverTimestamp() })
    tx.set(...logLine(f, id, { kind, round }))
  })
  ping({ id, action: 'round' })
}

/** Has the notifications' Apps Script send what this change means to the players: it never holds the change up. */
function ping(body: object) {
  if (!NOTIFY_URL) return
  fb()
    .then(({ auth }) => auth.currentUser?.getIdToken())
    // plain text: a JSON content type would need a preflight, which Apps Script doesn't answer
    .then((token) => {
      if (token) fetch(NOTIFY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token, ...body }) }).catch(() => {})
    })
    .catch(() => {})
}

/** The next Swiss round; `again`: the current one paired again. */
export async function pairSwiss(id: string, t: Tournament, players: [string, Player][], matches: TableMatch[], again = false) {
  const round = again ? t.round : t.round + 1
  // round 1 closes registration: the code stops working and the requests not confirmed are turned down
  const first = t.status === 'open'
  const gone = first ? players.filter(([, p]) => p.pending).map(([k]) => k) : []
  // and brings the commanders out of secret, in the same go
  const reveal = first ? players.filter(([, p]) => !p.pending && p.secret).map(([k]) => k) : []
  await writeRound(id, t.round, round, pairRound(entrantsOf(players), matches, round), matches, { status: 'swiss', ...(first ? { code: null } : {}) }, again ? 'repair' : 'pair', gone, reveal)
}

/** The first round of the top cut, from the Swiss standings: the Swiss rounds end with the one just played. */
export async function startCut(id: string, t: Tournament, players: [string, Player][], matches: TableMatch[]) {
  const seeds = cutSeeds(standings(entrantsOf(players), matches), t.cut)
  await writeRound(id, t.round, t.round + 1, cutPairings(seeds), matches, { status: 'cut', rounds: t.round }, 'cut')
}

/** The next round of the top cut; null when the current one isn't over or was the final. */
export async function nextCutRound(id: string, t: Tournament, matches: TableMatch[]) {
  const pairs = nextCut(matches.filter((m) => m.round === t.round))
  if (pairs) await writeRound(id, t.round, t.round + 1, pairs, matches, {}, 'pair')
  return pairs
}

/** Closes the tournament; `order`: the final standings' player keys, for each one's notification of their place. */
export async function finishTournament(id: string, order: string[]) {
  await logged(id, { kind: 'done' }, ({ db, fs }, b) => b.update(fs.doc(db, 'tournaments', id), { status: 'done' }))
  ping({ id, action: 'done', order })
}

/** Marks the results as copied into the sheet (or not). */
export async function setFiled(id: string, filed: boolean) {
  await logged(id, { kind: filed ? 'filed' : 'unfiled' }, ({ db, fs }, b) => b.update(fs.doc(db, 'tournaments', id), { filed }))
}

/**
 * Cancels a tournament, with its players and matches: the sheet can be started again. The log stays, with who
 * cancelled it: a tournament started again on the same sheet shows only its own lines.
 */
export async function deleteTournament(id: string, players: [string, Player][], matches: TableMatch[]) {
  await logged(id, { kind: 'cancel' }, ({ db, fs }, batch) => {
    for (const [key] of players) {
      batch.delete(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))
      batch.delete(fs.doc(db, 'tournaments', id, 'players', key))
    }
    for (const m of matches) batch.delete(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)))
    batch.delete(fs.doc(db, 'tournaments', id))
  })
}

/** Confirms a registration from the app; a claim not verified yet becomes verified, signed by this TO. */
export async function confirmPlayer(user: AppUser, id: string, key: string, verify: boolean) {
  await logged(id, { kind: 'accept', player: key }, ({ db, fs }, batch) => {
    batch.update(fs.doc(db, 'tournaments', id, 'players', key), { pending: fs.deleteField() })
    if (verify) batch.update(fs.doc(db, 'claims', key), { verified: true, verifiedBy: user.uid, verifiedIn: id })
  })
  ping({ id, action: 'accepted', player: key })
}

/** A penalty, a note or a deck check, by a TO. */
export async function addPenalty(id: string, e: Omit<LogEntry, 'at' | 'by'>) {
  await logged(id, e, () => {})
}

/** The penalties the player got at this tournament (the TO's notes carry no account), oldest first. */
export function useMyPenalties(id: string | null, uid: string | null) {
  const { docs } = useLiveCollection<LogEntry>(id && uid && `tournaments/${id}/log`, ['uid', '==', uid ?? ''])
  return useMemo(() => docs.map(([, e]) => e).sort((a, b) => (a.at?.toMillis() ?? Infinity) - (b.at?.toMillis() ?? Infinity)), [docs])
}

/** The tournament's log, newest first, for its TOs: only the lines of this run of it (`since`: when it started). */
export function useLog(id: string | null, since: string) {
  const { docs } = useLiveCollection<LogEntry>(id && `tournaments/${id}/log`)
  return useMemo(
    () =>
      docs
        .map(([, e]) => e)
        .filter((e) => !e.at || new Date(e.at.toMillis()).toISOString() >= since)
        .sort((a, b) => (b.at?.toMillis() ?? Infinity) - (a.at?.toMillis() ?? Infinity)),
    [docs, since],
  )
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
  p: { name: string; commander: string; deck: string | null; invalid: boolean; verified: boolean },
  existing: boolean,
) {
  const { db, fs } = await fb()
  const ref = fs.doc(db, 'tournaments', id, 'players', key)
  // the commander in the private document, secret until round 1
  const mine = { commander: null, secret: true, deck: p.deck, invalid: p.invalid, uid: user.uid, at: now(), by: user.uid }
  await logged(id, { kind: existing ? 'commander' : 'join', player: key, to: p.commander }, (_, b) => {
    b.set(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'), { commander: p.commander }, { merge: true })
    if (existing) b.update(ref, mine)
    else b.set(ref, { name: p.name, ...mine, ...(p.verified ? {} : { pending: true }) })
  })
  if (!existing) ping({ id, action: 'request', player: key })
}

/** The decklist link (null: none), private until the tournament is over: it takes the place of a photo. */
export async function saveList(id: string, key: string, link: string | null, photo = false) {
  const { db, fs } = await fb()
  const gone = fs.deleteField()
  // the same document keeps the secret commander
  await fs.setDoc(
    fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'),
    { link: link ?? gone, ...(photo ? { cards: gone, name: gone, at: gone, invalid: gone } : {}) },
    { merge: true },
  )
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'players', key), { list: !!link })
}

/** The photo of the deck the player registered with: taken again at each change until round 1 locks it. */
export async function savePhoto(id: string, key: string, deck: Deck, invalid: boolean) {
  const { db, fs } = await fb()
  const cards = exportDecklist({ ...deck, cards: deck.cards.filter((c) => c.section !== 'side') })
  await fs.setDoc(
    fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'),
    { cards, name: deck.name, at: deck.updatedAt, invalid, link: fs.deleteField() },
    { merge: true },
  )
  await fs.updateDoc(fs.doc(db, 'tournaments', id, 'players', key), { list: true })
}

/** The player's private document: their decklist and, until round 1, their commander. */
export async function loadPrivate(id: string, key: string) {
  const { db, fs } = await fb()
  return ((await fs.getDoc(fs.doc(db, 'tournaments', id, 'players', key, 'private', 'deck'))).data() as Private | undefined) ?? {}
}

/** The decklist's link: Moxfield, or the page of the photo. */
export const loadList = async (id: string, key: string) => {
  const p = await loadPrivate(id, key)
  return p.link ?? (p.cards ? photoLink(id, key) : null)
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
export const publishTournament = (id: string, rows: SheetRow[]) =>
  script<{ tab: string; players: string[]; commanders: string[]; manual: string[] }>({ id, rows }, id, 'publish')

/** Takes a published tournament off its sheet ("Togli dal foglio"); `kept`: the names other stages still use. */
export const unpublishTournament = (id: string) => script<{ tab: string; kept: string[] }>({ id, action: 'clear' }, id, 'unpublish')

/** A new level 1's sheet, copied by the Apps Script from the template with its name and date (admins only): its id. */
export const createLevelSheet = (uid: string, name: string, date: string) => script<{ id: string }>({ action: 'create', uid, name, date })

/** Bins a level 1's sheet of the script's account while still empty and never opened in the app (admins only). */
export const trashLevelSheet = (uid: string, id: string) => script<object>({ action: 'trash', uid, id })

/** A call to the Apps Script; `id`: the tournament whose log tells it, once done (the script writes on its own). */
async function script<T>(body: object, id?: string, kind?: LogKind): Promise<T> {
  const { auth } = await fb()
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('login')
  // plain text: a JSON content type would need a preflight, which Apps Script doesn't answer
  const res = await fetch(PUBLISH_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token, ...body }) })
  const out = (await res.json()) as T & { ok?: boolean; error?: string }
  if (!out.ok) throw new Error(out.error ?? 'error')
  if (id && kind) await logged(id, { kind }, () => {}).catch(() => {}) // done anyway: a missing line mustn't say otherwise
  return out
}

/** A Moxfield deck's address, the only decklists taken for now. */
export const isListLink = (s: string) => /^https:\/\/(www\.)?moxfield\.com\/decks\/[-_A-Za-z0-9]+\/?$/.test(s)

/** A result entered by one of the two players: the other confirms it. */
export async function reportScore(id: string, m: TableMatch, score: Score, me: string) {
  await logged(id, { kind: 'report', round: m.round, table: m.table, player: me, to: scoreText(score) }, ({ db, fs }, b) =>
    b.update(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), { score, reportedBy: me, confirmed: false }),
  )
  ping({ id, action: 'report', match: matchId(m.round, m.table) })
}

export async function confirmScore(id: string, m: TableMatch, me: string) {
  await logged(id, { kind: 'confirm', round: m.round, table: m.table, player: me, to: scoreText(m.score) }, ({ db, fs }, b) =>
    b.update(fs.doc(db, 'tournaments', id, 'matches', matchId(m.round, m.table)), { confirmed: true }),
  )
}
