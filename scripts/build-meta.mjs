// Builds public/meta.json from the tournament sheets: one dataset per year, each tournament in the year of its date
// (events) or of its "year" field (leagues). The list of sheets is the one fetch-meta.mjs used
// (.meta-cache/sources.json, from Firestore), or scripts/meta/sources.json when there is none.
//
// The sheets are private, so they are read from local copies: download each one as .xlsx into
// .meta-cache/<drive id>.xlsx (scripts/fetch-meta.mjs does it, as in the nightly workflow), then run `npm run meta`. Commander names are resolved on Scryfall
// (cached in scripts/meta/cards.json); misspellings and name variants are fixed by the corrections of
// scripts/meta/aliases.mjs (kept from the app's admin area). Names still to correct are reported as `issues`.
//
// Byes: a bye ticked in the BYE column is taken out of that player's wins. An unticked bye stays in as a
// win, as the sheet reports it: once someone ticks it, the next run takes it out.

import ExcelJS from 'exceljs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { aliasLookup, commanderKey, loadAliases, playerKey } from './meta/aliases.mjs'
import { firestoreDocs } from './meta/firestore.mjs'

const dir = new URL('./meta/', import.meta.url)
const root = new URL('../', import.meta.url)
const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'))

const fetched = new URL('.meta-cache/sources.json', root)
const sources = readJson(existsSync(fetched) ? fetched : new URL('sources.json', dir))
const aliases = await loadAliases()
const lookup = aliasLookup(aliases.list)
const cardsUrl = new URL('cards.json', dir)
const cards = existsSync(cardsUrl) ? readJson(cardsUrl) : {}
const warnings = []
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

// names to correct, for the app's admin area: one per name, with where it shows up
const issues = new Map()
function issue(kind, name, ctx, guess) {
  const k = `${kind}|${kind === 'player' ? playerKey(name) : commanderKey(name)}`
  const x = issues.get(k) ?? { kind, name, guess, where: new Set(), years: new Set(), drives: new Set() }
  x.where.add(ctx.label)
  x.years.add(ctx.year)
  x.drives.add(ctx.drive)
  issues.set(k, x)
}

// each correction's use in this run: how many rows, in which tournaments (none: the sheets don't need it any more)
const usage = {}
function corrected(kind, name, ctx, count) {
  const a = lookup(kind, kind === 'player' ? playerKey(name) : commanderKey(name), ctx)
  if (!a) return { name }
  if (count) {
    const u = (usage[a.id] ??= { n: 0, where: new Set() })
    u.n++
    u.where.add(ctx.label)
  }
  return { name: a.to, alias: a }
}

// ---------- cells ----------

function value(cell) {
  const v = cell?.value
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v !== 'object') return v
  if ('result' in v) return v.result ?? null // formula
  if ('richText' in v) return v.richText.map((t) => t.text).join('')
  if ('hyperlink' in v) return v.hyperlink || v.text
  if ('text' in v) return v.text
  return null // errors (#N/A, #REF!)
}
const raw = (cell) => {
  const v = value(cell)
  return v == null || v instanceof Date ? '' : String(v)
}
const text = (cell) => raw(cell).replace(/\s+/g, ' ').trim()
const num = (cell) => {
  const v = value(cell)
  if (typeof v === 'number') return v
  if (typeof v === 'string' && /^\s*\d+([.,]\d+)?\s*$/.test(v)) return parseFloat(v.replace(',', '.'))
  return null
}
const isoDate = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
// empty, a formula error, or the multi-line report text some sheets keep below the table
const junk = (s) => !s.trim() || s.trim() === '#N/A' || s.trim() === '-' || s.trim().includes('\n')

// ---------- one standings table (an event's "Classifica" or a league stage) ----------

const COL = { player: 2, commander: 3, wins: 5, losses: 6, draws: 7, bye: 8, list: 9 }

