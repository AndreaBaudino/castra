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
import { Icon, useBackCloses } from '../components/ui'
import { RecordMatch } from '../components/RecordMatch'
import { useDialog } from '../components/Dialog'

export interface PlayerState {
  life: number
  cmd: number // commander damage received
  poison: number
}

export interface GameState {
  startLife: number
  players: [PlayerState, PlayerState]
  startedAt: string
  timer?: TimerState
  log?: LogEntry[] // what changed, oldest first: emptied by a new game
}

/** One change to a player's counters; taps in a quick burst on the same player add up into one entry. */
export interface LogEntry {
  p: 0 | 1
  d: PlayerState // the change
  after: PlayerState
  at: number // ms
}

const BURST_MS = 2000
const diff = (a: PlayerState, b: PlayerState): PlayerState => ({ life: b.life - a.life, cmd: b.cmd - a.cmd, poison: b.poison - a.poison })
const isZero = (d: PlayerState) => !d.life && !d.cmd && !d.poison
const sum = (a: PlayerState, b: PlayerState): PlayerState => ({ life: a.life + b.life, cmd: a.cmd + b.cmd, poison: a.poison + b.poison })

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
})

export const GAME_KEY = 'cc.game'
export const defaultGame = () => fresh(STARTING_LIFE)

export function isGameInProgress(g: GameState) {
  return (
    g.players.some((p) => p.life !== g.startLife || p.cmd || p.poison) || !!(g.timer && elapsed(g.timer) > 0)
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
}: {
  idx: 0 | 1
  p: PlayerState
  update: (fn: (p: PlayerState) => PlayerState) => void
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

  const counter = (key: 'cmd' | 'poison', label: string, step: number, lethal?: number) => (
    <div className={`counter ${lethal && p[key] >= lethal ? 'lethal' : ''}`}>
      <button
        aria-label={`${label} -`}
        onClick={() => {
          haptic()
          // undoing commander damage gives the life back
          update((p) => ({ ...p, [key]: Math.max(0, p[key] - step), ...(key === 'cmd' && p.cmd > 0 ? { life: p.life + step } : {}) }))
        }}
      >
        −
      </button>
      <div className="counter-val">
        <span className="counter-num">{p[key]}</span>
        <span className="counter-label">{label}</span>
      </div>
      <button
        aria-label={`${label} +`}
        onClick={() => {
          haptic()
          // commander damage is also life loss
          update((p) => ({ ...p, [key]: p[key] + step, ...(key === 'cmd' ? { life: p.life - step } : {}) }))
          if (key === 'cmd') showDelta(-step)
        }}
      >
        +
      </button>
    </div>
  )

  return (
    <section className={`player p${idx} ${isDead(p) ? 'dead' : ''}`}>
      <div className="life-zone">
        <button className="life-tap minus" {...minus} aria-label="-1">
          <span>−</span>
        </button>
        <div className="life-center">
          <div className="life-num">{p.life}</div>
          <div className={`life-delta ${delta ? 'show' : ''}`}>{delta > 0 ? `+${delta}` : delta || ''}</div>
          {isDead(p) && <div className="life-dead">{t('life.lost')}</div>}
        </div>
        <button className="life-tap plus" {...plus} aria-label="+1">
          <span>+</span>
        </button>
      </div>
      <div className="counters">
        {counter('cmd', t('life.cmd'), 1, COMMANDER_DAMAGE_LETHAL)}
        {counter('poison', t('life.poison'), 1, POISON_LETHAL)}
      </div>
    </section>
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
  useBackCloses(history, () => setHistory(false))
  const [recording, setRecording] = useState(false)
  const [roll, setRoll] = useState<Roll | null>(null)
  const [banner, setBanner] = useState('')
  const [, tick] = useState(0)
  const timer = game.timer ?? freshTimer()

  // keep the screen awake during the game (unless turned off in the account's preferences)
  useEffect(() => {
    if (!readPrefs().wake) return
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
      } catch {
        /* not supported or denied */
      }
    }
    acquire()
    const onVis = () => document.visibilityState === 'visible' && acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [])

  const setTimer = (fn: (t: TimerState) => TimerState) => setGame((g) => ({ ...g, timer: fn(g.timer ?? freshTimer()) }))

  // clock: re-render while running and fire the alarms on phase changes
  useEffect(() => {
    if (!timer.runningSince) return
    const id = setInterval(() => {
      tick((n) => n + 1)
      if (phaseOf(timer, settings).kind === 'turns' && timer.alerted !== 'turns') {
        if (settings.sound) playAlarm()
        setBanner(`${t('timer.timeUp')} ${t('timer.turnsStart')}`)
        // the clock is done: freeze it at the end of the timed part
        setTimer((x) => ({
          ...x,
          elapsedMs: totalMs(settings, x),
          runningSince: null,
          alerted: 'turns',
        }))
      }
    }, 250)
    return () => clearInterval(id)
  }, [timer, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!banner) return
    const id = setTimeout(() => setBanner(''), 6000)
    return () => clearTimeout(id)
  }, [banner])

  const toggleTimer = () => {
    unlockAudio()
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
      players[last.p] = diff(last.d, players[last.p]) // subtracts the change
      return { ...g, players, log: g.log!.slice(0, -1) }
    })
  }

  const reset = (startLife = game.startLife) => {
    setGame(fresh(startLife))
    setMenu(false)
  }

  const d20 = () => 1 + Math.floor(Math.random() * 20)
  const someoneDead = game.players.some(isDead)
  // the bottom player is assumed to be the phone's owner
  const suggested = isDead(game.players[1]) && !isDead(game.players[0]) ? 'L' : isDead(game.players[0]) && !isDead(game.players[1]) ? 'W' : undefined

  return (
    <div className="life-root">
      <PlayerPanel idx={0} p={game.players[0]} update={update(0)} />

      <div className="life-bar">
        <button className="bar-btn" onClick={() => setRoll({ kind: 'dice', values: [d20(), d20()] })} aria-label={t('life.dice')}>
          <Icon name="dice" />
        </button>
        <button className="bar-btn" onClick={undo} disabled={!log.length} aria-label={t('life.undo')}>
          <Icon name="undo" />
        </button>
        <TimerPill
          timer={timer}
          settings={settings}
          onToggle={toggleTimer}
          onTurn={(d) => setTimer((x) => ({ ...x, turn: Math.max(0, x.turn + d) }))}
        />
        <button className="bar-btn" onClick={() => setHistory(true)} aria-label={t('life.history')}>
          <Icon name="history" />
        </button>
        <button className={`bar-btn accent ${someoneDead ? 'attn' : ''}`} onClick={() => setMenu(true)} aria-label={t('game.settings')}>
          <Icon name="gear" />
        </button>
      </div>

      <PlayerPanel idx={1} p={game.players[1]} update={update(1)} />

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
                      {(['life', 'cmd', 'poison'] as const)
                        .filter((k) => e.d[k])
                        .map((k) => `${e.d[k] > 0 ? '+' : '−'}${Math.abs(e.d[k])} ${t(k === 'life' ? 'life.lifeShort' : k === 'cmd' ? 'life.cmd' : 'life.poison').toLowerCase()}`)
                        .join(' · ')}
                    </span>
                    <span className="log-after">
                      {e.after.life}
                      {e.after.cmd > 0 && <small> · C{e.after.cmd}</small>}
                      {e.after.poison > 0 && <small> · V{e.after.poison}</small>}
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
            <strong>{t('game.settings')}</strong>
            <button
              className="btn primary"
              onClick={() => {
                setMenu(false)
                setRecording(true)
              }}
            >
              <Icon name="meta" size={16} /> {t('game.record')}
            </button>

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

            <div className="menu-section">{t('timer.title')}</div>
            <Stepper label={t('timer.main')} value={settings.mainMin} min={5} max={120} step={5} set={(v) => setSettings((s) => ({ ...s, mainMin: v }))} />
            <Stepper label={t('timer.extraTurns')} value={settings.extraTurns} min={0} max={10} set={(v) => setSettings((s) => ({ ...s, extraTurns: v }))} />
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
            <div className="muted small">{t('timer.hint')}</div>
            <button className="btn ghost" onClick={() => setTimer(() => freshTimer())}>
              {t('timer.resetTimer')}
            </button>

            <div className="menu-section">{t('life.startLife')}</div>
            <div className="seg">
              {[20, 25, 30, 40].map((v) => (
                <button key={v} className={v === game.startLife ? 'on' : ''} onClick={() => setGame((g) => ({ ...g, startLife: v }))}>
                  {v}
                </button>
              ))}
            </div>
            <button
              className="btn ghost"
              onClick={async () => {
                if (!isGameInProgress(game) || (await dialog.confirm(t('life.resetConfirm')))) reset()
              }}
            >
              <Icon name="refresh" size={16} /> {t('life.reset')} · {game.startLife}
            </button>
            <button className="btn ghost" onClick={() => setMenu(false)}>
              {t('life.close')}
            </button>
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
          durationMin={Math.round(elapsed(timer) / 60_000) || undefined}
          saveLabel={t('match.saveAndReset')}
          onSave={(m) => {
            onSaveMatch(m)
            setRecording(false)
            reset()
            setBanner(t('match.saved'))
          }}
        />
      </div>
    </div>
  )
}
