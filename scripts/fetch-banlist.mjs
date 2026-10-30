// Reads the Centurion banlist from the format's site and writes it to the file given as argument (banlist.json, published
// on the meta-data branch by .github/workflows/meta.yml and read by the app, src/lib/banlist.ts).
//
// The page lists each card as a Scryfall link under three headings: banned as commander, banned as partner or
// companion, banned everywhere. The date is the latest "Banlist Update" post's, from the site's WordPress API.
// Every name is checked on Scryfall and written with Scryfall's spelling. Fails, writing nothing, when the page
// doesn't read as a banlist (a heading gone, a list much shorter, an unknown card), so the app keeps the last good one.
// Ante, physical and subgame cards are the format's rules rather than its banlist: they stay in src/lib/banlist.ts.

import { writeFileSync } from 'node:fs'

// one clean line on failure: the update's report shows it in the app's admin area
process.on('uncaughtException', (e) => {
  console.error(e.message)
  process.exit(1)
})

const PAGE = 'https://www.centurioncommander.eu/it/ban-list-it/'
const POSTS = 'https://www.centurioncommander.eu/wp-json/wp/v2/posts?per_page=10&search=banlist&_fields=date,title,link'
const HEADERS = { 'User-Agent': 'castra-banlist/1.0 (+https://github.com/AndreaBaudino/castra)' }
const out = process.argv[2]
if (!out) {
  console.error('Uso: node scripts/fetch-banlist.mjs <file di uscita>')
  process.exit(1)
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

async function get(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

// ---------- the page ----------

const html = await (await get(PAGE)).text()
const SECTIONS = {
  commander: /Carte vietate solo come Comandante/i,
  partner: /Carte vietate solo come partner/i,
  banned: /Carte vietate in tutte le partite/i,
}
const END = /Ultimi aggiornamenti/i

// where each heading starts: a section runs to the next of these headings
const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map((m) => ({ at: m.index, text: decode(m[1]) }))
const starts = Object.fromEntries(
  Object.entries(SECTIONS).map(([k, re]) => {
    const h = headings.find((x) => re.test(x.text))
    if (!h) throw new Error(`titolo "${re.source}" non trovato nella pagina`)
    return [k, h.at]
  }),
)
const end = headings.find((x) => END.test(x.text))?.at ?? html.length
const bounds = [...Object.values(starts), end].sort((a, b) => a - b)

const lists = {}
for (const [k, at] of Object.entries(starts)) {
  const part = html.slice(at, bounds.find((b) => b > at))
  // the card lists only: the gallery hidden below them repeats the same cards as pictures
  const names = [...part.matchAll(/<li class="jet-listing-dynamic-repeater__item">[\s\S]*?<a[^>]*class="scryfall_link"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => decode(m[1]))
  lists[k] = [...new Set(names)]
}

// a page that changed shape reads as a much shorter list: better to keep the last good one
if (lists.banned.length < 30) throw new Error(`solo ${lists.banned.length} carte vietate lette: la pagina è cambiata?`)
if (!lists.commander.length) throw new Error('nessuna carta vietata come comandante letta: la pagina è cambiata?')

// ---------- every name on Scryfall ----------

const all = [...new Set(Object.values(lists).flat())]
const known = new Map()
for (let i = 0; i < all.length; i += 75) {
  const chunk = all.slice(i, i + 75)
  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identifiers: chunk.map((name) => ({ name: name.replace(/[’‘]/g, "'") })) }),
  })
  if (!res.ok) throw new Error(`Scryfall: HTTP ${res.status}`)
  const data = await res.json()
  const norm = (s) => s.replace(/[’‘]/g, "'").toLowerCase()
  for (const c of data.data) {
    const name = chunk.find((n) => norm(n) === norm(c.name) || norm(n) === norm(c.name.split(' // ')[0]))
    if (name) known.set(name, c.name)
  }
  await new Promise((r) => setTimeout(r, 120))
}
const unknown = all.filter((n) => !known.has(n))
if (unknown.length) throw new Error(`carte non trovate su Scryfall: ${unknown.join(', ')}`)
for (const k of Object.keys(lists)) lists[k] = lists[k].map((n) => known.get(n)).sort((a, b) => a.localeCompare(b))

// ---------- the latest announcement ----------

let announcement = null
try {
  const posts = await (await get(POSTS)).json()
  const update = posts.filter((p) => /ban ?list update/i.test(decode(p.title.rendered))).sort((a, b) => b.date.localeCompare(a.date))
  // the Italian post when there is one for that day
  const latest = update.find((p) => p.date === update[0]?.date && p.link.includes('/it/')) ?? update[0]
  if (latest) announcement = { date: latest.date.slice(0, 10), title: decode(latest.title.rendered), url: latest.link }
} catch (e) {
  console.warn(`Annuncio non letto (${e.message}): la banlist si pubblica lo stesso`)
}

const banlist = { v: 1, checked: new Date().toISOString(), announcement, ...lists }
writeFileSync(out, JSON.stringify(banlist, null, 1) + '\n')
console.log(
  `Banlist: ${lists.banned.length} vietate, ${lists.commander.length} vietate come comandante, ${lists.partner.length} come partner` +
    (announcement ? ` (ultimo annuncio ${announcement.date})` : ''),
)