function readTable(ws, where) {
  let header = 0
  for (let r = 1; r <= 40 && !header; r++) {
    const row = ws.getRow(r)
    if (text(row.getCell(COL.player)) === 'Nome giocatore' && text(row.getCell(COL.commander)) === 'Comandante') header = r
  }
  if (!header) return null
  let date = null
  let players = null
  for (let r = 1; r < header; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= 6; c++) {
      const v = value(row.getCell(c))
      if (v instanceof Date) date = isoDate(v)
      if (/^(players|giocatori)$/i.test(text(row.getCell(c)))) players = num(ws.getRow(r + 1).getCell(c))
    }
  }
  const rows = []
  for (let r = header + 1; r <= header + 300; r++) {
    const row = ws.getRow(r)
    const player = text(row.getCell(COL.player))
    const commander = text(row.getCell(COL.commander))
    const wins = num(row.getCell(COL.wins))
    const hasPlayer = !junk(raw(row.getCell(COL.player)))
    const hasCommander = !junk(raw(row.getCell(COL.commander)))
    // a row without a name still counts for its deck (anonymous players), and the other way round
    if (!hasPlayer && !(hasCommander && wins != null)) continue
    const list = text(row.getCell(COL.list))
    rows.push({
      player: hasPlayer ? player : null,
      commander: hasCommander ? commander : null,
      wins,
      losses: wins == null ? null : (num(row.getCell(COL.losses)) ?? 0),
      draws: wins == null ? null : (num(row.getCell(COL.draws)) ?? 0),
      bye: value(row.getCell(COL.bye)) === true,
      list: /^https?:\/\//.test(list) ? list : null,
    })
  }
  if (rows.length) {
    const played = rows.filter((r) => r.wins != null)
    const w = played.reduce((s, r) => s + r.wins - (r.bye ? 1 : 0), 0)
    const l = played.reduce((s, r) => s + r.losses, 0)
    if (played.length && w !== l) warn(where, `${w} vittorie e ${l} sconfitte (bye segnati esclusi)`)
    if (!played.length) warn(where, 'nessun risultato (V/S/P vuoti)')
    const noCmd = rows.filter((r) => !r.commander).length
    if (noCmd) warn(where, `${noCmd} giocatori senza comandante`)
  }
  return { date, players, rows }
}

// ---------- commanders: Scryfall names and color identity ----------

const WUBRG = 'WUBRG'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const HEADERS = { 'User-Agent': 'castra-meta/1.0', Accept: 'application/json' }

