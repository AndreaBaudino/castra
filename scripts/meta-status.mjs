// Prints the nightly update's report, published as status.json on the meta-data branch and shown in the app's admin
// area: when it ran, whether the meta was rebuilt, the sheets that couldn't be downloaded, what each sheet gave and
// the build's warnings, and the banlist read from the format's site with what changed since the last one. BUILT and
// BANLIST are the outcomes of the build and banlist steps ("success" when meta.json, banlist.json were rebuilt).

import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (name) => {
  const url = new URL(`.meta-cache/${name}`, root)
  try {
    return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : null
  } catch {
    return null
  }
}
const fetched = read('fetch.json')
const built = read('report.json')
const ok = process.env.BUILT === 'success'

// the banlist: what it says, what changed since the one published before, or why it couldn't be read
const banlistOk = process.env.BANLIST === 'success'
const banlist = banlistOk ? read('banlist.json') : null
const previous = read('banlist-prev.json')
const LISTS = ['banned', 'commander', 'partner']
const diff = (a, b) => Object.fromEntries(LISTS.map((k) => [k, (a?.[k] ?? []).filter((n) => !(b?.[k] ?? []).includes(n))]))
let banlistError = null
if (!banlistOk) {
  try {
    banlistError = readFileSync(new URL('.meta-cache/banlist.err', root), 'utf8').trim().split('\n').filter(Boolean).pop() ?? null
  } catch {
    // the step didn't run
  }
  banlistError ??= 'banlist non letta'
}

const error = ok
  ? null
  : (fetched?.error ??
    (fetched?.failed?.length
      ? `fogli non scaricati: ${fetched.failed.length}`
      : !fetched
        ? 'download dei fogli non eseguito'
        : 'costruzione del meta non riuscita'))

console.log(
  JSON.stringify({
    at: new Date().toISOString(),
    ok,
    error,
    origin: fetched?.origin ?? null,
    sources: fetched?.sources ?? null,
    failed: fetched?.failed ?? [],
    read: ok ? (built?.read ?? {}) : {},
    years: ok ? (built?.years ?? []) : [],
    warnings: ok ? (built?.warnings ?? []) : [],
    banlist: {
      ok: banlistOk,
      error: banlistError,
      announcement: (banlist ?? previous)?.announcement ?? null,
      counts: banlist && Object.fromEntries(LISTS.map((k) => [k, banlist[k].length])),
      // compared with the one published before; nothing the first time
      added: banlist && previous ? diff(banlist, previous) : null,
      removed: banlist && previous ? diff(previous, banlist) : null,
      previous: !banlistOk ? (previous?.checked ?? null) : null, // the one the app keeps using
    },
  }),
)
