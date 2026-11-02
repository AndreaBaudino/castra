// Push notifications, sent by .github/workflows/notify.yml: in the morning the banlist and the admin area, in the
// evening the circuit and the admin area. Each run compares with what the previous one saw (notify/state on
// Firestore, read only by this script) and sends to the devices of the accounts that turned that kind on (their
// prefs, src/lib/push.ts). Run with vite-node, so the circuit and the banlist are read with the app's own code:
//   npx vite-node scripts/notify.mjs morning|evening [--dry]
// --dry prints the notifications instead of sending them, and saves nothing.

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { CIRCUIT_SHEET_ID, CIRCUIT_TABS, FIREBASE_CONFIG, POTY_SPOTS } from '../src/config'
import { fetchCircuit, noticeOf, snapshotOf } from '../src/lib/circuit'
import { BAN_LISTS, banlistMinus } from '../src/lib/banlist'

const evening = process.argv[2] === 'evening'
const dry = process.argv.includes('--dry')
initializeApp({ projectId: FIREBASE_CONFIG.projectId }) // credentials: GOOGLE_APPLICATION_CREDENTIALS
const db = getFirestore()
const stateRef = db.doc('notify/state')
const state = (await stateRef.get()).data() ?? {}
const next = { ...state }
const out = [] // { uid, lang, title, body, url, tag }

// the texts, in the account's language
const T = {
  it: {
    me: (to, d) => `Sei ${to}° nel circuito${d ? ` (${d})` : ''}`,
    ranking: 'Classifica aggiornata',
    points: (n) => `+${n} punti`,
    others: (n) => `e altri ${n}`,
    banlist: 'Banlist aggiornata',
    banned: 'Vietate',
    allowed: 'Riammesse',
    banlistBody: 'Apri Castra per vedere cosa cambia.',
    admin: 'Area admin',
    reports: (n) => (n === 1 ? '1 segnalazione' : `${n} segnalazioni`),
    claims: (n) => (n === 1 ? '1 giocatore collegato' : `${n} giocatori collegati`),
    toSee: (s) => `${s} da vedere`,
    and: 'e',
  },
  en: {
    me: (to, d) => `You're #${to} in the circuit${d ? ` (${d})` : ''}`,
    ranking: 'Ranking updated',
    points: (n) => `+${n} points`,
    others: (n) => `and ${n} more`,
    banlist: 'Banlist updated',
    banned: 'Banned',
    allowed: 'Allowed again',
    banlistBody: 'Open Castra to see what changes.',
    admin: 'Admin area',
    reports: (n) => (n === 1 ? '1 report' : `${n} reports`),
    claims: (n) => (n === 1 ? '1 linked player' : `${n} linked players`),
    toSee: (s) => `${s} to check`,
    and: 'and',
  },
}
const textOf = (u) => T[u.lang === 'en' ? 'en' : 'it']
const usersWith = async (pref) => (await db.collection('users').where(`prefs.${pref}`, '==', true).get()).docs.map((d) => ({ uid: d.id, ...d.data() }))
const list = (names, t, max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` ${t.others(names.length - max)}` : '')
const moved = (from, to) => (from === to ? '' : from > to ? `+${from - to}` : `−${to - from}`)

// ---------- banlist (morning): what the admins published since ----------

if (!evening) {
  const doc = (await db.doc('config/banlist').get()).data()
  if (doc && state.banlist && doc.json !== state.banlist) {
    const [now, before] = [JSON.parse(doc.json), JSON.parse(state.banlist)]
    const [added, removed] = [banlistMinus(now, before), banlistMinus(before, now)].map((x) => [...new Set(BAN_LISTS.flatMap((k) => x[k]))])
    if (added.length || removed.length)
      for (const u of await usersWith('notifyBanlist')) {
        const t = textOf(u)
        const body = [added.length && `${t.banned}: ${list(added, t, 4)}`, removed.length && `${t.allowed}: ${list(removed, t, 4)}`].filter(Boolean).join(' · ')
        out.push({ uid: u.uid, title: t.banlist, body: body || t.banlistBody, url: '#home', tag: 'banlist' })
      }
  }
  if (doc) next.banlist = doc.json
}