async function resolveCards(names) {
  const missing = [...new Set(names.map((n) => n.toLowerCase()))].filter((n) => !(n in cards))
  for (let i = 0; i < missing.length; i += 75) {
    const chunk = missing.slice(i, i + 75)
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
    })
    if (!res.ok) throw new Error(`Scryfall ${res.status}`)
    const data = await res.json()
    for (const c of data.data) {
      const key = chunk.find((n) => n === c.name.toLowerCase() || n === c.name.split(' // ')[0].toLowerCase())
      if (key) cards[key] = { name: c.name, colors: c.color_identity.join('') }
    }
    await sleep(120)
  }
  // still unknown: Scryfall's fuzzy search fixes small typos
  for (const n of missing.filter((n) => !(n in cards))) {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(n)}`, { headers: HEADERS })
    if (res.ok) {
      const c = await res.json()
      cards[n] = { name: c.name, colors: c.color_identity.join(''), fuzzy: true }
    }
    await sleep(120)
  }
}

// "A / B" are partners (or a background); "A // B" is one double-faced card. Each one corrected on its own.
const splitPartners = (raw, ctx, count) =>
  raw
    .split(/(?<!\/)\/(?!\/)/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => corrected('commander', p, ctx, count).name)
const frontFace = (name) => name.split('//')[0].trim()

function commanderOf(raw, ctx) {
  const parts = splitPartners(raw, ctx, true).map((p) => {
    const card = cards[frontFace(p).toLowerCase()]
    // not on Scryfall, or read by its fuzzy search: a correction makes it sure
    if (!card || card.fuzzy) issue('commander', p, ctx, card?.name)
    return card ?? { name: p, colors: '' }
  })
  // both faces of one card written as partners ("Brigid, Clachan's Heart / Brigid Doun's Mind")
  parts.splice(0, parts.length, ...new Map(parts.map((p) => [p.name, p])).values())
  parts.sort((a, b) => a.name.localeCompare(b.name))
  const colors = [...WUBRG].filter((c) => parts.some((p) => p.colors.includes(c))).join('')
  return { name: parts.map((p) => p.name).join(' / '), colors }
}

// ---------- players ----------

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') cell += text[++i]
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(cell), (cell = '')
    else if (c === '\n') row.push(cell), rows.push(row), (row = []), (cell = '')
    else if (c !== '\r') cell += c
  }
  row.push(cell)
  rows.push(row)
  return rows
}

// every player's name after the corrections, by year, for the check on the circuit leaderboard; a correction of a name
// to itself confirms a name that isn't in the leaderboard
const seen = new Map()
function playerOf(name, ctx) {
  const c = corrected('player', name, ctx, true)
  const year = seen.get(ctx.year) ?? new Map()
  seen.set(ctx.year, year)
  const k = playerKey(c.name)
  const x = year.get(k) ?? { name: c.name, ctxs: [], confirmed: false }
  x.ctxs.push(ctx)
  if (c.alias && playerKey(c.alias.to) === c.alias.key) x.confirmed = true
  year.set(k, x)
  return c.name
}

// ---------- build ----------

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const seasonOf = (date) => (date && +date.slice(5, 7) <= 5 ? 's1' : 's2')

const tables = [] // { year, t: tournament, players, rows }
const read = {} // tournaments read from each sheet, by drive id: 0 = not played yet
for (const src of sources.tournaments) {
  read[src.drive] = 0
  const file = new URL(`.meta-cache/${src.drive}.xlsx`, root)
  const label = src.name ?? `${src.league} ${src.season?.toUpperCase() ?? ''}`.trim()
  if (!existsSync(file)) {
    warn(label, `manca .meta-cache/${src.drive}.xlsx`)
    continue
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file.pathname)
  if (src.kind === 'l1' || src.kind === 'l2') {
    const ws = wb.getWorksheet('Classifica')
    const tab = ws && readTable(ws, label)
    if (!tab?.rows.length) continue // not played yet
    const date = src.date ?? tab.date
    if (!date) {
      warn(label, 'senza data: non si sa di che anno è')
      continue
    }
    const t = { id: `${src.kind}-${date}-${slug(src.name)}`, k: src.kind, s: seasonOf(date), n: src.name, d: date }
    if (src.circuit) t.c = src.circuit
    const year = +date.slice(0, 4)
    tables.push({ year, t, players: tab.players, rows: tab.rows, ctx: { year, drive: src.drive, label } })
    read[src.drive]++
  } else {
    if (!src.year) {
      warn(label, 'manca "year" in sources.json')
      continue
    }
    const stages = wb.worksheets.filter((ws) => /^\d+$/.test(ws.name.trim()))
    for (const ws of stages) {
      const stage = +ws.name.trim()
      const where = `${label} tappa ${stage}`
      const tab = readTable(ws, where)
      if (!tab?.rows.length) continue
      const t = { id: `${src.season}-${slug(src.league)}-${stage}`, k: src.kind, s: src.season, n: src.venue ?? src.league, lg: src.league, st: stage }
      if (tab.date) t.d = tab.date
      else warn(where, 'senza data')
      if (tab.date && +tab.date.slice(0, 4) !== src.year) warn(where, `data ${tab.date} fuori dall'anno ${src.year}`)
      tables.push({ year: src.year, t, players: tab.players, rows: tab.rows, ctx: { year: src.year, drive: src.drive, label: where } })
      read[src.drive]++
    }
  }
}

await resolveCards(tables.flatMap(({ rows, ctx }) => rows.flatMap((r) => (r.commander ? splitPartners(r.commander, ctx, false).map(frontFace) : []))))

