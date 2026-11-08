import { useEffect, useRef, useState } from 'react'
import { COMMANDER_DAMAGE_LETHAL, POISON_LETHAL, STARTING_LIFE } from '../config'
import { useI18n } from '../i18n'
import type { Deck } from '../lib/decks'
import type { Match } from '../lib/matches'
import { useStoredState } from '../lib/storage'
import { playAlarm, unlockAudio } from '../lib/sound'
import { haptic, readPrefs } from '../lib/prefs'
import {
  type TimerSettings,
  type TimerState,
  elapsed,
  fmt,
  freshTimer,
  phaseOf,
  totalMs,
} from '../lib/timer'
import { Icon, Pips, useBackCloses } from '../components/ui'
import { RecordMatch } from '../components/RecordMatch'
import { useDialog } from '../components/Dialog'
import { CardLookupSheet } from './Cards'
import { DungeonSheet } from '../components/DungeonSheet'
import { DUNGEONS, type DungeonRun, lastRoom } from '../lib/dungeons'
import { ROUND_MINUTES, sideScore, unconfirmed, useTournament } from '../lib/tournaments'
import type { Score } from '../lib/swiss'
import { ResultSheet } from './Organizer'
import { artUrl } from './MetaPages'
import { ArtSheet, type CardArt } from '../components/ArtSheet'
import { isCommander } from '../lib/scryfall'
import { useWakeLock } from '../lib/wakeLock'

export interface PlayerState {
  life: number
  cmd: number // commander damage received
  poison: number
  energy?: number
  exp?: number // experience
  storm?: number
  mana?: number[] // floating mana by MANA: storm and mana change too often for the history
}

const MANA = ['W', 'U', 'B', 'R', 'G', 'C']

/** The counters shown in one game: commander damage unless turned off, the others when turned on. */
export type Extra = 'cmd' | 'poison' | 'energy' | 'exp' | 'storm' | 'mana' | 'monarch' | 'initiative' | 'dungeon'
const EXTRAS: Extra[] = ['cmd', 'poison', 'energy', 'exp', 'storm', 'mana', 'monarch', 'initiative', 'dungeon']
const EXTRA_KEY = {
  cmd: 'life.cmd',
  poison: 'life.poison',
  energy: 'life.energy',
  exp: 'life.exp',
  storm: 'life.storm',
  mana: 'life.mana',
  monarch: 'life.monarch',
  initiative: 'life.initiative',
  dungeon: 'life.dungeon',
} as const

/** A tournament match opened from the home (docs/tornei.md): the round's clock, and the result goes to the tournament.
 * The match reaches the stats only with the tournament's own record, once over: never recorded here, never twice. */
export interface TourGame {
  id: string
  round: number
  me: string // the circuit player
  verified: boolean // otherwise the TO enters the results
  games: Score // the games over so far: won, lost, drawn
}

export interface GameState {
  startLife: number
  players: [PlayerState, PlayerState]
  startedAt: string
  timer?: TimerState
  log?: LogEntry[] // what changed, oldest first: emptied by a new game
  extras?: Extra[] // missing in games saved before: commander damage, and poison when someone has some
  monarch?: 0 | 1 // the player who holds it
  initiative?: 0 | 1
  dungeons?: [DungeonRun, DungeonRun]
  tour?: TourGame
  art?: CardArt // the opponent's, until the result is recorded: the phone owner's is kept apart (cc.lifeArt)
}

const outside: DungeonRun = { d: 'undercity', path: [], done: 0 }
const runsOf = (g: GameState): [DungeonRun, DungeonRun] => g.dungeons ?? [outside, outside]

const extrasOf = (g: GameState): Extra[] => g.extras ?? (g.players.some((p) => p.poison) ? ['cmd', 'poison'] : ['cmd'])

/** One change to a player's life, commander damage, poison or energy (experience isn't logged); taps in a quick
 * burst on the same player add up into one entry. */
export interface LogEntry {
  p: 0 | 1
  d: PlayerState // the change
  after: PlayerState
  at: number // ms
}

const BURST_MS = 2000
const diff = (a: PlayerState, b: PlayerState): PlayerState => ({
  life: b.life - a.life,
  cmd: b.cmd - a.cmd,
  poison: b.poison - a.poison,
  energy: (b.energy ?? 0) - (a.energy ?? 0),
})
const isZero = (d: PlayerState) => !d.life && !d.cmd && !d.poison && !d.energy
const sum = (a: PlayerState, b: PlayerState): PlayerState => ({
  life: a.life + b.life,
  cmd: a.cmd + b.cmd,
  poison: a.poison + b.poison,
  energy: (a.energy ?? 0) + (b.energy ?? 0),
})

