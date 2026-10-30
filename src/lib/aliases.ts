import { useMemo } from 'react'
import type { AppUser } from './auth'
import { playerKey } from './circuit'
import { fb, useLiveCollection } from './firebase'

// The name corrections applied by the nightly meta update while reading the tournament sheets (scripts/meta/aliases.mjs):
// "where the sheet says X, it means Y". Kept by the admins at aliases/{id}; until that collection is filled the update
// reads scripts/meta/aliases.json, which the admin area imports once. The sheets are never changed.

export type AliasKind = 'commander' | 'player'

export interface Alias {
  id: string
  kind: AliasKind
  key: string // `from`, as the update looks it up
  from: string // as written in the sheet
  to: string // commanders: the Scryfall name; players: the name in the circuit leaderboard
  year?: number // only in that year's sheets
  drive?: string // only in that sheet
  at?: string
}

export const commanderKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase()
export const aliasKey = (kind: AliasKind, name: string) => (kind === 'player' ? playerKey(name) : commanderKey(name))
/** A player's name corrected to itself: confirmed, though not in the circuit leaderboard. */
export const isConfirm = (a: Alias) => aliasKey(a.kind, a.to) === a.key

export function useAliases() {
  const { docs, loaded } = useLiveCollection<Omit<Alias, 'id'>>('aliases')
  return { aliases: useMemo(() => docs.map(([id, a]): Alias => ({ ...a, id })), [docs]), loaded }
}

const sameScope = (a: Pick<Alias, 'year' | 'drive'>, b: Pick<Alias, 'year' | 'drive'>) => (a.year ?? 0) === (b.year ?? 0) && (a.drive ?? '') === (b.drive ?? '')

/**
 * Why a correction can't be saved, as an i18n key with its values, or null. Corrections apply once, so none may
 * point to a name another one corrects, or correct a name another one points to; and one name has one correction per
 * scope.
 */
export function aliasProblem(a: Omit<Alias, 'id'> & { id?: string }, all: Alias[]): [string, Record<string, string>] | null {
  const others = all.filter((x) => x.kind === a.kind && x.id !== a.id)
  const twin = others.find((x) => x.key === a.key && sameScope(x, a))
  if (twin) return ['aliases.err.twin', { to: twin.to }]
  if (aliasKey(a.kind, a.to) !== a.key) {
    const next = others.find((x) => x.key === aliasKey(a.kind, a.to) && !isConfirm(x))
    if (next) return ['aliases.err.chainTo', { to: a.to, next: next.to }]
  }
  const before = others.find((x) => aliasKey(x.kind, x.to) === a.key && !isConfirm(x))
  if (before) return ['aliases.err.chainFrom', { from: before.from, to: a.from }]
  return null
}

export async function saveAlias(admin: AppUser, a: Omit<Alias, 'id' | 'key'> & { id?: string }) {
  const { db, fs } = await fb()
  const ref = a.id ? fs.doc(db, 'aliases', a.id) : fs.doc(fs.collection(db, 'aliases'))
  const data: Record<string, unknown> = { kind: a.kind, key: aliasKey(a.kind, a.from), from: a.from.trim(), to: a.to.trim(), at: new Date().toISOString(), by: admin.uid }
  if (a.year) data.year = a.year
  if (a.drive) data.drive = a.drive
  await fs.setDoc(ref, data)
}

export async function deleteAlias(id: string) {
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'aliases', id))
}

const REPO_ALIASES_URL = 'https://raw.githubusercontent.com/AndreaBaudino/castra/main/scripts/meta/aliases.json'

/** Copies the corrections in the repository (scripts/meta/aliases.json) to Firestore, where the admins keep them. */
export async function importRepoAliases(admin: AppUser) {
  const res = await fetch(REPO_ALIASES_URL, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const file = (await res.json()) as Record<'commanders' | 'players', Record<string, string>>
  const list: [AliasKind, string, string][] = [
    ...Object.entries(file.commanders).map(([k, v]): [AliasKind, string, string] => ['commander', k, v]),
    ...Object.entries(file.players).map(([k, v]): [AliasKind, string, string] => ['player', k, v]),
  ]
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  const at = new Date().toISOString()
  for (const [kind, from, to] of list) batch.set(fs.doc(fs.collection(db, 'aliases')), { kind, key: aliasKey(kind, from), from, to, at, by: admin.uid })
  await batch.commit()
  return list.length
}

/** The Scryfall name of a card, or null when Scryfall doesn't know it. */
export async function scryfallName(name: string) {
  const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name.trim())}`)
  if (!res.ok) return null
  return ((await res.json()) as { name: string }).name
}

/** Card names starting like `q`, from Scryfall: suggestions while typing a commander. */
export async function cardSuggestions(q: string, signal: AbortSignal) {
  if (q.trim().length < 2) return []
  const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q.trim())}`, { signal })
  return res.ok ? ((await res.json()) as { data: string[] }).data.slice(0, 10) : []
}

/** The closest names to `name` among `names` (players in the circuit leaderboard), for a correction to start from. */
export function closest(name: string, names: string[], n = 5) {
  const k = playerKey(name)
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]
      d[0] = i
      for (let j = 1; j <= b.length; j++) {
        const cur = d[j]
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
        prev = cur
      }
    }
    return d[b.length]
  }
  return names
    .map((x) => ({ x, d: dist(k, playerKey(x)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .filter((c) => c.d <= Math.max(3, k.length / 3))
    .map((c) => c.x)
}
