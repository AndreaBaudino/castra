import type { AppUser } from './auth'
import { type Banlist, cardKey, setBanlist } from './banlist'
import { fb } from './firebase'

// The admin area's banlist update: reads the banlist from the format's site, checks every card on Scryfall, and
// publishes it at config/banlist on Firestore, where every app reads it (src/lib/banlist.ts).
//
// The site's page can't be read from another site, but its WordPress API can: the page's content lists each card as
// a Scryfall link under three headings (banned as commander, as partner or companion, everywhere); the date is the
// latest "Banlist Update" post's. A page that doesn't read as a banlist (a heading gone, a much shorter list, an
// unknown card) is an error, not a banlist to publish. Ante, physical and subgame cards are the format's rules
// rather than its banlist: they stay in src/lib/banlist.ts.

const SITE = 'https://www.centurioncommander.eu/wp-json/wp/v2'
const PAGE = `${SITE}/pages?slug=ban-list-it&_fields=content`
const POSTS = `${SITE}/posts?per_page=10&search=banlist&_fields=date,title,link`

const SECTIONS = {
  commander: /Carte vietate solo come Comandante/i,
  partner: /Carte vietate solo come partner/i,
  banned: /Carte vietate in tutte le partite/i,
} as const
const END = /Ultimi aggiornamenti/i
export type BanList = keyof typeof SECTIONS
export const BAN_LISTS: BanList[] = ['banned', 'commander', 'partner']

const text = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? ''

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache', ...init })
  if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`)
  return res.json()
}

function parsePage(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lists: Record<BanList, string[]> = { banned: [], commander: [], partner: [] }
  const found = new Set<BanList>()
  let section: BanList | null = null
  // headings and card links in page order: each card goes in the list of the heading above it. The card lists
  // only: the gallery hidden below them repeats the same cards as pictures.
  for (const el of doc.querySelectorAll('h1, h2, h3, h4, h5, h6, li.jet-listing-dynamic-repeater__item a.scryfall_link')) {
    const t = el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (el.tagName !== 'A') {
      if (END.test(t)) break
      const k = (Object.keys(SECTIONS) as BanList[]).find((s) => SECTIONS[s].test(t))
      if (k) found.add((section = k))
    } else if (section && t && !lists[section].includes(t)) lists[section].push(t)
  }
  const missing = BAN_LISTS.filter((k) => !found.has(k))
  if (missing.length) throw new Error(`titoli non trovati nella pagina: ${missing.map((k) => SECTIONS[k].source).join(', ')}`)
  // a page that changed shape reads as a much shorter list: better to keep the banlist in use
  if (lists.banned.length < 30) throw new Error(`solo ${lists.banned.length} carte vietate lette: la pagina è cambiata?`)
  if (!lists.commander.length) throw new Error('nessuna carta vietata come comandante letta: la pagina è cambiata?')
  return lists
}

/** Every name with Scryfall's spelling; fails on a name Scryfall doesn't know. */
async function scryfallNames(names: string[]) {
  const norm = (s: string) => s.replace(/[’‘]/g, "'").toLowerCase()
  const known = new Map<string, string>()
  for (let i = 0; i < names.length; i += 75) {
    const chunk = names.slice(i, i + 75)
    const data = await json<{ data: { name: string }[] }>('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name: name.replace(/[’‘]/g, "'") })) }),
    })
    for (const c of data.data) {
      const name = chunk.find((n) => norm(n) === norm(c.name) || norm(n) === norm(c.name.split(' // ')[0]))
      if (name) known.set(name, c.name)
    }
  }
  const unknown = names.filter((n) => !known.has(n))
  if (unknown.length) throw new Error(`carte non trovate su Scryfall: ${unknown.join(', ')}`)
  return known
}

async function latestAnnouncement(): Promise<Banlist['announcement']> {
  try {
    const posts = await json<{ date: string; link: string; title: { rendered: string } }[]>(POSTS)
    const updates = posts.filter((p) => /ban ?list update/i.test(text(p.title.rendered))).sort((a, b) => b.date.localeCompare(a.date))
    // the Italian post when there is one for that day
    const latest = updates.find((p) => p.date === updates[0]?.date && p.link.includes('/it/')) ?? updates[0]
    return latest ? { date: latest.date.slice(0, 10), title: text(latest.title.rendered), url: latest.link } : null
  } catch {
    return null // the banlist counts more than its date
  }
}

/** The banlist as the site shows it now. */
export async function readSiteBanlist(): Promise<Banlist> {
  const [page] = await json<{ content: { rendered: string } }[]>(PAGE)
  if (!page) throw new Error('pagina della banlist non trovata sul sito')
  const lists = parsePage(page.content.rendered)
  const known = await scryfallNames([...new Set(BAN_LISTS.flatMap((k) => lists[k]))])
  const sorted = (k: BanList) => lists[k].map((n) => known.get(n)!).sort((a, b) => a.localeCompare(b))
  return { v: 1, checked: new Date().toISOString(), announcement: await latestAnnouncement(), banned: sorted('banned'), commander: sorted('commander'), partner: sorted('partner') }
}

/** Cards in `a` and not in `b`, list by list ("Tamiyo, Inquisitive Student" is "Tamiyo, Inquisitive Student // …"). */
export const banlistMinus = (a: Banlist, b: Banlist) =>
  Object.fromEntries(
    BAN_LISTS.map((k) => {
      const inB = new Set(b[k].map(cardKey))
      return [k, a[k].filter((n) => !inB.has(cardKey(n)))]
    }),
  ) as Record<BanList, string[]>

/** Publishes the banlist for every app, and uses it here at once. */
export async function publishBanlist(admin: AppUser, b: Banlist) {
  const { db, fs } = await fb()
  await fs.setDoc(fs.doc(db, 'config', 'banlist'), { json: JSON.stringify(b), at: new Date().toISOString(), by: admin.uid })
  setBanlist(b)
}
