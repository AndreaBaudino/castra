// The list of tournament sheets read by the nightly update: the `sources` collection on Firestore, kept from the
// app's admin area, or scripts/meta/sources.json while that collection is still empty (before the first import).
// Fails when Firestore can't be read, so the update never runs on an old list.

import { readFileSync } from 'node:fs'
import { firestoreDocs } from './firestore.mjs'

const FIELDS = ['drive', 'kind', 'name', 'date', 'circuit', 'year', 'season', 'league', 'venue']

export async function loadSources() {
  const docs = await firestoreDocs('sources').catch((e) => {
    throw new Error(`${e.message}: elenco dei fogli non letto`)
  })
  if (!docs.length) return { origin: 'file', tournaments: JSON.parse(readFileSync(new URL('sources.json', import.meta.url), 'utf8')).tournaments }
  const tournaments = docs.map((d) => Object.fromEntries(FIELDS.filter((k) => d[k] != null && d[k] !== '').map((k) => [k, d[k]])))
  // the same order as the file: events by date, then leagues
  tournaments.sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || (a.year ?? 0) - (b.year ?? 0) || `${a.season}${a.league}`.localeCompare(`${b.season}${b.league}`))
  return { origin: 'firestore', tournaments }
}
