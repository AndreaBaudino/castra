// Downloads the tournament sheets (the list from scripts/meta/sources.mjs: Firestore, or sources.json) into
// .meta-cache/<drive id>.xlsx, through the Apps Script web app in scripts/meta/apps-script (the sheets are private).
// Needs META_SCRIPT_URL (the web app's /exec link) and META_SCRIPT_KEY. Fails if any sheet can't be read,
// so the nightly update never publishes a meta with tournaments missing.
// Leaves the list it used in .meta-cache/sources.json (for build-meta.mjs) and what went wrong in
// .meta-cache/fetch.json (for the update's report, scripts/meta-status.mjs).

import { mkdirSync, writeFileSync } from 'node:fs'
import { loadSources } from './meta/sources.mjs'

const root = new URL('../', import.meta.url)
const cache = (name) => new URL(`.meta-cache/${name}`, root)
mkdirSync(cache(''), { recursive: true })
const report = (r) => writeFileSync(cache('fetch.json'), JSON.stringify(r))

const { META_SCRIPT_URL: url, META_SCRIPT_KEY: key } = process.env
if (!url || !key) {
  console.error('Servono META_SCRIPT_URL e META_SCRIPT_KEY')
  report({ error: 'mancano META_SCRIPT_URL e META_SCRIPT_KEY' })
  process.exit(1)
}

let sources
try {
  sources = await loadSources()
} catch (e) {
  console.error(e.message)
  report({ error: e.message })
  process.exit(1)
}
writeFileSync(cache('sources.json'), JSON.stringify({ tournaments: sources.tournaments }, null, 1))
const ids = [...new Set(sources.tournaments.map((t) => t.drive))]

async function download(id) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}`)
      const body = (await res.text()).trim()
      if (!res.ok || body.startsWith('error')) throw new Error(body.startsWith('error') ? body.slice(7) : `HTTP ${res.status}`)
      const bytes = Buffer.from(body, 'base64')
      if (bytes.subarray(0, 2).toString() !== 'PK') throw new Error('risposta non è un file .xlsx')
      writeFileSync(cache(`${id}.xlsx`), bytes)
      return
    } catch (e) {
      if (attempt === 3) throw Object.assign(new Error(e.message), { drive: id })
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
}

// a few at a time: Apps Script limits concurrent executions
const failed = []
for (let i = 0; i < ids.length; i += 4) {
  const batch = await Promise.allSettled(ids.slice(i, i + 4).map(download))
  for (const r of batch) if (r.status === 'rejected') failed.push({ drive: r.reason.drive, error: r.reason.message })
}
console.log(`${ids.length - failed.length}/${ids.length} fogli scaricati (elenco da ${sources.origin === 'firestore' ? 'Firestore' : 'sources.json'})`)
report({ origin: sources.origin, sources: ids.length, failed })
if (failed.length) {
  console.error(failed.map((f) => `${f.drive}: ${f.error}`).join('\n'))
  process.exit(1)
}
