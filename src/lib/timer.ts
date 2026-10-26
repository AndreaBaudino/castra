export interface TimerSettings {
  mainMin: number
  extraTurns: number
  sound: boolean
}

export interface TimerState {
  elapsedMs: number // accumulated while paused
  runningSince: number | null // epoch ms, null when paused
  turn: number // extra turns already started (0 = none yet)
  addedMs?: number // time added during the game (e.g. after a judge call)
  alerted: 'none' | 'turns'
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = { mainMin: 50, extraTurns: 5, sound: true }
export const freshTimer = (): TimerState => ({ elapsedMs: 0, runningSince: null, turn: 0, alerted: 'none' })

export const elapsed = (t: TimerState, now = Date.now()) => t.elapsedMs + (t.runningSince ? now - t.runningSince : 0)

export type Phase = { kind: 'main'; remainingMs: number } | { kind: 'turns'; turn: number; total: number }

/** Time added mid-game simply lengthens the round: one countdown of duration + added, then the extra turns. */
export const totalMs = (s: TimerSettings, t: TimerState) => s.mainMin * 60_000 + (t.addedMs ?? 0)

export function phaseOf(t: TimerState, s: TimerSettings, now = Date.now()): Phase {
  const e = elapsed(t, now)
  if (e < totalMs(s, t)) return { kind: 'main', remainingMs: totalMs(s, t) - e }
  return { kind: 'turns', turn: t.turn, total: s.extraTurns }
}

export function fmt(ms: number) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