// ---------- circuit (evening): the newest year's ranking, as the app reads it ----------

if (evening) {
  const sheets = (await db.collection('circuits').get()).docs.map((d) => d.data())
  // a published sheet replaces the one shipped with the app (src/lib/circuits.ts)
  const sheet = [...sheets, { year: 2026, sheet: CIRCUIT_SHEET_ID, tabs: CIRCUIT_TABS, poty: POTY_SPOTS }].sort((a, b) => b.year - a.year)[0]
  const c = await fetchCircuit(sheet)
  const prev = state.circuit // { year, players: [{ key, rank, total }], events: [{ name }] }: enough for snapshotOf
  if (prev)
    for (const u of await usersWith('notifyCircuit')) {
      const n = noticeOf(snapshotOf(prev, u.circuitMe ?? null, u.circuitFollow ?? []), snapshotOf(c, u.circuitMe ?? null, u.circuitFollow ?? []), c)
      if (!n || (!n.me && !n.follow.length)) continue // only new events: nothing about the user
      const t = textOf(u)
      const follow = n.follow.map((f) => {
        const why = f.from !== f.to ? moved(f.from, f.to) : f.points > 0 ? `+${f.points} pt` : ''
        return `${f.name} ${u.lang === 'en' ? `#${f.to}` : `${f.to}°`}${why ? ` (${why})` : ''}`
      })
      out.push({
        uid: u.uid,
        title: n.me ? t.me(n.me.to, moved(n.me.from, n.me.to)) : t.ranking,
        body: [n.me?.points > 0 && t.points(n.me.points), follow.length && list(follow, t)].filter(Boolean).join(' · ') || t.ranking,
        url: '?ranking',
        tag: 'circuit',
      })
    }
  next.circuit = {
    year: c.year,
    players: c.players.map((p) => ({ key: p.key, rank: p.rank, total: p.total })),
    events: c.events.map((e) => ({ name: e.name })),
  }
}

// ---------- admin area (both): reports and linked players since the last run ----------

const now = new Date().toISOString()
if (state.adminAt) {
  const since = (name) => db.collection(name).where('at', '>', state.adminAt).get()
  const [fb, cl] = await Promise.all([since('feedback'), since('claims')])
  const reports = fb.docs.filter((d) => !d.data().done).length
  const claims = cl.docs.filter((d) => !d.data().verified).length
  if (reports || claims) {
    const admins = new Set((await db.collection('admins').get()).docs.map((d) => d.id))
    for (const u of await usersWith('notifyAdmin')) {
      if (!admins.has(u.uid)) continue
      const t = textOf(u)
      const what = [reports && t.reports(reports), claims && t.claims(claims)].filter(Boolean).join(` ${t.and} `)
      out.push({ uid: u.uid, title: t.admin, body: t.toSee(what), url: '#account/admin', tag: 'admin' })
    }
  }
}
next.adminAt = now

// ---------- send ----------

let sent = 0
for (const m of out) {
  const devices = (await db.collection(`users/${m.uid}/devices`).get()).docs
  if (dry) {
    console.log(`${m.uid} (${devices.length} dispositivi): ${m.title} — ${m.body} → ${m.url}`)
    continue
  }
  if (!devices.length) continue
  const { uid: _, ...data } = m
  const res = await getMessaging().sendEach(
    devices.map((d) => ({ token: d.id, data, webpush: { headers: { TTL: String(12 * 3600), Urgency: 'normal' } } })),
  )
  sent += res.successCount
  // a device that uninstalled the app or revoked the permission: its token won't work again
  await Promise.all(
    res.responses.map((r, i) =>
      ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code) ? devices[i].ref.delete() : null,
    ),
  )
}
console.log(`${evening ? 'sera' : 'mattina'}: ${out.length} notifiche, ${sent} consegnate ai dispositivi${dry ? ' (prova: niente inviato né salvato)' : ''}`)
if (!dry) await stateRef.set(next)
