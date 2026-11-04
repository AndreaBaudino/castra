// Castra — the tournament notifications: the app calls this web app after starting a round or entering a result, and
// it sends them to the players' phones through Firebase Cloud Messaging (the app's service worker shows them,
// public/push-sw.js). Its own project and account, not the sheets' one (scripts/meta/apps-script): it needs no Drive.
//
// Deployed as a web app: "Execute as: Me", "Who has access: Anyone"; its /exec link is NOTIFY_URL in src/config.ts.
// It reads Firestore and sends as a service account whose JSON key is the script property SERVICE_ACCOUNT, with only
// the roles Cloud Datastore Viewer and Firebase Cloud Messaging API Admin (README, "Notifiche dei tornei").
//
// POST {token, id, action: 'round'}: the pairings of the round being played, to every player at it.
// POST {token, id, action: 'report', match: 'r3t5'}: the result just entered, to the opponent, to confirm.
// POST {token, id, action: 'request', player}: a registration from the app, to the TOs who run that stage.
// POST {token, id, action: 'accepted', player}: the registration the TO confirmed, to the player.
// POST {token, id, action: 'done', order: [player keys]}: each one's final place, from the TO who closed it.
// What to send comes from Firestore, not from the request, and each is sent once: calling again sends nothing.
// `token` is the caller's Firebase sign-in, so only the app's users can call it.

const PROJECT = 'castra-a69ab'
const DOCS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/'
const TTL = 3600 // a pairing an hour late is useless

const T = {
  it: {
    stage: (n) => 'tappa ' + n,
    round: (n) => 'turno ' + n,
    cut: (n) => 'top cut, turno ' + n,
    table: (n, p, c) => 'Tavolo ' + n + ' contro ' + p + (c ? ' (' + c + ')' : ''),
    bye: 'Hai il bye: 3 punti, come una vittoria 2-0.',
    top: (n) => 'Sei nella top ' + n + '. ',
    reported: (p, s) => p + ' ha segnato ' + s + ' per te: confermalo o correggilo.',
    requests: (n, p) => (n > 1 ? n + ' richieste di iscrizione da confermare, l\'ultima di ' + p : 'Nuova richiesta di iscrizione: ' + p),
    joined: (p) => 'Nuova iscrizione: ' + p,
    accepted: 'Il TO ha confermato la tua iscrizione.',
    final: (n, of) => 'Torneo concluso: sei ' + n + '° su ' + of + '. Tocca per la classifica finale.',
  },
  en: {
    stage: (n) => 'stage ' + n,
    round: (n) => 'round ' + n,
    cut: (n) => 'top cut, round ' + n,
    table: (n, p, c) => 'Table ' + n + ' against ' + p + (c ? ' (' + c + ')' : ''),
    bye: 'You have the bye: 3 points, as a 2-0 win.',
    top: (n) => 'You made the top ' + n + '. ',
    reported: (p, s) => p + ' entered ' + s + ' for you: confirm it or fix it.',
    requests: (n, p) => (n > 1 ? n + ' registrations to confirm, the latest from ' + p : 'New registration request: ' + p),
    joined: (p) => 'New registration: ' + p,
    accepted: 'The TO confirmed your registration.',
    final: (n, of) => 'Tournament over: you placed #' + n + ' of ' + of + '. Tap for the final standings.',
  },
}

function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(30000) // one at a time: two phones calling for the same round send it once
  try {
    const { token, id, action, match, player, order } = JSON.parse(e.postData.contents)
    if (typeof id !== 'string' || !/^[-_A-Za-z0-9]{20,100}(~[0-9]{1,2})?$/.test(id)) throw new Error('richiesta non valida')
    const tour = signedIn(token, id)
    if (!tour) return json({ ok: true, sent: 0 })
    if (action === 'round') return json({ ok: true, sent: round(id, tour) })
    if (action === 'report' && typeof match === 'string' && /^r[0-9]{1,2}t[0-9]{1,3}$/.test(match)) return json({ ok: true, sent: report(id, tour, match) })
    const key = typeof player === 'string' && player.length > 0 && player.length <= 200 ? player : null
    if (action === 'request' && key) return json({ ok: true, sent: request(id, tour, key) })
    if (action === 'accepted' && key) return json({ ok: true, sent: accepted(id, tour, key) })
    if (action === 'done' && Array.isArray(order) && order.length <= 300 && order.every((k) => typeof k === 'string'))
      return json({ ok: true, sent: done(token, id, tour, order) })
    throw new Error('richiesta non valida')
  } catch (err) {
    return json({ ok: false, error: err.message })
  } finally {
    lock.releaseLock()
  }
}

/** The tournament, read with the caller's sign-in: a Firebase user, or it throws. Null when it isn't there. */
function signedIn(token, id) {
  if (typeof token !== 'string') throw new Error('accesso mancante')
  const res = UrlFetchApp.fetch(DOCS + 'tournaments/' + id, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true })
  if (res.getResponseCode() === 401) throw new Error('accesso scaduto')
  return res.getResponseCode() === 200 ? fieldsOf(JSON.parse(res.getContentText())) : null
}

