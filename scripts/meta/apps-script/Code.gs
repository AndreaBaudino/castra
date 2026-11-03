// Castra — reads the tournament sheets for the nightly meta update (.github/workflows/meta.yml), and writes into them
// the tournaments run in the app.
//
// Deployed as a web app from the account that owns the sheets: "Execute as: Me", "Who has access: Anyone".
// GET ?key=<KEY>&id=<drive id> answers with the file as .xlsx, base64-encoded. KEY is a script property
// (Project settings → Script properties) and the same value is the META_SCRIPT_KEY secret on GitHub.
// Only the files in the list of tournament sheets are served: Firestore's sources collection (kept from the app's
// admin area) and the repository's scripts/meta/sources.json.
// POST {token, id, rows} publishes a tournament (docs/tornei.md): see doPost.

const SOURCES_URL = 'https://raw.githubusercontent.com/AndreaBaudino/castra/main/scripts/meta/sources.json'
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/castra-a69ab/databases/(default)/documents/sources'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function doGet(e) {
  const key = PropertiesService.getScriptProperties().getProperty('KEY')
  const p = e.parameter
  if (!key || p.key !== key) return text('error: chiave non valida')
  if (!allowed().includes(p.id)) return text('error: file non presente nell\'elenco dei tornei')
  try {
    return text(Utilities.base64Encode(xlsxOf(p.id).getBytes()))
  } catch (err) {
    return text('error: ' + err.message)
  }
}

/** The drive ids in the list, cached for two minutes. */
function allowed() {
  const cache = CacheService.getScriptCache()
  let json = cache.get('drives')
  if (!json) {
    const ids = JSON.parse(UrlFetchApp.fetch(SOURCES_URL).getContentText()).tournaments.map((t) => t.drive)
    let page = ''
    do {
      const url = FIRESTORE_URL + '?pageSize=300' + (page ? '&pageToken=' + encodeURIComponent(page) : '')
      const body = JSON.parse(UrlFetchApp.fetch(url).getContentText())
      for (const d of body.documents || []) if (d.fields && d.fields.drive) ids.push(d.fields.drive.stringValue)
      page = body.nextPageToken || ''
    } while (page)
    json = JSON.stringify(ids)
    cache.put('drives', json, 120)
  }
  return JSON.parse(json)
}

/** Google Sheets are exported, uploaded Excel files are read as they are. */
function xlsxOf(id) {
  const file = DriveApp.getFileById(id)
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) return file.getBlob()
  const url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx'
  return UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob().setContentType(XLSX)
}

function text(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT)
}

/** Run once from the editor: grants access to Drive and checks that every sheet can be read. */
function check() {
  for (const id of allowed()) {
    const name = DriveApp.getFileById(id).getName()
    Logger.log(name + ': ' + xlsxOf(id).getBytes().length + ' byte')
  }
}

// ---------- publishing a tournament run in the app ----------

const DOCS = 'https://firestore.googleapis.com/v1/projects/castra-a69ab/databases/(default)/documents/'
const MARK = '?updateMask.fieldPaths=filed&currentDocument.exists=true' // "filed" only, never creating the tournament

/**
 * Writes a finished tournament into its sheet, from the TO area (src/lib/tournaments.ts publishTournament): the stage's
 * tab of the league sheet, or a level's "Classifica". `token` is the TO's Firebase sign-in: the script reads and marks
 * the tournament with it, so Firestore's rules decide who may publish. `rows` are the final standings: names and
 * commanders (B-C), wins, losses, draws, bye and decklist (E-I), plus the date; the points are the sheet's formulas.
 * New players go into the league's "Classifica", new commanders into the free rows on top of "Comandanti". Nothing is
 * written when the tab already has results.
 */
function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(30000) // one at a time: two TOs can't both find the tab empty
  try {
    const { token, id, rows } = JSON.parse(e.postData.contents)
    return json(publish(token, id, rows))
  } catch (err) {
    return json({ error: err.message })
  } finally {
    lock.releaseLock()
  }
}

