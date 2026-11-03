// Castra — reads the tournament sheets for the nightly meta update (.github/workflows/meta.yml), and writes into them
// the tournaments run in the app.
//
// Deployed as a web app from the account that owns the sheets: "Execute as: Me", "Who has access: Anyone".
// GET ?key=<KEY>&id=<drive id> answers with the file as .xlsx, base64-encoded. KEY is a script property
// (Project settings → Script properties) and the same value is the META_SCRIPT_KEY secret on GitHub.
// Only the files in the list of tournament sheets are served: Firestore's sources collection (kept from the app's
// admin area) and the repository's scripts/meta/sources.json.
// POST {token, id, rows} publishes a tournament (docs/tornei.md), {token, id, action: 'clear'} takes it off: see doPost.
// POST {token, uid, name, date, action: 'create'} copies the level 1 template into a new sheet, {token, uid, id,
// action: 'trash'} throws one away while nothing was played on it (admins only).

const SOURCES_URL = 'https://raw.githubusercontent.com/AndreaBaudino/castra/main/scripts/meta/sources.json'
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/castra-a69ab/databases/(default)/documents/sources'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
// the blank level 1 sheet ("Blank LVL 1"), owned by this account
const TEMPLATE_L1 = '1yKd6dRUKoMontyCUbGxodtd0kEl2cHuthmyXr3bZFxI'

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

/** Run from the editor once, and again when appsscript.json asks for more: grants access, reads every sheet. */
function check() {
  for (const id of allowed()) {
    const name = DriveApp.getFileById(id).getName()
    Logger.log(name + ': ' + xlsxOf(id).getBytes().length + ' byte')
  }
}

// ---------- publishing a tournament run in the app ----------

const DOCS = 'https://firestore.googleapis.com/v1/projects/castra-a69ab/databases/(default)/documents/'
// writes only these fields, never creating the tournament; a field in the mask but not in the data is deleted
const mask = (...fields) => '?' + fields.map((f) => 'updateMask.fieldPaths=' + f).join('&') + '&currentDocument.exists=true'

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
    const { token, id, rows, action, uid, name, date } = JSON.parse(e.postData.contents)
    if (action === 'create') return json(createLevel(token, uid, name, date))
    if (action === 'trash') return json(trashLevel(token, uid, id))
    return json(action === 'clear' ? unpublish(token, id) : publish(token, id, rows))
  } catch (err) {
    return json({ error: err.message })
  } finally {
    lock.releaseLock()
  }
}

/** A new level 1's sheet: the template copied, with the event's name (B2) and date (C3). Answers with its drive id. */
function createLevel(token, uid, name, date) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('richiesta non valida')
  admin(token, uid)
  const ss = SpreadsheetApp.openById(TEMPLATE_L1).copy('LVL 1 - ' + name.trim())
  const tab = ss.getSheetByName('Classifica')
  tab.getRange(2, 2).setValue(cell(name.trim()))
  const [y, m, d] = date.split('-').map(Number)
  tab.getRange(3, 3).setValue(new Date(y, m - 1, d))
  return { ok: true, id: ss.getId() }
}

/**
 * Throws away (to the bin, for 30 days) a level 1's sheet of this account, as when it was made: still empty, no
 * tournament opened on it in the app, never the template. Who asks then takes it off the list.
 */
function trashLevel(token, uid, id) {
  if (typeof id !== 'string' || !/^[-_A-Za-z0-9]{20,100}$/.test(id)) throw new Error('richiesta non valida')
  admin(token, uid)
  if (id === TEMPLATE_L1) throw new Error('il modello non si elimina')
  const kind = fieldsOf(firestore('get', 'sources/' + id, token)).kind
  if (kind !== 'l1') throw new Error('elimino solo i fogli dei livelli 1')
  if (found('tournaments/' + id, token)) throw new Error('il torneo è stato aperto in app: annullalo prima')
  const file = DriveApp.getFileById(id)
  // the template's owner is this account (asking Session for it would need one more permission)
  const owner = (f) => f.getOwner().getEmail()
  if (!owner(file) || owner(file) !== owner(DriveApp.getFileById(TEMPLATE_L1))) throw new Error('il foglio non è di centuriondati')
  const tab = SpreadsheetApp.openById(id).getSheetByName('Classifica')
  const table = tab && tablePlan(read(tab, 9), formulasOf(tab, 2))
  if (!table || table.busy) throw new Error('il foglio ha già dei risultati: eliminalo a mano')
  file.setTrashed(true)
  return { ok: true }
}

/** Each account may read only its own entry in admins: found, with this sign-in, means an admin asks. */
function admin(token, uid) {
  if (typeof token !== 'string' || typeof uid !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(uid))
    throw new Error('richiesta non valida')
  if (!found('admins/' + uid, token, 'solo gli admin')) throw new Error('solo gli admin')
}

