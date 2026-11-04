import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// The Apps Script that sends the tournament notifications (scripts/notify/apps-script/Code.gs), run here against a
// Firestore kept in memory (its REST API) and a Firebase Messaging that only records what it's asked to send.

const code = readFileSync(new URL('../../scripts/notify/apps-script/Code.gs', import.meta.url), 'utf8')
const ID = '1Qck40xjQ_zODQtI3YY6qFGFq1adeHsMiUCwPIhZ7mvw~4'
const DOCS = 'https://firestore.googleapis.com/v1/projects/castra-a69ab/databases/(default)/documents/'

// a value as Firestore's REST API sends it
const enc = (v: unknown): object =>
  typeof v === 'number'
    ? { integerValue: String(v) }
    : typeof v === 'string'
      ? { stringValue: v }
      : typeof v === 'boolean'
        ? { booleanValue: v }
        : v == null
          ? { nullValue: null }
          : Array.isArray(v)
            ? { arrayValue: { values: v.map(enc) } }
            : { mapValue: { fields: fields(v as object) } }
const fields = (o: object) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]))

function setup() {
  const db = new Map<string, object>([
    [`tournaments/${ID}`, { name: 'Savona', stage: 4, status: 'swiss', round: 2, rounds: 4, cut: 0, started: 'T1', by: 'gina' }],
    [`tournaments/${ID}/players/mia`, { name: 'Mia', commander: 'Kinnan, Bonder Prodigy', uid: 'kim' }],
    [`tournaments/${ID}/players/nina`, { name: 'Nina', commander: 'Atraxa, Grand Unifier', uid: 'lea' }],
    [`tournaments/${ID}/players/mario rossi`, { name: 'Mario Rossi', commander: 'Spider-Man 2099' }], // added by the TO
    [`tournaments/${ID}/players/pat`, { name: 'Pat', commander: 'Kraum / Tymna', uid: 'pam' }],
    [`tournaments/${ID}/matches/r1t1`, { round: 1, table: 1, p1: 'mia', p2: 'pat', score: [2, 0, 0] }],
    [`tournaments/${ID}/matches/r2t1`, { round: 2, table: 1, p1: 'nina', p2: 'mia', score: null }],
    [`tournaments/${ID}/matches/r2t0`, { round: 2, table: 0, p1: 'pat', p2: null, score: null }],
    [`tournaments/${ID}/matches/r2t2`, { round: 2, table: 2, p1: 'mario rossi', p2: 'x', score: null }],
    ['users/kim', { lang: 'it', prefs: { notifyTournaments: true } }],
    ['users/lea', { lang: 'en', prefs: { notifyTournaments: true } }],
    ['users/pam', { lang: 'it', prefs: { notifyTournaments: false } }], // turned off
    ['users/gina', { lang: 'it', prefs: { notifyTournaments: true } }], // the TO
    ['users/gina/devices/tok-gina', { at: 'x' }],
    ['users/kim/devices/tok-kim', { at: 'x' }],
    ['users/lea/devices/tok-lea', { at: 'x' }],
    ['users/lea/devices/tok-lea-2', { at: 'x' }],
    ['users/pam/devices/tok-pam', { at: 'x' }],
  ])
  const doc = (path: string) => ({ name: `projects/castra-a69ab/databases/(default)/documents/${path}`, fields: fields(db.get(path)!) })
  const sent: { token: string; title: string; body: string; url: string; tag: string }[] = []
  const cache = new Map<string, string>()
  const res = (code: number, body: unknown = {}) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) })
  const answer = (url: string, opt: { method?: string; headers?: { Authorization?: string }; payload?: string | object } = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') return res(200, { access_token: 'sa' })
    if (url.startsWith('https://fcm.googleapis.com/')) {
      const { message } = JSON.parse(opt.payload as string)
      sent.push({ token: message.token, ...message.data })
      return res(200)
    }
    const auth = opt.headers?.Authorization
    if (auth === 'Bearer expired') return res(401)
    const path = decodeURIComponent(url.slice(DOCS.length).split('?')[0])
    // the write that changes nothing: the rules let only the TO (`to`) through
    if (opt.method === 'patch') return res(auth === 'Bearer to' && path === `tournaments/${ID}` ? 200 : 403)
    // a sign-in reads only the tournament; every other read is the service account's
    if (auth !== 'Bearer sa' && !(['Bearer tok', 'Bearer to'].includes(auth!) && path === `tournaments/${ID}`)) return res(403)
    if (path.endsWith(':runQuery')) {
      const parent = path.slice(0, -':runQuery'.length)
      const { from, where } = JSON.parse(opt.payload as string).structuredQuery
      const value = Number(where.fieldFilter.value.integerValue)
      const docs = [...db.keys()].filter((k) => k.startsWith(`${parent}/${from[0].collectionId}/`) && (db.get(k) as Record<string, unknown>)[where.fieldFilter.field.fieldPath] === value)
      return res(200, docs.length ? docs.map((k) => ({ document: doc(k) })) : [{ readTime: 'x' }])
    }
    if (db.has(path)) return res(200, doc(path))
    const kids = [...db.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'))
    return kids.length ? res(200, { documents: kids.map(doc) }) : res(404)
  }
  const ctx = {
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => void cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => JSON.stringify({ client_email: 'castra-notify@x', private_key: 'k' }) }) },
    Utilities: { base64EncodeWebSafe: (s: string | number[]) => Buffer.from(typeof s === 'string' ? s : Uint8Array.from(s)).toString('base64url'), computeRsaSha256Signature: () => [1, 2, 3] },
    UrlFetchApp: { fetch: answer, fetchAll: (rs: ({ url: string } & Parameters<typeof answer>[1])[]) => rs.map((r) => answer(r.url, r)) },
    ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
  }
  runInNewContext(code, ctx)
  const post = (body: unknown) => JSON.parse((ctx as unknown as { doPost: (e: unknown) => string }).doPost({ postData: { contents: JSON.stringify(body) } }))
  return { db, sent, post }
}