function publish(token, id, rows) {
  if (typeof token !== 'string' || typeof id !== 'string' || !/^[-_A-Za-z0-9]{20,100}(~[0-9]{1,2})?$/.test(id))
    throw new Error('richiesta non valida')
  checkRows(rows)
  const path = 'tournaments/' + id
  const t = fieldsOf(firestore('get', path, token))
  if (t.status !== 'done') throw new Error('il torneo non è concluso')
  if (t.filed) throw new Error('il torneo risulta già nel foglio')
  // a write that changes nothing: the rules let it through only for who runs the tournament
  firestore('patch', path + MARK, token, { filed: false }, 'non gestisci questo torneo')

  const ss = SpreadsheetApp.openById(t.drive)
  const name = t.kind === 'league' ? String(t.stage) : 'Classifica'
  const tab = ss.getSheetByName(name)
  if (!tab) throw new Error('nel foglio non c\'è la scheda "' + name + '"')
  const table = tablePlan(read(tab, 9), formulasOf(tab, 2))
  if (!table) throw new Error('nella scheda "' + name + '" non trovo le colonne "Nome giocatore" e "Comandante"')
  if (table.busy) throw new Error('la scheda "' + name + '" ha già dei risultati: non ho scritto niente')
  if (table.capacity < rows.length) throw new Error('nella scheda "' + name + '" ci sono solo ' + table.capacity + ' righe')
  // a league stage's names come from its "Classifica" (a menu): the new players go there first
  const league = t.kind === 'league' ? ss.getSheetByName('Classifica') : null
  const players = league ? listPlan(read(league, 2).map((r) => r[1]), formulasOf(league, 3), 'Nome giocatore') : null
  if (league && !players) throw new Error('nella scheda "Classifica" non trovo la colonna "Nome giocatore"')
  const names = fit(players || { spelling: {}, free: [] }, players ? rows.map((r) => r.name) : [])
  if (names.left.length) throw new Error('nella scheda "Classifica" mancano righe libere per ' + names.left.join(', '))
  const cmdTab = ss.getSheetByName('Comandanti')
  // the commanders' menu: new ones that don't fit are left to add by hand
  const cmdList = cmdTab && listPlan(read(cmdTab, 2).map((r) => r[1]), formulasOf(cmdTab, 2), 'Commander', true)
  const cmds = fit(cmdList || { spelling: {}, free: [] }, cmdTab ? rows.map((r) => r.commander).filter(Boolean) : [])

  // everything checked: now the writes
  for (const [row, n] of names.add) league.getRange(row, 2).setValue(cell(n))
  for (const [row, c] of cmds.add) cmdTab.getRange(row, 2).setValue(cell(c))
  const first = table.header + 2 // 1-based, under the header
  const as = (map, v) => cell(map[normal(v)] || v)
  tab.getRange(first, 2, rows.length, 2).setValues(rows.map((r) => [as(names.spelling, r.name), r.commander ? as(cmds.spelling, r.commander) : '']))
  tab.getRange(first, 5, rows.length, 5).setValues(rows.map((r) => [r.w, r.l, r.d, r.bye, r.list || '']))
  if (table.date) {
    const [y, m, d] = t.date.split('-').map(Number)
    tab.getRange(table.date[0] + 1, table.date[1] + 1).setValue(new Date(y, m - 1, d))
  }
  SpreadsheetApp.flush()
  firestore('patch', path + MARK, token, { filed: true })
  return { ok: true, tab: name, players: names.add.map((a) => a[1]), commanders: cmds.add.map((a) => a[1]), manual: cmds.left }
}

/** The rows as the app sends them: checked, as they go into a sheet many people use. */
function checkRows(rows) {
  const n = (v) => Number.isInteger(v) && v >= 0 && v <= 30
  const ok = Array.isArray(rows) && rows.length > 0 && rows.length <= 300 && rows.every((r) =>
    r && typeof r.name === 'string' && r.name.trim() && r.name.length <= 200
      && (r.commander == null || (typeof r.commander === 'string' && r.commander.length <= 300))
      && n(r.w) && n(r.l) && n(r.d) && typeof r.bye === 'boolean'
      && (!r.list || (typeof r.list === 'string' && /^https:\/\/(www\.)?moxfield\.com\/decks\/[-_A-Za-z0-9]+\/?$/.test(r.list))))
  if (!ok) throw new Error('righe non valide')
}