// one dataset per year, the newest first: tournaments, commanders and entries, each indexed within its year
function build(tables) {
  const commanders = []
  const cmdIndex = new Map()
  const entries = []
  const tournaments = []
  for (const { t, players, rows, ctx } of tables) {
    const ti = tournaments.length
    tournaments.push({ ...t, p: players || rows.length }) // as declared in the sheet: some rows can be drops or duplicates
    rows.forEach((r, i) => {
      let ci = -1
      if (r.commander) {
        const c = commanderOf(r.commander, ctx)
        if (!cmdIndex.has(c.name)) {
          cmdIndex.set(c.name, commanders.length)
          commanders.push({ n: c.name, c: c.colors })
        }
        ci = cmdIndex.get(c.name)
      }
      // [tournament, player, commander, place, wins, losses, draws, bye ticked, list]
      entries.push([ti, r.player && playerOf(r.player, ctx), ci, i + 1, r.wins, r.losses, r.draws, r.bye ? 1 : 0, r.list])
    })
  }
  return { t: tournaments, c: commanders, e: entries }
}
const yearList = [...new Set(tables.map((x) => x.year))].sort((a, b) => b - a)
const built = yearList.map((year) => ({ year, ...build(tables.filter((x) => x.year === year)) }))
// players missing from their year's circuit leaderboard: usually a typo, fixed with an alias. The leaderboard sheet of
// each year is on Firestore (circuits/{year}, set from the app's admin area); 2026's is also in src/config.ts.
async function circuitSheets() {
  const config = readFileSync(new URL('src/config.ts', root), 'utf8')
  const sheets = { 2026: { sheet: config.match(/CIRCUIT_SHEET_ID = '([^']+)'/)[1], leaderboard: config.match(/leaderboard: '(\d+)'/)[1] } }
  try {
    for (const d of await firestoreDocs('circuits')) sheets[d.year] = { sheet: d.sheet, leaderboard: d.tabs.leaderboard }
  } catch (e) {
    warn('circuito', `fogli della classifica non letti da Firestore (${e.message})`)
  }
  return sheets
}
const sheets = await circuitSheets()
for (const { year } of built) {
  const sheet = sheets[year]
  if (!sheet) {
    warn(`circuito ${year}`, 'nessun foglio della classifica per questo anno: giocatori non controllati')
    continue
  }
  try {
    const csv = await (await fetch(`https://docs.google.com/spreadsheets/d/${sheet.sheet}/export?format=csv&gid=${sheet.leaderboard}`)).text()
    const rows = parseCsv(csv)
    const h = rows.findIndex((r) => r.some((c) => /player name/i.test(c)))
    const col = rows[h].findIndex((c) => /player name/i.test(c))
    const known = new Set(rows.slice(h + 1).map((r) => playerKey(r[col] ?? '')))
    for (const [k, p] of seen.get(year) ?? []) if (!known.has(k) && !p.confirmed) for (const ctx of p.ctxs) issue('player', p.name, ctx)
  } catch (e) {
    warn(`circuito ${year}`, `classifica non scaricata (${e.message})`)
  }
}

// each year's update time moves only when its data does, so the nightly run publishes nothing on quiet days
const outUrl = new URL('public/meta.json', root)
const prev = existsSync(outUrl) ? readJson(outUrl).years : []
const rebuilt = built.map(({ year, t, c, e }) => {
  const out = { v: 1, year, updated: new Date().toISOString(), t, c, e }
  const old = prev.find((y) => y.year === year)
  if (old && JSON.stringify({ ...old, updated: '' }) === JSON.stringify({ ...out, updated: '' })) out.updated = old.updated
  return out
})
// a year with no sheet read this time (none downloaded, or taken out of sources.json) keeps its published data
const kept = prev.filter((y) => !yearList.includes(y.year))
for (const y of kept) warn(String(y.year), 'nessun foglio letto: restano i dati già pubblicati')
const years = [...rebuilt, ...kept].sort((a, b) => b.year - a.year)
writeFileSync(outUrl, JSON.stringify({ v: 2, years }))
writeFileSync(cardsUrl, JSON.stringify(Object.fromEntries(Object.entries(cards).sort()), null, 1) + '\n')

// for the update's report (scripts/meta-status.mjs)
const summary = years.map((y) => ({ year: y.year, t: y.t.length, e: y.e.length, c: y.c.length }))
const issueList = [...issues.values()].map((x) => ({ ...x, where: [...x.where], years: [...x.years], drives: [...x.drives] }))
const aliasUse = Object.fromEntries(Object.entries(usage).map(([id, u]) => [id, { n: u.n, where: [...u.where].slice(0, 8) }]))
if (existsSync(new URL('.meta-cache/', root)))
  writeFileSync(
    new URL('.meta-cache/report.json', root),
    JSON.stringify({ warnings, read, years: summary, issues: issueList, aliases: aliasUse, aliasOrigin: aliases.origin }),
  )

for (const y of years) console.log(`${y.year}: ${y.t.length} tornei, ${y.e.length} presenze, ${y.c.length} comandanti`)
const unused = aliases.list.filter((a) => !usage[a.id]).length
console.log(`Correzioni (${aliases.origin === 'firestore' ? 'Firestore' : 'aliases.json'}): ${aliases.list.length}, ${unused} non usate`)
if (issueList.length)
  console.log(`\nNomi da correggere (${issueList.length}):\n- ${issueList.map((x) => `${x.kind === 'player' ? 'giocatore' : 'comandante'} "${x.name}"${x.guess ? ` (forse ${x.guess})` : ''}: ${x.where.slice(0, 3).join(', ')}`).join('\n- ')}`)
if (warnings.length) console.log(`\nDa controllare (${warnings.length}):\n- ${warnings.join('\n- ')}`)