describe('tournament notifications (Apps Script)', () => {
  it("sends the round's pairings to every player with the app and the notifications on, in their language", () => {
    const { sent, post } = setup()
    expect(post({ token: 'tok', id: ID, action: 'round' })).toEqual({ ok: true, sent: 3 })
    expect(sent).toEqual([
      { token: 'tok-lea', title: 'Savona · stage 4 · round 2', body: 'Table 1 against Mia (Kinnan, Bonder Prodigy)', url: '#home', tag: `tour-${ID}` },
      { token: 'tok-lea-2', title: 'Savona · stage 4 · round 2', body: 'Table 1 against Mia (Kinnan, Bonder Prodigy)', url: '#home', tag: `tour-${ID}` },
      { token: 'tok-kim', title: 'Savona · tappa 4 · turno 2', body: 'Tavolo 1 contro Nina (Atraxa, Grand Unifier)', url: '#home', tag: `tour-${ID}` },
    ]) // pam (the bye) turned them off; Mario Rossi has no account
  })

  it('sends a round once, and again once it is paired again', () => {
    const { db, sent, post } = setup()
    post({ token: 'tok', id: ID, action: 'round' })
    expect(post({ token: 'tok', id: ID, action: 'round' })).toEqual({ ok: true, sent: 0 })
    db.set(`tournaments/${ID}`, { ...db.get(`tournaments/${ID}`), started: 'T2' })
    expect(post({ token: 'tok', id: ID, action: 'round' }).sent).toBe(3)
    expect(sent).toHaveLength(6)
  })

  it('tells the bye, and the top cut its own rounds', () => {
    const { db, sent, post } = setup()
    db.set('users/pam', { lang: 'it', prefs: { notifyTournaments: true } })
    db.set(`tournaments/${ID}`, { name: 'Genova L2', status: 'cut', round: 5, rounds: 4, cut: 8, started: 'T3' })
    db.set(`tournaments/${ID}/matches/r5t0`, { round: 5, table: 0, p1: 'pat', p2: null, score: null })
    post({ token: 'tok', id: ID, action: 'round' })
    expect(sent).toEqual([
      { token: 'tok-pam', title: 'Genova L2 · top cut, turno 1', body: 'Sei nella top 8. Hai il bye: 3 punti, come una vittoria 2-0.', url: '#home', tag: `tour-${ID}` },
    ])
    // the next rounds of the top cut: no "top 8" any more
    db.set(`tournaments/${ID}`, { name: 'Genova L2', status: 'cut', round: 6, rounds: 4, cut: 8, started: 'T4' })
    db.set(`tournaments/${ID}/matches/r6t0`, { round: 6, table: 0, p1: 'pat', p2: null, score: null })
    post({ token: 'tok', id: ID, action: 'round' })
    expect(sent[1].body).toBe('Hai il bye: 3 punti, come una vittoria 2-0.')
  })

  it('sends nothing before the first round', () => {
    const { db, post } = setup()
    db.set(`tournaments/${ID}`, { name: 'Savona', stage: 4, status: 'open', round: 0, rounds: 0, started: null })
    expect(post({ token: 'tok', id: ID, action: 'round' })).toEqual({ ok: true, sent: 0 })
  })

  it('sends a result entered by one player to the other, with their own games first, once', () => {
    const { db, sent, post } = setup()
    db.set(`tournaments/${ID}/matches/r2t1`, { round: 2, table: 1, p1: 'nina', p2: 'mia', score: [2, 1, 0], reportedBy: 'nina', confirmed: false })
    expect(post({ token: 'tok', id: ID, action: 'report', match: 'r2t1' })).toEqual({ ok: true, sent: 1 })
    expect(sent).toEqual([{ token: 'tok-kim', title: 'Savona · tappa 4', body: 'Nina ha segnato 1-2 per te: confermalo o correggilo.', url: '#home', tag: `tour-${ID}` }])
    expect(post({ token: 'tok', id: ID, action: 'report', match: 'r2t1' }).sent).toBe(0)
    // entered again, otherwise: a new one
    db.set(`tournaments/${ID}/matches/r2t1`, { round: 2, table: 1, p1: 'nina', p2: 'mia', score: [2, 0, 0], reportedBy: 'nina', confirmed: false })
    expect(post({ token: 'tok', id: ID, action: 'report', match: 'r2t1' }).sent).toBe(1)
  })

  it('sends no result already confirmed, nor one the TO entered', () => {
    const { db, post } = setup()
    db.set(`tournaments/${ID}/matches/r2t1`, { round: 2, table: 1, p1: 'nina', p2: 'mia', score: [2, 1, 0], reportedBy: 'nina', confirmed: true })
    expect(post({ token: 'tok', id: ID, action: 'report', match: 'r2t1' }).sent).toBe(0)
    db.set(`tournaments/${ID}/matches/r2t1`, { round: 2, table: 1, p1: 'nina', p2: 'mia', score: [2, 1, 0] })
    expect(post({ token: 'tok', id: ID, action: 'report', match: 'r2t1' }).sent).toBe(0)
  })

  it('tells the TO who opened the tournament of a registration waiting, with how many are waiting', () => {
    const { db, sent, post } = setup()
    db.set(`tournaments/${ID}/players/luca`, { name: 'Luca Bianchi', commander: 'Kraum / Tymna', uid: 'lu', pending: true, at: 'A1' })
    expect(post({ token: 'tok', id: ID, action: 'request', player: 'luca' }).sent).toBe(1)
    expect(post({ token: 'tok', id: ID, action: 'request', player: 'luca' }).sent).toBe(0) // once
    db.set(`tournaments/${ID}/players/ugo`, { name: 'Ugo', commander: 'Atraxa, Grand Unifier', uid: 'ug', pending: true, at: 'A2' })
    post({ token: 'tok', id: ID, action: 'request', player: 'ugo' })
    expect(sent).toEqual([
      { token: 'tok-gina', title: 'Savona · tappa 4', body: 'Nuova richiesta di iscrizione: Luca Bianchi', url: `#to/${ID}`, tag: `tour-req-${ID}` },
      { token: 'tok-gina', title: 'Savona · tappa 4', body: "2 richieste di iscrizione da confermare, l'ultima di Ugo", url: `#to/${ID}`, tag: `tour-req-${ID}` },
    ])
    expect(post({ token: 'tok', id: ID, action: 'request', player: 'mia' }).sent).toBe(0) // not waiting
  })

  it('tells a player their registration was confirmed, only once it is', () => {
    const { db, sent, post } = setup()
    db.set(`tournaments/${ID}/players/nina`, { name: 'Nina', commander: 'Atraxa, Grand Unifier', uid: 'lea', pending: true })
    expect(post({ token: 'tok', id: ID, action: 'accepted', player: 'nina' }).sent).toBe(0)
    db.set(`tournaments/${ID}/players/nina`, { name: 'Nina', commander: 'Atraxa, Grand Unifier', uid: 'lea' })
    expect(post({ token: 'tok', id: ID, action: 'accepted', player: 'nina' }).sent).toBe(2) // her two phones
    expect(sent[0]).toEqual({ token: 'tok-lea', title: 'Savona · stage 4', body: 'The TO confirmed your registration.', url: '#home', tag: `tour-${ID}` })
  })

  it("tells each player their final place, only when the TO who runs it sends it, once it's over", () => {
    const { db, sent, post } = setup()
    const order = ['nina', 'mario rossi', 'mia', 'pat']
    expect(post({ token: 'to', id: ID, action: 'done', order }).sent).toBe(0) // still being played
    db.set(`tournaments/${ID}`, { ...db.get(`tournaments/${ID}`), status: 'done' })
    expect(post({ token: 'tok', id: ID, action: 'done', order: ['mia'] })).toEqual({ ok: false, error: 'non gestisci questo torneo' })
    expect(post({ token: 'to', id: ID, action: 'done', order }).sent).toBe(3)
    expect(post({ token: 'to', id: ID, action: 'done', order }).sent).toBe(0) // once
    expect(sent.map((m) => [m.token, m.body, m.url])).toEqual([
      ['tok-lea', 'Tournament over: you placed #1 of 4. Tap for the final standings.', `#live/${ID}`],
      ['tok-lea-2', 'Tournament over: you placed #1 of 4. Tap for the final standings.', `#live/${ID}`],
      ['tok-kim', 'Torneo concluso: sei 3° su 4. Tocca per la classifica finale.', `#live/${ID}`],
    ])
  })

  it('answers only to a signed-in caller, and to well-formed requests', () => {
    const { sent, post } = setup()
    expect(post({ token: 'expired', id: ID, action: 'round' }).ok).toBe(false)
    expect(post({ id: ID, action: 'round' }).ok).toBe(false)
    expect(post({ token: 'tok', id: '../users/kim', action: 'round' }).ok).toBe(false)
    expect(post({ token: 'tok', id: ID, action: 'report', match: '../../users' }).ok).toBe(false)
    expect(post({ token: 'tok', id: ID, action: 'other' }).ok).toBe(false)
    expect(post({ token: 'tok', id: ID, action: 'accepted' }).ok).toBe(false)
    expect(post({ token: 'to', id: ID, action: 'done', order: 'mia' }).ok).toBe(false)
    expect(sent).toHaveLength(0)
  })
})
