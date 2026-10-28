// Downloads the tournament sheets listed in scripts/meta/sources.json into .meta-cache/<drive id>.xlsx,
// through the Apps Script web app in scripts/meta/apps-script (the sheets are private).
// Needs META_SCRIPT_URL (the web app's /exec link) and META_SCRIPT_KEY. Fails if any sheet can't be read,
// so the nightly update never publishes a meta with tournaments missing.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const { META_SCRIPT_URL: url, META_SCRIPT_KEY: key } = process.env
if (!url || !key) {
  console.error('Servono META_SCRIPT_URL e META_SCRIPT_KEY')
  process.exit(1)
}

const sources = JSON.parse(readFileSync(new URL('scripts/meta/sources.json', root), 'utf8'))
const ids = [...new Set(sources.tournaments.map((t) => t.drive))]
mkdirSync(new URL('.meta-cache/', root), { recursive: true })

async function download(id) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}`)
      const body = (await res.text()).trim()
      if (!res.ok || body.startsWith('error')) throw new Error(body.startsWith('error') ? body.slice(7) : `HTTP ${res.status}`)
      const bytes = Buffer.from(body, 'base64')
      if (bytes.subarray(0, 2).toString() !== 'PK') throw new Error('risposta non è un file .xlsx')
      writeFileSync(new URL(`.meta-cache/${id}.xlsx`, root), bytes)
      return
    } catch (e) {
      if (attempt === 3) throw new Error(`${id}: ${e.message}`)
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
}

// a few at a time: Apps Script limits concurrent executions
const failed = []
for (let i = 0; i < ids.length; i += 4) {
  const batch = await Promise.allSettled(ids.slice(i, i + 4).map(download))
  for (const r of batch) if (r.status === 'rejected') failed.push(r.reason.message)
}
console.log(`${ids.length - failed.length}/${ids.length} fogli scaricati`)
if (failed.length) {
  console.error(failed.join('\n'))
  process.exit(1)
}