function logChange(log: LogEntry[], p: 0 | 1, before: PlayerState, after: PlayerState): LogEntry[] {
  const d = diff(before, after)
  if (isZero(d)) return log
  const last = log[log.length - 1]
  const now = Date.now()
  if (last && last.p === p && now - last.at < BURST_MS) {
    const merged = sum(last.d, d)
    // a burst that cancels itself out leaves nothing to show
    return isZero(merged) ? log.slice(0, -1) : [...log.slice(0, -1), { p, d: merged, after, at: now }]
  }
  return [...log, { p, d, after, at: now }]
}

const fresh = (startLife: number): GameState => ({
  startLife,
  players: [0, 1].map(() => ({ life: startLife, cmd: 0, poison: 0 })) as [PlayerState, PlayerState],
  startedAt: new Date().toISOString(),
  timer: freshTimer(),
  extras: ['cmd'],
})

export const GAME_KEY = 'cc.game'
export const defaultGame = () => fresh(STARTING_LIFE)

export function isGameInProgress(g: GameState) {
  return (
    g.players.some((p) => p.life !== g.startLife || p.cmd || p.poison || p.energy || p.exp) ||
    g.monarch !== undefined ||
    g.initiative !== undefined ||
    runsOf(g).some((r) => r.path.length || r.done) ||
    !!(g.timer && elapsed(g.timer) > 0)
  )
}

const isDead = (p: PlayerState) => p.life <= 0 || p.cmd >= COMMANDER_DAMAGE_LETHAL || p.poison >= POISON_LETHAL

