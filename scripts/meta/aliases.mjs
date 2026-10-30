// The name corrections applied while reading the tournament sheets: "where the sheet says X, it means Y". Kept from
// the app's admin area on Firestore (aliases/{id}), or scripts/meta/aliases.json while that collection is still empty
// (before the first import). The sheets are never changed: a correction whose name no sheet writes any more (fixed at
// the source) just stops being used.
//
// A correction holds for every sheet of every year, unless it is limited to a year or to one sheet (a player's name
// that, elsewhere, may be someone else's). The most specific one wins: the sheet's, then the year's, then the general.
// Corrections apply once: Y is never corrected in turn.

import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const config = readFileSync(new URL('src/config.ts', root), 'utf8')
const project = config.match(/projectId: '([^']+)'/)[1]
const API = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/aliases`

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

const plain = (v) => ('stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : null)

function fromFile() {
  const file = JSON.parse(readFileSync(new URL('scripts/meta/aliases.json', root), 'utf8'))
  return [
    ...Object.entries(file.commanders).map(([key, to]) => ({ id: `file:commander:${key}`, kind: 'commander', key, to })),
    ...Object.entries(file.players).map(([key, to]) => ({ id: `file:player:${key}`, kind: 'player', key, to })),
  ]
}

export async function loadAliases() {
  const docs = []
  let page = ''
  do {
    const res = await fetch(`${API}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`)
    // no rules for the collection yet: corrections still come from the file
    if (res.status === 403 && !docs.length) return { origin: 'file', list: fromFile() }
    if (!res.ok) throw new Error(`Firestore ${res.status}: correzioni non lette`)
    const body = await res.json()
    docs.push(...(body.documents ?? []))
    page = body.nextPageToken ?? ''
  } while (page)
  if (!docs.length) return { origin: 'file', list: fromFile() }
  const list = docs.map((d) => {
    const a = { id: d.name.split('/').pop() }
    for (const k of ['kind', 'key', 'to', 'year', 'drive']) if (d.fields[k]) a[k] = plain(d.fields[k])
    return a
  })
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
