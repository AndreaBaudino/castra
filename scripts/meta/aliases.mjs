// The name corrections applied while reading the tournament sheets: "where the sheet says X, it means Y". Kept from
// the app's admin area on Firestore (aliases/{id}), or scripts/meta/aliases.json while that collection is still empty
// (before the first import). The sheets are never changed: a correction whose name no sheet writes any more (fixed at
// the source) just stops being used.
//
// A correction holds for every sheet of every year, unless it is limited to a year or to one sheet (a player's name
// that, elsewhere, may be someone else's). The most specific one wins: the sheet's, then the year's, then the general.
// Corrections apply once: Y is never corrected in turn.

import { readFileSync } from 'node:fs'
import { firestoreDocs } from './firestore.mjs'

/** The key a name is looked up by: as the app's admin area writes it. */
export const commanderKey = (name) => name.replace(/\s+/g, ' ').trim().toLowerCase()
export const playerKey = (name) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

function fromFile() {
  const file = JSON.parse(readFileSync(new URL('aliases.json', import.meta.url), 'utf8'))
  return [
    ...Object.entries(file.commanders).map(([key, to]) => ({ id: `file:commander:${key}`, kind: 'commander', key, to })),
    ...Object.entries(file.players).map(([key, to]) => ({ id: `file:player:${key}`, kind: 'player', key, to })),
  ]
}

export async function loadAliases() {
  let docs
  try {
    docs = await firestoreDocs('aliases')
  } catch (e) {
    // no rules for the collection yet: corrections still come from the file
    if (e.status === 403) return { origin: 'file', list: fromFile() }
    throw new Error(`${e.message}: correzioni non lette`)
  }
  if (!docs.length) return { origin: 'file', list: fromFile() }
  const list = docs.map((d) => Object.fromEntries(['id', 'kind', 'key', 'to', 'year', 'drive'].filter((k) => d[k] != null).map((k) => [k, d[k]])))
  return { origin: 'firestore', list: list.filter((a) => (a.kind === 'commander' || a.kind === 'player') && a.key && a.to) }
}

/** Finds the correction for a name in a sheet: `ctx` is { year, drive }. */
export function aliasLookup(list) {
  const by = new Map()
  for (const a of list) {
    const k = `${a.kind}|${a.key}`
    by.set(k, [...(by.get(k) ?? []), a])
  }
  return (kind, key, ctx) => {
    const found = by.get(`${kind}|${key}`)
    if (!found) return null
    return found.find((a) => a.drive && a.drive === ctx.drive) ?? found.find((a) => a.year && a.year === ctx.year) ?? found.find((a) => !a.drive && !a.year) ?? null
  }
}
