// Builds public/meta-<year>.json from the tournament sheets listed in scripts/meta/sources.json.
//
// The sheets are private, so they are read from local copies: download each one as .xlsx into
// .meta-cache/<drive id>.xlsx, then run `npm run meta`. Commander names are resolved on Scryfall
// (cached in scripts/meta/cards.json); misspellings and name variants are fixed in scripts/meta/aliases.json.
//
// Byes: a bye ticked in the BYE column is taken out of that player's wins. An unticked bye stays in as a
// win, as the sheet reports it: once someone ticks it, the next run takes it out.

import ExcelJS from 'exceljs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const dir = new URL('./meta/', import.meta.url)
const root = new URL('../', import.meta.url)
const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'))

const sources = readJson(new URL('sources.json', dir))
const aliases = readJson(new URL('aliases.json', dir))
const cardsUrl = new URL('cards.json', dir)
const cards = existsSync(cardsUrl) ? readJson(cardsUrl) : {}
const warnings = []
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

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
const aliasOf = (map, name) => map[name.toLowerCase()] ?? name

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

// "A / B" are partners (or a background); "A // B" is one double-faced card
const splitPartners = (raw) =>
  raw
    .split(/(?<!\/)\/(?!\/)/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => aliasOf(aliases.commanders, p))
const frontFace = (name) => name.split('//')[0].trim()

function commanderOf(raw, where) {
  const parts = splitPartners(raw).map((p) => {
    const card = cards[frontFace(p).toLowerCase()]
    if (!card) warn(where, `comandante non trovato su Scryfall: "${p}"`)
    else if (card.fuzzy && !warnedFuzzy.has(p)) {
      warnedFuzzy.add(p)
      warn(where, `"${p}" letto come "${card.name}" (aggiungi un alias se è sbagliato)`)
    }
    return card ?? { name: p, colors: '' }
  })
  // both faces of one card written as partners ("Brigid, Clachan's Heart / Brigid Doun's Mind")
  parts.splice(0, parts.length, ...new Map(parts.map((p) => [p.name, p])).values())
  parts.sort((a, b) => a.name.localeCompare(b.name))
  const colors = [...WUBRG].filter((c) => parts.some((p) => p.colors.includes(c))).join('')
  return { name: parts.map((p) => p.name).join(' / '), colors }
}
const warnedFuzzy = new Set()

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

const playerKey = (name) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const playerOf = (name) => aliases.players[playerKey(name)] ?? name

// ---------- build ----------

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const seasonOf = (date) => (date && +date.slice(5, 7) <= 5 ? 's1' : 's2')

const tables = [] // { t: tournament, rows }
for (const src of sources.tournaments) {
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
    const t = { id: `${src.kind}-${date}-${slug(src.name)}`, k: src.kind, s: seasonOf(date), n: src.name, d: date }
    if (src.circuit) t.c = src.circuit
    tables.push({ t, players: tab.players, rows: tab.rows })
  } else {
    const stages = wb.worksheets.filter((ws) => /^\d+$/.test(ws.name.trim()))
    for (const ws of stages) {
      const stage = +ws.name.trim()
      const where = `${label} tappa ${stage}`
      const tab = readTable(ws, where)
      if (!tab?.rows.length) continue
      const t = { id: `${src.season}-${slug(src.league)}-${stage}`, k: src.kind, s: src.season, n: src.venue ?? src.league, lg: src.league, st: stage }
      if (tab.date) t.d = tab.date
      else warn(where, 'senza data')
      tables.push({ t, players: tab.players, rows: tab.rows })
    }
  }
}

await resolveCards(tables.flatMap(({ rows }) => rows.flatMap((r) => (r.commander ? splitPartners(r.commander).map(frontFace) : []))))

const commanders = []
const cmdIndex = new Map()
const entries = []
const tournaments = []
for (const { t, players, rows } of tables) {
  const ti = tournaments.length
  tournaments.push({ ...t, p: Math.max(players ?? 0, rows.length) })
  rows.forEach((r, i) => {
    let ci = -1
    if (r.commander) {
      const c = commanderOf(r.commander, t.id)
      if (!cmdIndex.has(c.name)) {
        cmdIndex.set(c.name, commanders.length)
        commanders.push({ n: c.name, c: c.colors })
      }
      ci = cmdIndex.get(c.name)
    }
    // [tournament, player, commander, place, wins, losses, draws, bye ticked, list]
    entries.push([ti, r.player && playerOf(r.player), ci, i + 1, r.wins, r.losses, r.draws, r.bye ? 1 : 0, r.list])
  })
}

// players missing from the circuit leaderboard: usually a typo, fixed with an alias
try {
  const config = readFileSync(new URL('src/config.ts', root), 'utf8')
  const id = config.match(/CIRCUIT_SHEET_ID = '([^']+)'/)[1]
  const gid = config.match(/leaderboard: '(\d+)'/)[1]
  const csv = await (await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`)).text()
  const rows = parseCsv(csv)
  const h = rows.findIndex((r) => r.some((c) => /player name/i.test(c)))
  const col = rows[h].findIndex((c) => /player name/i.test(c))
  const known = new Set(rows.slice(h + 1).map((r) => playerKey(r[col] ?? '')))
  const unknown = [...new Set(entries.map((e) => e[1]).filter((p) => p && !known.has(playerKey(p))))]
  if (unknown.length) warn('circuito', `${unknown.length} giocatori non presenti nella classifica: ${unknown.sort().join(', ')}`)
} catch (e) {
  warn('circuito', `classifica non scaricata (${e.message})`)
}

const out = { v: 1, year: sources.year, updated: new Date().toISOString(), t: tournaments, c: commanders, e: entries }
writeFileSync(new URL(`public/meta-${sources.year}.json`, root), JSON.stringify(out))
writeFileSync(cardsUrl, JSON.stringify(Object.fromEntries(Object.entries(cards).sort()), null, 1) + '\n')

console.log(`${tournaments.length} tornei, ${entries.length} presenze, ${commanders.length} comandanti`)
if (warnings.length) console.log(`\nDa controllare (${warnings.length}):\n- ${warnings.join('\n- ')}`)