/** Fires once on tap, then repeats while held. */
function useRepeat(fn: () => void) {
  const timer = useRef<number | undefined>(undefined)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const stop = () => {
    clearTimeout(timer.current)
    clearInterval(timer.current)
  }
  useEffect(() => stop, [])
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      fnRef.current()
      timer.current = window.setTimeout(() => {
        timer.current = window.setInterval(() => fnRef.current(), 90)
      }, 420)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

function PlayerPanel({
  idx,
  p,
  update,
  end,
  extras,
  holds,
  take,
  dungeon,
  openDungeon,
  art,
  onArt,
  onClear,
}: {
  idx: 0 | 1
  p: PlayerState
  update: (fn: (p: PlayerState) => PlayerState) => void
  end?: React.ReactNode // the game is over: shown under the life total in place of "defeated"
  extras: Extra[]
  holds: (k: 'monarch' | 'initiative') => boolean
  take: (k: 'monarch' | 'initiative') => void
  dungeon?: string // where the player is, when dungeons are on
  openDungeon: () => void
  art?: CardArt
  onArt?: () => void // the shortcut to this player's background, outside tournaments
  onClear?: () => void // back to the player's colour
}) {
  const { t } = useI18n()
  const [delta, setDelta] = useState(0)
  const deltaTimer = useRef<number | undefined>(undefined)

  const showDelta = (d: number) => {
    setDelta((x) => x + d)
    clearTimeout(deltaTimer.current)
    deltaTimer.current = window.setTimeout(() => setDelta(0), 1400)
  }
  const changeLife = (d: number) => {
    haptic()
    update((p) => ({ ...p, life: p.life + d }))
    showDelta(d)
  }
  const minus = useRepeat(() => changeLife(-1))
  const plus = useRepeat(() => changeLife(1))

  const counter = (key: 'cmd' | 'poison' | 'energy' | 'exp' | 'storm', label: string, step: number, lethal?: number) => (
    <div className={`counter ${lethal && (p[key] ?? 0) >= lethal ? 'lethal' : ''}`}>
      <button
        aria-label={`${label} -`}
        onClick={() => {
          haptic()
          // undoing commander damage gives the life back
          update((p) => ({ ...p, [key]: Math.max(0, (p[key] ?? 0) - step), ...(key === 'cmd' && p.cmd > 0 ? { life: p.life + step } : {}) }))
        }}
      >
        −
      </button>
      <div className="counter-val">
        <span className="counter-num">{p[key] ?? 0}</span>
        <span className="counter-label">{label}</span>
      </div>
      <button
        aria-label={`${label} +`}
        onClick={() => {
          haptic()
          // commander damage is also life loss
          update((p) => ({ ...p, [key]: (p[key] ?? 0) + step, ...(key === 'cmd' ? { life: p.life - step } : {}) }))
          if (key === 'cmd') showDelta(-step)
        }}
      >
        +
      </button>
    </div>
  )

  return (
    <section className={`player p${idx} ${isDead(p) ? 'dead' : ''}`}>
      {art && <div className="player-art" style={{ backgroundImage: `url("${art.art}")` }} />}
      {onArt && (
        <div className="art-btns">
          <button onClick={onArt} aria-label={t(idx ? 'life.artMine' : 'life.artOpp')}>
            <Icon name="image" size={16} /> {t('life.artBtn')}
          </button>
          {art && onClear && (
            <button className="x" onClick={onClear} aria-label={t('life.artRemove')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      )}
      <div className="life-zone">
        <button className="life-tap minus" {...minus} aria-label="-1">
          <span>−</span>
        </button>
        <div className={`life-center ${end ? 'ended' : ''}`}>
          <div className="life-num">{p.life}</div>
          <div className={`life-delta ${delta ? 'show' : ''}`}>{delta > 0 ? `+${delta}` : delta || ''}</div>
          {end ?? (isDead(p) && <div className="life-dead">{t('life.lost')}</div>)}
        </div>
        <button className="life-tap plus" {...plus} aria-label="+1">
          <span>+</span>
        </button>
      </div>
      {(['monarch', 'initiative'] as const).some((k) => extras.includes(k) || dungeon) && (
        <div className="tokens">
          {(['monarch', 'initiative'] as const)
            .filter((k) => extras.includes(k))
            .map((k) => (
              <button key={k} className={`token ${holds(k) ? 'on' : ''}`} aria-pressed={holds(k)} onClick={() => take(k)}>
                <Icon name={k === 'monarch' ? 'crown' : 'door'} size={14} /> {t(EXTRA_KEY[k])}
              </button>
            ))}
          {dungeon && (
            <button className="token dg" onClick={openDungeon}>
              <Icon name="map" size={14} /> {dungeon}
            </button>
          )}
        </div>
      )}
      {extras.includes('mana') && <ManaPool mana={p.mana} set={(mana) => update((p) => ({ ...p, mana }))} />}
      <div className="counters">
        {extras.includes('cmd') && counter('cmd', t('life.cmd'), 1, COMMANDER_DAMAGE_LETHAL)}
        {extras.includes('poison') && counter('poison', t('life.poison'), 1, POISON_LETHAL)}
        {extras.includes('energy') && counter('energy', t('life.energy'), 1)}
        {extras.includes('exp') && counter('exp', t('life.exp'), 1)}
        {extras.includes('storm') && counter('storm', t('life.storm'), 1)}
      </div>
    </section>
  )
}

/** The mana a player has floating: tap a colour to add one, its − to take one away, × empties the pool. */
function ManaPool({ mana = [], set }: { mana?: number[]; set: (m: number[] | undefined) => void }) {
  const { t } = useI18n()
  const add = (i: number, d: number) => {
    haptic()
    set(MANA.map((_, j) => Math.max(0, (mana[j] ?? 0) + (j === i ? d : 0))))
  }
  return (
    <div className="mana-pool">
      {MANA.map((c, i) => (
        // the − keeps its room when hidden, so the panel doesn't move as mana comes and goes
        <div key={c} className="mana-slot">
          <button className={`mana ${mana[i] ? 'on' : ''}`} onClick={() => add(i, 1)} aria-label={`${c} +`}>
            <Pips colors={c} size={14} />
            <b>{mana[i] ?? 0}</b>
          </button>
          <button className="mana-minus" hidden={!mana[i]} onClick={() => add(i, -1)} aria-label={`${c} −`}>
            −
          </button>
        </div>
      ))}
      <button className="mana-clear" disabled={!mana.some(Boolean)} onClick={() => set(undefined)} aria-label={t('life.manaClear')}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

function TimerPill({
  timer,
  settings,
  onToggle,
  onTurn,
}: {
  timer: TimerState
  settings: TimerSettings
  onToggle: () => void
  onTurn: (d: 1 | -1) => void
}) {
  const { t } = useI18n()
  const phase = phaseOf(timer, settings)
  const hold = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const running = !!timer.runningSince

  if (phase.kind === 'turns') {
    const over = phase.turn > phase.total
    return (
      <button
        className="timer-pill turns"
        onPointerDown={() => {
          held.current = false
          hold.current = window.setTimeout(() => {
            held.current = true
            onTurn(-1)
          }, 550)
        }}
        onPointerUp={() => {
          clearTimeout(hold.current)
          if (!held.current && !over) onTurn(1)
        }}
        onPointerLeave={() => clearTimeout(hold.current)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="timer-label">{over ? '' : t('timer.turn')}</span>
        <span className="timer-time">{over ? t('timer.over') : `${phase.turn}/${phase.total}`}</span>
      </button>
    )
  }

  return (
    <button className={`timer-pill ${running ? 'running' : 'paused'}`} onClick={onToggle}>
      <span className="timer-label">
        {running ? '' : '▶'}
        {timer.addedMs ? ` +${timer.addedMs / 60_000}′` : ''}
      </span>
      <span className="timer-time">{fmt(phase.remainingMs)}</span>
    </button>
  )
}

function Stepper({ label, value, set, min, max, step = 1 }: { label: string; value: number; set: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepper-ctrl">
        <button onClick={() => set(Math.max(min, value - step))} aria-label="-">
          −
        </button>
        <b>{value}</b>
        <button onClick={() => set(Math.min(max, value + step))} aria-label="+">
          +
        </button>
      </div>
    </div>
  )
}

type Roll = { kind: 'dice'; values: [number, number] }

export default function LifeCounter({
  decks,
  metaNames,
  players,
  settings,
  setSettings,
  onSaveMatch,
}: {
  decks: Deck[]
  metaNames: string[]
  players?: { key: string; name: string }[]
  /** timer settings: kept by the app, which syncs them with the account */
  settings: TimerSettings
  setSettings: (fn: (s: TimerSettings) => TimerSettings) => void
  onSaveMatch: (m: Match) => void
}) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  const [game, setGame] = useStoredState<GameState>(GAME_KEY, defaultGame())
  const [menu, setMenu] = useState(false)
  useBackCloses(menu, () => setMenu(false))
  const [history, setHistory] = useState(false)
  const [lookup, setLookup] = useState(false) // a card's text and rulings, without leaving the game
  useBackCloses(history, () => setHistory(false))
  const [dungeonFor, setDungeonFor] = useState<0 | 1 | null>(null)
  useBackCloses(dungeonFor !== null, () => setDungeonFor(null))
  const [recording, setRecording] = useState(false)
  const [reporting, setReporting] = useState(false) // a tournament match's result
  const [roll, setRoll] = useState<Roll | null>(null)
  const [mine, setMine] = useStoredState<CardArt | null>('cc.lifeArt', null)
  const [artFor, setArtFor] = useState<0 | 1 | null>(null)
  const [artUp, setArtUp] = useState(false) // opened from the top panel: the sheet faces that player
  useBackCloses(artFor !== null, () => setArtFor(null))
  const [banner, setBanner] = useState('')
  const [, tick] = useState(0)
  const stored = game.timer ?? freshTimer()
  // a tournament match (opened from the home) follows the live round: its clock runs on its own, with the minutes
  // the TO added to the table, and the result goes to the tournament
  const tg = game.tour
  const live = useTournament(tg?.id ?? null, tg?.me)
  const tm = tg && live.matches.find((x) => x.round === tg.round && (x.p1 === tg.me || x.p2 === tg.me))
  const flip = tm?.p2 === tg?.me
  // at a tournament table the two players' commanders; otherwise the opponent's for this game and the owner's own
  const cmdArt = (k: string | null): CardArt | undefined => {
    const c = k && live.players.find(([p]) => p === k)?.[1].commander
    return c ? { name: c, art: artUrl(c) } : undefined
  }
  const arts = tm ? [cmdArt(flip ? tm.p1 : tm.p2), cmdArt(tg!.me)] : [game.art, mine ?? undefined]
  // the opponent's background, when it's a card that can be a commander, fills in their deck when the game is recorded;
  // a commander of the meta needs no check (and works offline)
  const [oppCmd, setOppCmd] = useState<string>()
  const bg = game.art?.name
  useEffect(() => {
    setOppCmd(undefined)
    if (!bg) return
    if (metaNames.includes(bg)) return setOppCmd(bg)
    const ctrl = new AbortController()
    isCommander(bg, ctrl.signal).then((ok) => ok && setOppCmd(bg)).catch(() => {})
    return () => ctrl.abort()
  }, [bg]) // eslint-disable-line react-hooks/exhaustive-deps
  const started = tg && live.t?.round === tg.round ? live.t.started : null
  const clock = tg ? { ...settings, mainMin: ROUND_MINUTES } : settings
  const round = started && { ...stored, elapsedMs: 0, runningSince: started.toMillis(), addedMs: (tm?.extra ?? 0) * 60_000 }
  // the alarm rang with these minutes: more minutes from the TO give it back
  const timer: TimerState = round ? { ...round, alerted: stored.addedMs === round.addedMs ? stored.alerted : 'none' } : stored

  // keep the screen awake during the game (unless turned off in the account's preferences)
  useWakeLock(readPrefs().wake)

  const setTimer = (fn: (t: TimerState) => TimerState) => setGame((g) => ({ ...g, timer: fn(g.timer ?? freshTimer()) }))

  // clock: re-render while running and fire the alarms on phase changes
  useEffect(() => {
    if (!timer.runningSince) return
    const id = setInterval(() => {
      tick((n) => n + 1)
      if (phaseOf(timer, clock).kind === 'turns' && timer.alerted !== 'turns') {
        if (settings.sound) playAlarm()
        setBanner(`${t('timer.timeUp')} ${t('timer.turnsStart')}`)
        // the clock is done: freeze it at the end of the timed part
        setTimer((x) => ({
          ...x,
          elapsedMs: totalMs(clock, x),
          addedMs: timer.addedMs,
          runningSince: null,
          alerted: 'turns',
        }))
      }
    }, 250)
    return () => clearInterval(id)
  }, [timer, clock]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!banner) return
    const id = setTimeout(() => setBanner(''), 6000)
    return () => clearTimeout(id)
  }, [banner])

  const toggleTimer = () => {
    unlockAudio()
    if (tg) return // the round's clock doesn't stop
    setTimer((x) =>
      x.runningSince ? { ...x, elapsedMs: elapsed(x), runningSince: null } : { ...x, runningSince: Date.now() },
    )
  }

  const update = (i: 0 | 1) => (fn: (p: PlayerState) => PlayerState) =>
    setGame((g) => {
      const players = [...g.players] as GameState['players']
      players[i] = fn(players[i])
      return { ...g, players, log: logChange(g.log ?? [], i, g.players[i], players[i]) }
    })

  const log = game.log ?? []
  const undo = () => {
    haptic(15)
    setGame((g) => {
      const last = g.log?.[g.log.length - 1]
      if (!last) return g
      const players = [...g.players] as GameState['players']
      players[last.p] = { ...players[last.p], ...diff(last.d, players[last.p]) } // subtracts the change, experience stays
      return { ...g, players, log: g.log!.slice(0, -1) }
    })
  }

  // the counters on for this game; monarch and initiative belong to one player at a time: tapping the holder's frees it
  const extras = extrasOf(game)
  // each player's dungeon: on its own, or with the initiative, which ventures into the Undercity
  const runs = runsOf(game)
  const dungeonsOn = extras.includes('dungeon') || extras.includes('initiative')
  const where = (run: DungeonRun) => {
    const here = run.path[run.path.length - 1]
    if (here === undefined) return t('life.dungeon')
    return `${DUNGEONS[run.d].short} · ${here === lastRoom(run.d) ? t('dg.doneShort') : DUNGEONS[run.d].rooms[here].name}`
  }
  const pickArt = (i: 0 | 1, a?: CardArt) => (i ? setMine(a ?? null) : setGame((g) => ({ ...g, art: a })))
  // at a tournament table the backgrounds are the commanders: nothing to change
  const artBtns = (i: 0 | 1) =>
    tg
      ? {}
      : {
          onArt: () => {
            setArtUp(!i)
            setArtFor(i)
          },
          onClear: () => pickArt(i),
        }
  const tokens = (i: 0 | 1) => ({
    extras,
    holds: (k: 'monarch' | 'initiative') => game[k] === i,
    take: (k: 'monarch' | 'initiative') => {
      haptic()
      const taking = k === 'initiative' && game.initiative !== i
      setGame((g) => {
        const rs: [DungeonRun, DungeonRun] = [...runsOf(g)]
        // taking the initiative ventures into the Undercity, unless already in a dungeon
        if (taking && !rs[i].path.length) rs[i] = { ...rs[i], d: 'undercity' }
        return { ...g, [k]: g[k] === i ? undefined : i, dungeons: rs }
      })
      if (taking) setDungeonFor(i)
    },
    dungeon: dungeonsOn ? where(runs[i]) : undefined,
    openDungeon: () => setDungeonFor(i),
  })
  const toggleExtra = (x: Extra) => setGame((g) => {
    const on = extrasOf(g)
    return { ...g, extras: on.includes(x) ? on.filter((y) => y !== x) : EXTRAS.filter((y) => y === x || on.includes(y)) }
  })

  // a new game of a tournament match stays in the match, with its clock; otherwise it keeps the opponent's art, which
  // goes once the result is recorded (the next game is likely against someone else)
  const reset = (startLife = game.startLife, games?: Score) => {
    setGame((g) =>
      g.tour
        ? { ...fresh(startLife), timer: g.timer, tour: { ...g.tour, games: games ?? g.tour.games } }
        : { ...fresh(startLife), art: g.art },
    )
    setMenu(false)
  }

  const d20 = () => 1 + Math.floor(Math.random() * 20)
  const someoneDead = game.players.some(isDead)
  // the bottom player is assumed to be the phone's owner
  const suggested = isDead(game.players[1]) && !isDead(game.players[0]) ? 'L' : isDead(game.players[0]) && !isDead(game.players[1]) ? 'W' : undefined

  // a tournament match: the score so far, this game included once over
  const games = (tg?.games ?? [0, 0, 0]).map((v, i) => v + (someoneDead && i === (suggested === 'W' ? 0 : suggested === 'L' ? 1 : 2) ? 1 : 0)) as Score
  // a result already confirmed can't be entered again
  const canReport = !!(tg?.verified && tm && (!tm.score || unconfirmed(tm)))
  const nameOf = (k: string | null) => (k ? (live.players.find(([p]) => p === k)?.[1].name ?? k) : t('meta.bye'))

  return (
    <div className="life-root">
      <PlayerPanel idx={0} p={game.players[0]} update={update(0)} {...tokens(0)} art={arts[0]} {...artBtns(0)} />

      <div className="life-bar">
        <button className="bar-btn" onClick={() => setRoll({ kind: 'dice', values: [d20(), d20()] })} aria-label={t('life.dice')}>
          <Icon name="dice" />
        </button>
        <button className="bar-btn" onClick={undo} disabled={!log.length} aria-label={t('life.undo')}>
          <Icon name="undo" />
        </button>
        <TimerPill
          timer={timer}
          settings={clock}
          onToggle={toggleTimer}
          onTurn={(d) => setTimer((x) => ({ ...x, turn: Math.max(0, x.turn + d) }))}
        />
        <button className="bar-btn" onClick={() => setLookup(true)} aria-label={t('cards.search')}>
          <Icon name="search" />
        </button>
        <button className="bar-btn" onClick={() => setHistory(true)} aria-label={t('life.history')}>
          <Icon name="history" />
        </button>
        <button className={`bar-btn accent ${someoneDead ? 'attn' : ''}`} onClick={() => setMenu(true)} aria-label={t('game.settings')}>
          <Icon name="gear" />
        </button>
      </div>

      <PlayerPanel
        idx={1}
        p={game.players[1]}
        update={update(1)}
        {...tokens(1)}
        art={arts[1]}
        {...artBtns(1)}
        end={
          someoneDead && (
            <div className="game-end">
              <div className="game-end-title">{t(suggested === 'W' ? 'life.won' : suggested === 'L' ? 'life.youLost' : 'life.over')}</div>
              {tg ? (
                <>
                  <div className="small">{t('life.tourScore', { s: sideScore(games, false) })}</div>
                  {canReport ? (
                    <button className="btn game-end-btn" onClick={() => setReporting(true)}>
                      <Icon name="meta" size={16} /> {t('join.report')}
                    </button>
                  ) : (
                    (!tg.verified || tm?.score) && (
                      <div className="small">{tm?.score ? t('join.result', { s: sideScore(tm.score, flip) }) : t('join.toReports')}</div>
                    )
                  )}
                  <button className="game-end-skip" onClick={() => reset(game.startLife, games)}>
                    {t('life.nextGame')}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn game-end-btn" onClick={() => setRecording(true)}>
                    <Icon name="meta" size={16} /> {t('game.record')}
                  </button>
                  <button className="game-end-skip" onClick={() => reset()}>
                    {t('life.newNoRecord')}
                  </button>
                </>
              )}
            </div>
          )
        }
      />

      {banner && (
        <div className="timer-banner" onClick={() => setBanner('')}>
          <div className="p0">{banner}</div>
          <div>{banner}</div>
        </div>
      )}

      {roll && (
        <div className="roll-overlay" onClick={() => setRoll(null)}>
          <div className="roll-half p0">
            <div className="roll-big">{roll.values[0]}</div>
            <div className="roll-sub">d20</div>
          </div>
          <div className="roll-half p1">
            <div className="roll-big">{roll.values[1]}</div>
            <div className="roll-sub">d20</div>
          </div>
        </div>
      )}

      <CardLookupSheet open={lookup} onClose={() => setLookup(false)} />
      {artFor !== null && (
        <ArtSheet
          mine={artFor === 1}
          up={artUp}
          value={arts[artFor]}
          decks={decks}
          onPick={(a) => pickArt(artFor, a)}
          onClose={() => setArtFor(null)}
        />
      )}
      {dungeonFor !== null && (
        <DungeonSheet
          who={dungeonFor}
          runs={runs}
          set={(p, run) => setGame((g) => ({ ...g, dungeons: runsOf(g).map((r, i) => (i === p ? run : r)) as GameState['dungeons'] }))}
          onClose={() => setDungeonFor(null)}
        />
      )}

      {history && (
        <div className="roll-overlay dim" onClick={() => setHistory(false)}>
          <div className="reset-card history-card" onClick={(e) => e.stopPropagation()}>
            <strong>{t('life.history')}</strong>
            {!log.length ? (
              <p className="muted small no-margin">{t('life.historyEmpty')}</p>
            ) : (
              <ol className="life-log">
                {[...log].reverse().map((e, i) => (
                  <li key={log.length - i}>
                    <span className={`log-dot p${e.p}`} />
                    <span className="log-what">
                      {(['life', 'cmd', 'poison', 'energy'] as const)
                        .filter((k) => e.d[k])
                        .map((k) => {
                          const n = e.d[k]!
                          const label = t(k === 'life' ? 'life.lifeShort' : k === 'cmd' ? 'life.cmd' : EXTRA_KEY[k])
                          return `${n > 0 ? '+' : '−'}${Math.abs(n)} ${label.toLowerCase()}`
                        })
                        .join(' · ')}
                    </span>
                    <span className="log-after">
                      {e.after.life}
                      {e.after.cmd > 0 && <small> · C{e.after.cmd}</small>}
                      {e.after.poison > 0 && <small> · V{e.after.poison}</small>}
                      {(e.after.energy ?? 0) > 0 && <small> · E{e.after.energy}</small>}
                    </span>
                    <span className="muted small log-time">{new Date(e.at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="btn-pair">
              <button className="btn ghost" disabled={!log.length} onClick={undo}>
                <Icon name="undo" size={16} /> {t('life.undo')}
              </button>
              <button className="btn ghost" onClick={() => setHistory(false)}>
                {t('life.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div className="roll-overlay dim" onClick={() => setMenu(false)}>
          <div className="reset-card" onClick={(e) => e.stopPropagation()}>
            <div className="menu-head">
              <button className="icon-btn" onClick={() => setMenu(false)} aria-label={t('life.close')}>
                <Icon name="back" />
              </button>
              <strong>{t('game.settings')}</strong>
            </div>
            {tg ? (
              <>
                {tm && (
                  <p className="muted small no-margin">
                    {t('run.table', { n: tm.table })} · {t('join.against', { p: nameOf(flip ? tm.p1 : tm.p2) })} ·{' '}
                    {t('life.tourScore', { s: sideScore(games, false) })}
                  </p>
                )}
                {canReport && (
                  <button
                    className="btn primary"
                    onClick={() => {
                      setMenu(false)
                      setReporting(true)
                    }}
                  >
                    <Icon name="meta" size={16} /> {t('join.report')}
                  </button>
                )}
                <button
                  className="btn ghost"
                  onClick={() => {
                    setGame(fresh(game.startLife))
                    setMenu(false)
                  }}
                >
                  {t('life.tourLeave')}
                </button>
              </>
            ) : (
              <button
                className="btn primary"
                onClick={() => {
                  setMenu(false)
                  setRecording(true)
                }}
              >
                <Icon name="meta" size={16} /> {t('game.record')}
              </button>
            )}
            <div className="btn-split">
              <button
                className="btn ghost"
                onClick={async () => {
                  if (!isGameInProgress(game) || (await dialog.confirm(t('life.resetConfirm')))) reset()
                }}
              >
                <Icon name="refresh" size={16} /> {t('life.reset')}
              </button>
              {!tg && (
                <button className="btn ghost" onClick={() => setTimer(() => freshTimer())}>
                  <Icon name="alarm" size={16} /> {t('timer.resetTimer')}
                </button>
              )}
            </div>

            {!tg && (
              <>
                <div className="menu-section">{t('life.art')}</div>
                {([1, 0] as const).map((i) => (
                  <div key={i} className="art-row">
                    {arts[i] ? <img src={arts[i].art} alt="" /> : <span className={`p${i}`} />}
                    <span className="grow ellipsis">
                      <span className="muted small">{t(i ? 'life.artMe' : 'life.artOpponent')}</span>
                      <br />
                      {arts[i]?.name ?? t('life.artColor')}
                    </span>
                    <button
                      className="btn small ghost"
                      onClick={() => {
                        setMenu(false)
                        setArtUp(false)
                        setArtFor(i)
                      }}
                    >
                      {t('life.artChange')}
                    </button>
                  </div>
                ))}
              </>
            )}

            <div className="menu-section">{t('life.extras')}</div>
            <div className="extra-chips">
              {EXTRAS.map((x) => (
                <button key={x} className={`chip ${extras.includes(x) ? 'on' : ''}`} aria-pressed={extras.includes(x)} onClick={() => toggleExtra(x)}>
                  {t(EXTRA_KEY[x])}
                </button>
              ))}
            </div>

            {!tg && (
              <>
                <div className="menu-section">{t('timer.added')}</div>
                <Stepper
                  label={t('timer.addedHint')}
                  value={(timer.addedMs ?? 0) / 60_000}
                  min={0}
                  max={60}
                  set={(v) =>
                    setTimer((x) => {
                      const next = { ...x, addedMs: v * 60_000 }
                      // time given back after the clock ran out: back to the countdown (paused), alarm re-armed
                      return elapsed(x) < totalMs(settings, next) ? { ...next, alerted: 'none' } : next
                    })
                  }
                />
              </>
            )}

            <div className="menu-section">{t('timer.title')}</div>
            {tg ? (
              <div className="muted small">{t('life.tourClock')}</div>
            ) : (
              <>
                <Stepper label={t('timer.main')} value={settings.mainMin} min={5} max={120} step={5} set={(v) => setSettings((s) => ({ ...s, mainMin: v }))} />
                <Stepper label={t('timer.extraTurns')} value={settings.extraTurns} min={0} max={10} set={(v) => setSettings((s) => ({ ...s, extraTurns: v }))} />
              </>
            )}
            <div className="stepper">
              <span>{t('timer.sound')}</span>
              <div className="seg">
                {[true, false].map((v) => (
                  <button key={String(v)} className={settings.sound === v ? 'on' : ''} onClick={() => setSettings((s) => ({ ...s, sound: v }))}>
                    {v ? 'On' : 'Off'}
                  </button>
                ))}
              </div>
            </div>
            {!tg && <div className="muted small">{t('timer.hint')}</div>}

            <div className="menu-section">{t('life.startLife')}</div>
            <div className="seg">
              {[20, 25, 30, 40].map((v) => (
                <button key={v} className={v === game.startLife ? 'on' : ''} onClick={() => setGame((g) => ({ ...g, startLife: v }))}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="life-sheet-host">
        <RecordMatch
          open={recording}
          onClose={() => setRecording(false)}
          decks={decks}
          metaNames={metaNames}
          players={players}
          suggestedResult={suggested}
          suggestedOpponent={oppCmd}
          durationMin={Math.round(elapsed(timer) / 60_000) || undefined}
          saveLabel={t('match.saveAndReset')}
          onSave={(m) => {
            onSaveMatch(m)
            setRecording(false)
            reset()
            setGame((g) => ({ ...g, art: undefined }))
            setBanner(t('match.saved'))
          }}
        />
        {tg && (
          <ResultSheet
            id={tg.id}
            match={reporting && tm ? tm : null}
            cut={live.t?.status === 'cut'}
            nameOf={nameOf}
            me={tg.me}
            initial={flip ? [games[1], games[0], games[2]] : games}
            onClose={() => setReporting(false)}
            onSaved={() => {
              // the match is over here: it reaches the stats with the tournament's record
              setGame(fresh(game.startLife))
              setBanner(t('join.reportHint', { p: nameOf(flip ? tm!.p1 : tm!.p2) }))
            }}
          />
        )}
      </div>
    </div>
  )
}