/** Runs `fn` (it sends, answering how many) unless it ran already for `key` in the last 6 hours (the cache's most). */
function once(key, fn) {
  const cache = CacheService.getScriptCache()
  if (cache.get(key)) return 0
  const sent = fn()
  cache.put(key, '1', 21600) // only once sent: a failure halfway can be tried again
  return sent
}

/** The pairings of the round being played, once; again after pairing it again (a new clock). */
function round(id, tour) {
  if (!['swiss', 'cut'].includes(tour.status) || !tour.started) return 0
  return once(id + '|' + tour.round + '|' + tour.started, () => pairings(id, tour))
}

function pairings(id, tour) {
  const matches = query(id, 'matches', 'round', tour.round)
  const players = new Map(list('tournaments/' + id + '/players').map((d) => [key(d), fieldsOf(d)]))
  const n = tour.round - (tour.status === 'cut' ? tour.rounds : 0)
  const out = []
  for (const m of matches)
    for (const [me, opp] of [[m.p1, m.p2], [m.p2, m.p1]]) {
      const p = me && players.get(me)
      if (!p || !p.uid) continue
      const o = opp && players.get(opp)
      out.push({
        uid: p.uid,
        text: (t) => [
          title(tour, t) + ' · ' + (tour.status === 'cut' ? t.cut(n) : t.round(n)),
          // the first round of the top cut: who's in hears it here
          (tour.status === 'cut' && n === 1 ? t.top(tour.cut) : '') + (o ? t.table(m.table, o.name, o.commander) : t.bye),
        ],
      })
    }
  return send(out, id)
}

/** A result entered by one player, to the other one, while it waits for them. */
function report(id, tour, mid) {
  const m = get('tournaments/' + id + '/matches/' + mid)
  if (!m || !m.p2 || !m.score || m.confirmed !== false || ![m.p1, m.p2].includes(m.reportedBy)) return 0
  return once(id + '|' + mid + '|' + m.score.join('-') + '|' + m.reportedBy, () => toConfirm(id, tour, m))
}

function toConfirm(id, tour, m) {
  const to = m.reportedBy === m.p1 ? m.p2 : m.p1
  const p = get('tournaments/' + id + '/players/' + encodeURIComponent(to))
  const by = get('tournaments/' + id + '/players/' + encodeURIComponent(m.reportedBy))
  if (!p || !p.uid) return 0
  // the games of the one it's for first, as the app shows them
  const s = to === m.p1 ? m.score : [m.score[1], m.score[0], m.score[2]]
  const score = s.slice(0, s[2] ? 3 : 2).join('-')
  return send([{ uid: p.uid, text: (t) => [title(tour, t), t.reported(by ? by.name : m.reportedBy, score)] }], id)
}

/**
 * A registration from the app, to the TOs who run the stage: one waiting for them with how many are waiting (a newer
 * one replaces it), one already in on its own.
 */
function request(id, tour, key) {
  const p = get('tournaments/' + id + '/players/' + encodeURIComponent(key))
  if (!p) return 0
  return once(id + '|request|' + key + '|' + p.at, () => {
    const waiting = p.pending ? list('tournaments/' + id + '/players').filter((d) => fieldsOf(d).pending).length : 0
    const text = (t) => [title(tour, t), p.pending ? t.requests(waiting, p.name) : t.joined(p.name)]
    const tag = p.pending ? 'tour-req-' + id : 'tour-join-' + id + '-' + key
    const to = runners(tour).filter((uid) => uid !== p.uid) // a TO registering themselves knows already
    return send(to.map((uid) => ({ uid, text, url: '#to/' + id, tag })), id)
  })
}

/** Who runs the tournament: who opened it, and the organizers of its sheet, as firestore.rules' runs(). */
function runners(tour) {
  const s = (tour.drive && get('sources/' + tour.drive)) || {}
  const event = ['l1', 'l2'].includes(s.kind)
  const out = new Set(tour.by ? [tour.by] : [])
  for (const d of list('organizers')) {
    const uid = key(d)
    const leagues = fieldsOf(d).leagues || []
    if (event ? (s.tos || []).includes(uid) || leagues.includes(s.zone) : s.kind === 'league' && leagues.includes(s.league)) out.add(uid)
  }
  return [...out]
}

/** The registration a TO confirmed, to the player. */
function accepted(id, tour, key) {
  const p = get('tournaments/' + id + '/players/' + encodeURIComponent(key))
  if (!p || p.pending || !p.uid) return 0
  return once(id + '|accepted|' + key, () => send([{ uid: p.uid, text: (t) => [title(tour, t), t.accepted] }], id))
}

/**
 * Each player's final place, in the order the TO's phone worked out (the app's standings: tiebreakers and top cut).
 * Only who runs the tournament may send it: a write that changes nothing, which the rules let through only for them.
 */
