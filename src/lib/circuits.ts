import { useSyncExternalStore } from 'react'
import type { AppUser } from './auth'
import { fb } from './firebase'
import { readStored, writeStored } from './storage'
import { CIRCUIT_SHEET_ID, CIRCUIT_TABS, FIREBASE_CONFIG, POTY_SPOTS } from '../config'

// The circuit's leaderboard sheet of each year, kept by the admins at circuits/{year} on Firestore and read by every
// app at start (through the REST API: no need to load Firebase, nor to be signed in). The 2026 sheet in config.ts is
// the copy shipped with the app, used until a sheet for that year is published.

export interface CircuitTabs {
  leaderboard: string // gid=… in the tab's link
  s1: string
  s2: string
  events: string
}

export interface CircuitSheet {
  year: number
  sheet: string // the file id in the sheet's link
  tabs: CircuitTabs
  poty: number // players invited to the Player of the Year by ranking
}

export const TAB_KEYS: (keyof CircuitTabs)[] = ['leaderboard', 's1', 's2', 'events']
/** The year of the sheet shipped with the app: it can be replaced, not removed. */
export const BUILT_IN_YEAR = 2026
const BUILT_IN: CircuitSheet[] = [{ year: BUILT_IN_YEAR, sheet: CIRCUIT_SHEET_ID, tabs: CIRCUIT_TABS, poty: POTY_SPOTS }]
const CACHE_KEY = 'cc.circuits'
const URL_ =
  FIREBASE_CONFIG && `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/circuits?pageSize=100`

const valid = (s: unknown): s is CircuitSheet => {
  const x = s as CircuitSheet
  return !!x && Number.isInteger(x.year) && typeof x.sheet === 'string' && !!x.tabs && TAB_KEYS.every((k) => typeof x.tabs[k] === 'string') && Number.isInteger(x.poty)
}

// newest first; a published year replaces the built-in one
let sheets = merge(((l) => (Array.isArray(l) ? l.filter(valid) : []))(readStored<unknown>(CACHE_KEY, [])))
const listeners = new Set<() => void>()
function merge(published: CircuitSheet[]) {
  const byYear = new Map([...BUILT_IN, ...published].map((s) => [s.year, s]))
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}
function set(published: CircuitSheet[]) {
  writeStored(CACHE_KEY, published)
  sheets = merge(published)
  listeners.forEach((l) => l())
}

// Firestore's REST values: { stringValue }, { integerValue: "2026" }, { mapValue: { fields } }
type Value = { stringValue?: string; integerValue?: string; mapValue?: { fields?: Record<string, Value> } }
const plain = (v: Value): unknown =>
  v.stringValue ?? (v.integerValue !== undefined ? +v.integerValue : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)])) : null)

/** Reads the published sheets; offline, the last ones read stay. */
export async function loadCircuitSheets() {
  if (!URL_) return
  try {
    const res = await fetch(URL_, { cache: 'no-cache' })
    if (!res.ok) return
    const body = (await res.json()) as { documents?: { fields: Record<string, Value> }[] }
    const docs: unknown[] = (body.documents ?? []).map((d) => Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, plain(v)])))
    set(docs.filter(valid).map(({ year, sheet, tabs, poty }) => ({ year, sheet, tabs, poty })))
  } catch {
    // offline
  }
}

/** Every year's sheet, newest first: there is always at least one. */
export function useCircuitSheets() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => sheets,
  )
}

/** The file id in a Google Sheets link, or the id itself; the tab id in a tab's link (gid=…), or the number. */
export const sheetIdOf = (text: string) => text.trim().match(/\/d\/([-\w]{20,})/)?.[1] ?? text.trim().match(/^([-\w]{20,})$/)?.[1] ?? null
export const tabIdOf = (text: string) => text.trim().match(/[#&?]gid=(\d+)/)?.[1] ?? text.trim().match(/^(\d+)$/)?.[1] ?? null

export async function saveCircuitSheet(admin: AppUser, s: CircuitSheet) {
  const { db, fs } = await fb()
  await fs.setDoc(fs.doc(db, 'circuits', String(s.year)), { ...s, at: new Date().toISOString(), by: admin.uid })
  await loadCircuitSheets()
}

export async function deleteCircuitSheet(year: number) {
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'circuits', String(year)))
  await loadCircuitSheets()
}
