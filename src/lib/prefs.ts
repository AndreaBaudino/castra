import { readStored } from './storage'

// The user's settings from the account page, synced with the account like the theme.

export interface Prefs {
  format: 'last' | 'bo1' | 'bo3' // what a new match starts with: the last one used, or always the same
  kind: 'last' | 'casual' | 'tournament'
  wake: boolean // keep the screen on during a game
  haptics: boolean // short vibration on the life counter's buttons
  circuitAlerts: boolean // the "you moved up/down" card
}

export const PREFS_KEY = 'cc.prefs'
export const DEFAULT_PREFS: Prefs = { format: 'last', kind: 'last', wake: true, haptics: true, circuitAlerts: true }

/** Saved prefs over the defaults, so settings added later get their default value. */
export const readPrefs = (): Prefs => ({ ...DEFAULT_PREFS, ...readStored<Partial<Prefs>>(PREFS_KEY, {}) })

export function haptic(ms = 8) {
  if (readPrefs().haptics) navigator.vibrate?.(ms)
}
