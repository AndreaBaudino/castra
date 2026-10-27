import type { Deck } from './decks'
import type { Match } from './matches'
import { resultLabel } from './matches'

// Getting the user's data out of the app (and back in): matches as a spreadsheet, everything as a backup file.

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

/** Semicolon-separated with a BOM: what Excel opens correctly with Italian settings; Google Sheets detects it. */
export function matchesCsv(matches: Match[], deckNames: Map<string, string>, lang: 'it' | 'en') {
  const cell = (v: string | number | undefined) => {
    const s = v == null ? '' : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const it = lang === 'it'
  const head = it
    ? ['data', 'formato', 'risultato', 'punteggio', 'game', 'mazzo', 'avversario', 'tipo', 'minuti', 'note']
    : ['date', 'format', 'result', 'score', 'games', 'deck', 'opponent', 'kind', 'minutes', 'notes']
  const kinds = { tournament: it ? 'torneo' : 'tournament', casual: it ? 'amichevole' : 'casual' }
  // local time, as a spreadsheet reads it
  const when = (iso: string) => {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const rows = [...matches]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) =>
      [
        when(m.date),
        m.format ?? 'bo1',
        m.result,
        m.format === 'bo3' ? resultLabel(m) : '',
        m.games?.join('') ?? '',
        (m.deckId && deckNames.get(m.deckId)) || m.deckName,
        m.opponent,
        kinds[m.kind] ?? m.kind,
        m.durationMin,
        m.notes,
      ]
        .map(cell)
        .join(';'),
    )
  return '﻿' + [head.join(';'), ...rows].join('\r\n')
}

export const csvName = () => `castra-partite-${stamp()}.csv`
export const backupName = () => `castra-backup-${stamp()}.json`

export interface Backup {
  app: 'castra'
  version: 1
  exportedAt: string
  decks: Deck[]
  matches: Match[]
  settings: Record<string, unknown> // localStorage values by key: theme, prefs, timer, followed players
}

export const BACKUP_SETTINGS = ['cc.theme', 'cc.prefs', 'cc.timerSettings', 'cc.circuit.follow', 'cc.lang']

export function makeBackup(decks: Deck[], matches: Match[]): Backup {
  const settings: Record<string, unknown> = {}
  for (const k of BACKUP_SETTINGS) {
    try {
      const raw = localStorage.getItem(k)
      if (raw != null) settings[k] = JSON.parse(raw)
    } catch {
      // unreadable: left out
    }
  }
  return { app: 'castra', version: 1, exportedAt: new Date().toISOString(), decks, matches, settings }
}

/** The backup in a file, or null if it isn't one of ours. */
export function parseBackup(text: string): Backup | null {
  try {
    const b = JSON.parse(text) as Backup
    if (b?.app !== 'castra' || !Array.isArray(b.decks) || !Array.isArray(b.matches)) return null
    const ok = (x: unknown) => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string'
    return { ...b, decks: b.decks.filter(ok), matches: b.matches.filter(ok), settings: b.settings ?? {} }
  } catch {
    return null
  }
}

/** Adds the backup's items to the current ones; an item with the same id is replaced by the backup's. */
export function mergeById<T extends { id: string }>(current: T[], restored: T[]) {
  const byId = new Map(current.map((x) => [x.id, x]))
  for (const x of restored) byId.set(x.id, x)
  return [...byId.values()]
}