function done(token, id, tour, order) {
  if (tour.status !== 'done') return 0
  const res = UrlFetchApp.fetch(DOCS + 'tournaments/' + id + '?updateMask.fieldPaths=filed', {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
    payload: JSON.stringify({ fields: { filed: { booleanValue: !!tour.filed } } }),
  })
  if (res.getResponseCode() !== 200) throw new Error('non gestisci questo torneo')
  return once(id + '|done', () => {
    const players = new Map(list('tournaments/' + id + '/players').map((d) => [key(d), fieldsOf(d)]))
    const out = []
    order.forEach((k, i) => {
      const p = players.get(k)
      if (p && p.uid) out.push({ uid: p.uid, text: (t) => [title(tour, t), t.final(i + 1, order.length)], url: '#live/' + id })
    })
    return send(out, id)
  })
}

const title = (tour, t) => (tour.stage ? tour.name + ' · ' + t.stage(tour.stage) : tour.name)

/** To every device of the accounts that turned the tournament notifications on, in their language. */
function send(out, id) {
  const requests = []
  for (const m of out) {
    const u = get('users/' + m.uid)
    if (!u || !u.prefs || u.prefs.notifyTournaments !== true) continue
    const [heading, body] = m.text(T[u.lang === 'en' ? 'en' : 'it'])
    for (const d of list('users/' + m.uid + '/devices'))
      requests.push({
        url: 'https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send',
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + access() },
        muteHttpExceptions: true,
        // the card of the tournament is in Home, unless told otherwise; a newer one of this tournament replaces it
        payload: JSON.stringify({
          message: {
            token: key(d),
            data: { title: heading, body, url: m.url || '#home', tag: m.tag || 'tour-' + id },
            webpush: { headers: { TTL: String(TTL), Urgency: 'high' } },
          },
        }),
      })
  }
  // a device that uninstalled the app answers 404: the nightly notifications (scripts/notify.mjs) drop its token
  if (!requests.length) return 0
  return UrlFetchApp.fetchAll(requests).filter((r) => r.getResponseCode() === 200).length
}

/**
 * Run it from the editor (Run → checkSetup) to check the setup without a tournament: the key in SERVICE_ACCOUNT gives
 * an access token, Firestore answers, and Firebase Messaging accepts this service account (a dry run, nothing sent).
 */
function checkSetup() {
  console.log('Chiave: ok. Firestore: ' + list('tournaments').length + ' tornei in app.')
  const res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + access() },
    muteHttpExceptions: true,
    payload: JSON.stringify({ validate_only: true, message: { token: 'prova', data: { title: 'prova' } } }),
  })
  // a made-up device is refused (400): what counts is being let in at all (403: the role is missing)
  console.log(res.getResponseCode() === 403 ? 'Messaging: manca il ruolo Amministratore API Firebase Cloud Messaging.' : 'Messaging: ok.')
}

// ---------- Firestore, as the service account ----------

function get(path) {
  const res = UrlFetchApp.fetch(DOCS + path, { headers: { Authorization: 'Bearer ' + access() }, muteHttpExceptions: true })
  if (res.getResponseCode() === 404) return null
  if (res.getResponseCode() !== 200) throw new Error('Firestore ha risposto ' + res.getResponseCode())
  return fieldsOf(JSON.parse(res.getContentText()))
}

function list(path) {
  const res = UrlFetchApp.fetch(DOCS + path + '?pageSize=300', { headers: { Authorization: 'Bearer ' + access() }, muteHttpExceptions: true })
  if (res.getResponseCode() !== 200) throw new Error('Firestore ha risposto ' + res.getResponseCode())
  return JSON.parse(res.getContentText()).documents || []
}

/** The documents of a tournament's collection whose field is this number. */
function query(id, collection, field, value) {
  const res = UrlFetchApp.fetch(DOCS + 'tournaments/' + id + ':runQuery', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + access() },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { integerValue: String(value) } } },
      },
    }),
  })
  if (res.getResponseCode() !== 200) throw new Error('Firestore ha risposto ' + res.getResponseCode())
  return JSON.parse(res.getContentText()).filter((r) => r.document).map((r) => fieldsOf(r.document))
}

const key = (doc) => decodeURIComponent(doc.name.split('/').pop())

/** The service account's access token, kept for most of its hour. */
function access() {
  const cache = CacheService.getScriptCache()
  const hit = cache.get('access')
  if (hit) return hit
  const sa = JSON.parse(PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT'))
  const now = Math.floor(Date.now() / 1000)
  const b64 = (s) => Utilities.base64EncodeWebSafe(s).replace(/=+$/, '')
  const unsigned =
    b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    )
  const jwt = unsigned + '.' + b64(Utilities.computeRsaSha256Signature(unsigned, sa.private_key))
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
  })
  const token = JSON.parse(res.getContentText()).access_token
  cache.put('access', token, 3000)
  return token
}

// ---------- Firestore's values ----------

function plain(v) {
  if ('integerValue' in v) return Number(v.integerValue)
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain)
  if ('mapValue' in v) return fieldsOf(v.mapValue)
  return null
}

function fieldsOf(doc) {
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, plain(v)]))
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}
