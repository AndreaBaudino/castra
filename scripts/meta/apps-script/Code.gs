// Castra — reads the tournament sheets for the nightly meta update (.github/workflows/meta.yml).
//
// Deployed as a web app from the account that can open the sheets: "Execute as: Me", "Who has access: Anyone".
// GET ?key=<KEY>&id=<drive id> answers with the file as .xlsx, base64-encoded. KEY is a script property
// (Project settings → Script properties) and the same value is the META_SCRIPT_KEY secret on GitHub.
// Only the files listed in the repository's scripts/meta/sources.json are served.

const SOURCES_URL = 'https://raw.githubusercontent.com/AndreaBaudino/castra/main/scripts/meta/sources.json'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function doGet(e) {
  const key = PropertiesService.getScriptProperties().getProperty('KEY')
  const p = e.parameter
  if (!key || p.key !== key) return text('error: chiave non valida')
  if (!allowed().includes(p.id)) return text('error: file non presente in sources.json')
  try {
    return text(Utilities.base64Encode(xlsxOf(p.id).getBytes()))
  } catch (err) {
    return text('error: ' + err.message)
  }
}

/** The drive ids in sources.json, cached for ten minutes. */
function allowed() {
  const cache = CacheService.getScriptCache()
  let json = cache.get('sources')
  if (!json) {
    json = UrlFetchApp.fetch(SOURCES_URL).getContentText()
    cache.put('sources', json, 600)
  }
  return JSON.parse(json).tournaments.map((t) => t.drive)
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