/** Text that the sheet takes as it is, never as a formula. */
const cell = (s) => (/^[=+@]/.test(s) ? "'" + s : s)

/** How names compare: case, accents, apostrophes and spaces aside. */
const normal = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

const read = (tab, cols) => tab.getRange(1, 1, Math.min(tab.getMaxRows(), 1100), cols).getDisplayValues()
const formulasOf = (tab, col) => tab.getRange(1, col, Math.min(tab.getMaxRows(), 1100), 1).getFormulas().map((r) => r[0])

/**
 * Where a standings table is (0-based): the header row with "Nome giocatore" and "Comandante" in B and C, the date
 * cell under "Data", how many rows it has (down to a formula in B, such as a report) and whether any has results.
 */
function tablePlan(vals, bFormulas) {
  let header = -1
  for (let r = 0; r < Math.min(40, vals.length) && header < 0; r++)
    if (String(vals[r][1]).trim() === 'Nome giocatore' && String(vals[r][2]).trim() === 'Comandante') header = r
  if (header < 0) return null
  let date = null
  for (let r = 0; r < header && !date; r++)
    for (let c = 0; c < 6 && !date; c++) if (String(vals[r][c]).trim() === 'Data') date = [r + 1, c]
  let capacity = 0
  while (header + 1 + capacity < vals.length && !bFormulas[header + 1 + capacity] && capacity < 300) capacity++
  const used = (row) => [1, 2, 4, 5, 6, 8].some((c) => String(row[c]).trim() !== '') || String(row[7]).toUpperCase() === 'TRUE'
  const busy = vals.slice(header + 1, header + 1 + capacity).some(used)
  return { header, date, capacity, busy }
}

/**
 * A list in column B under its header (the league's players, the commanders): the names already there by how they
 * compare, and the free rows (1-based) where new ones can go. Players: the empty rows of the table, which have their
 * formulas in C. Commanders (`top`): the empty rows between the header and the database's formula below.
 */
function listPlan(col, formulas, title, top) {
  const header = col.findIndex((v) => String(v).trim() === title)
  if (header < 0) return null
  const spelling = {}
  const free = []
  let end = top ? formulas.findIndex((f, i) => i > header && f) : col.length
  if (end < 0) end = col.length
  col.forEach((v, i) => {
    if (i <= header) return
    if (String(v).trim()) spelling[normal(v)] = String(v).trim()
    else if (i < end && (top || formulas[i])) free.push(i + 1)
  })
  return { spelling, free }
}

/** Which names are new, and the free row each goes to; `left` the ones without one. */
function fit(list, names) {
  const add = []
  const left = []
  const seen = {}
  for (const n of names) {
    const k = normal(n)
    if (list.spelling[k] || seen[k]) continue
    seen[k] = true
    if (add.length < list.free.length) add.push([list.free[add.length], n.trim()])
    else left.push(n.trim())
  }
  for (const [, n] of add) list.spelling[normal(n)] = n
  return { spelling: list.spelling, add, left }
}

/** A Firestore REST call as the TO: the rules apply as in the app. */
function firestore(method, path, token, data, denied) {
  const opt = { method, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
  if (data) {
    opt.contentType = 'application/json'
    opt.payload = JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { booleanValue: v }])) })
  }
  const res = UrlFetchApp.fetch(DOCS + path, opt)
  const code = res.getResponseCode()
  if (code === 401 || code === 403) throw new Error(denied || 'accesso scaduto: esci e rientra nell\'app')
  if (code === 404) throw new Error('torneo non trovato')
  if (code !== 200) throw new Error('Firestore ha risposto ' + code)
  return JSON.parse(res.getContentText())
}

/** A Firestore document's fields, as plain values. */
function fieldsOf(doc) {
  const out = {}
  for (const [k, v] of Object.entries(doc.fields || {}))
    out[k] = 'integerValue' in v ? Number(v.integerValue) : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : null
  return out
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}