/** Whether a document exists, read with this sign-in. */
function found(path, token, denied) {
  const opt = { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
  const res = UrlFetchApp.fetch(DOCS + path, opt)
  const code = res.getResponseCode()
  if (code === 401) throw new Error('accesso scaduto: esci e rientra nell\'app')
  if (code === 403 && denied) throw new Error(denied)
  if (code !== 200 && code !== 404) throw new Error('Firestore ha risposto ' + code)
  return code === 200
}

/** The tournament, read with the TO's sign-in. */
function tournament(token, id) {
  if (typeof token !== 'string' || typeof id !== 'string' || !/^[-_A-Za-z0-9]{20,100}(~[0-9]{1,2})?$/.test(id))
    throw new Error('richiesta non valida')
  return fieldsOf(firestore('get', 'tournaments/' + id, token))
}

/** A write that changes nothing: the rules let it through only for who runs the tournament. */
const mayRun = (token, id, t) => firestore('patch', 'tournaments/' + id + mask('filed'), token, { filed: !!t.filed }, 'non gestisci questo torneo')

function publish(token, id, rows) {
  checkRows(rows)
  const t = tournament(token, id)
  if (t.status !== 'done') throw new Error('il torneo non è concluso')
  if (t.filed || t.published) throw new Error('il torneo risulta già nel foglio')
  mayRun(token, id, t)

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
  // what was written, for "Togli dal foglio"
  const published = { tab: name, first, rows: rows.length, players: names.add.map((a) => a[1]), commanders: cmds.add.map((a) => a[1]) }
  firestore('patch', 'tournaments/' + id + mask('filed', 'published'), token, { filed: true, published })
  return { ok: true, tab: name, players: published.players, commanders: published.commanders, manual: cmds.left }
}

/**
 * Takes a published tournament off its sheet: the rows and the date written are emptied (the formulas and the BYE
 * boxes stay), and so are the players and commanders added then, unless another tab of the sheet uses them by now.
 * The tournament can then be published again.
 */
function unpublish(token, id) {
  const t = tournament(token, id)
  const p = t.published
  if (!p) throw new Error('il torneo non risulta pubblicato dall\'app')
  mayRun(token, id, t)
  const ss = SpreadsheetApp.openById(t.drive)
  const tab = ss.getSheetByName(p.tab)
  if (!tab) throw new Error('nel foglio non c\'è più la scheda "' + p.tab + '"')
  const table = tablePlan(read(tab, 9), formulasOf(tab, 2))
  if (!table || table.header + 2 !== p.first) throw new Error('la scheda "' + p.tab + '" è cambiata: toglilo a mano')
  const empty = (n) => Array.from({ length: p.rows }, () => Array(n).fill(''))
  tab.getRange(p.first, 2, p.rows, 2).setValues(empty(2))
  tab.getRange(p.first, 5, p.rows, 3).setValues(empty(3))
  tab.getRange(p.first, 8, p.rows, 1).setValues(Array.from({ length: p.rows }, () => [false]))
  tab.getRange(p.first, 9, p.rows, 1).setValues(empty(1))
  if (table.date) tab.getRange(table.date[0] + 1, table.date[1] + 1).setValue('')
  // the names still used in the sheet's other stages (a league's numbered tabs)
  const used = { names: {}, commanders: {} }
  for (const other of ss.getSheets())
    if (/^[0-9]+$/.test(other.getName()) && other.getName() !== p.tab)
      for (const r of read(other, 3)) {
        used.names[normal(r[1])] = true
        used.commanders[normal(r[2])] = true
      }
  const drop = (sheet, names, keep) => {
    const kept = []
    if (!sheet) return kept
    const col = read(sheet, 2).map((r) => String(r[1]).trim())
    for (const n of names) {
      const at = col.indexOf(n)
      if (keep[normal(n)] || at < 0) kept.push(n)
      else sheet.getRange(at + 1, 2).setValue('')
    }
    return kept
  }
  const kept = [...drop(ss.getSheetByName('Classifica'), p.players, used.names), ...drop(ss.getSheetByName('Comandanti'), p.commanders, used.commanders)]
  SpreadsheetApp.flush()
  firestore('patch', 'tournaments/' + id + mask('filed', 'published'), token, { filed: false })
  return { ok: true, tab: p.tab, kept }
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
    opt.payload = JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typed(v)])) })
  }
  const res = UrlFetchApp.fetch(DOCS + path, opt)
  const code = res.getResponseCode()
  if (code === 401 || code === 403) throw new Error(denied || 'accesso scaduto: esci e rientra nell\'app')
  if (code === 404) throw new Error('torneo non trovato')
  if (code !== 200) throw new Error('Firestore ha risposto ' + code)
  return JSON.parse(res.getContentText())
}

/** A value as Firestore's REST API wants it, and back. */
function typed(v) {
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return { integerValue: String(v) }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(typed) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typed(x)])) } }
}
function plain(v) {
  if ('integerValue' in v) return Number(v.integerValue)
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain)
  if ('mapValue' in v) return fieldsOf(v.mapValue)
  return null
}

/** A Firestore document's fields, as plain values. */
function fieldsOf(doc) {
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, plain(v)]))
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}
