// The list of tournament sheets read by the nightly update: the `sources` collection on Firestore, kept from the
// app's admin area, or scripts/meta/sources.json while that collection is still empty (before the first import).
// Fails when Firestore can't be read, so the update never runs on an old list.

import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const config = readFileSync(new URL('src/config.ts', root), 'utf8')
const project = config.match(/projectId: '([^']+)'/)[1]
const API = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/sources`

// Firestore's REST values ({ stringValue: … }, { integerValue: "2026" }…) as plain ones
const plain = (v) => ('stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : 'doubleValue' in v ? v.doubleValue : null)

const FIELDS = ['drive', 'kind', 'name', 'date', 'circuit', 'year', 'season', 'league', 'venue']

export async function loadSources() {
  const docs = []
  let page = ''
  do {
    const res = await fetch(`${API}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`)
    if (!res.ok) throw new Error(`Firestore ${res.status}: elenco dei fogli non letto`)
    const body = await res.json()
    docs.push(...(body.documents ?? []))
    page = body.nextPageToken ?? ''
  } while (page)

  if (!docs.length) return { origin: 'file', tournaments: JSON.parse(readFileSync(new URL('scripts/meta/sources.json', root), 'utf8')).tournaments }
  const tournaments = docs.map((d) => {
    const t = {}
    for (const k of FIELDS) {
      const v = d.fields?.[k] && plain(d.fields[k])
      if (v != null && v !== '') t[k] = v
    }
    return t
  })
  // the same order as the file: events by date, then leagues
  tournaments.sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || (a.year ?? 0) - (b.year ?? 0) || `${a.season}${a.league}`.localeCompare(`${b.season}${b.league}`))
  return { origin: 'firestore', tournaments }
}
