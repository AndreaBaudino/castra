// Prints the nightly update's report, published as status.json on the meta-data branch and shown in the app's admin
// area: when it ran, whether the meta was rebuilt, the sheets that couldn't be downloaded, what each sheet gave and
// the build's warnings. BUILT is the outcome of the build step ("success" when meta.json was rebuilt).

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
  }),
)
