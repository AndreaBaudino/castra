// Reads a Firestore collection through the REST API, without signing in: the rules make the ones read here public.

import { readFileSync } from 'node:fs'

const config = readFileSync(new URL('../../src/config.ts', import.meta.url), 'utf8')
const API = `https://firestore.googleapis.com/v1/projects/${config.match(/projectId: '([^']+)'/)[1]}/databases/(default)/documents`

// Firestore's REST values ({ stringValue: … }, { integerValue: "2026" }, { mapValue: { fields } }…) as plain ones
const plain = (v) =>
  'stringValue' in v
    ? v.stringValue
    : 'integerValue' in v
      ? +v.integerValue
      : 'doubleValue' in v
        ? v.doubleValue
        : 'mapValue' in v
          ? fields(v.mapValue)
          : null
const fields = (d) => Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, plain(v)]))

/** Every document of the collection as { id, ...fields }; fails with the HTTP status (`status`) when it can't be read. */
export async function firestoreDocs(collection) {
  const docs = []
  let page = ''
  do {
    const res = await fetch(`${API}/${collection}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`)
    if (!res.ok) throw Object.assign(new Error(`Firestore ${res.status}`), { status: res.status })
    const body = await res.json()
    docs.push(...(body.documents ?? []))
    page = body.nextPageToken ?? ''
  } while (page)
  return docs.map((d) => ({ id: d.name.split('/').pop(), ...fields(d) }))
}
