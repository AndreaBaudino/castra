import type { CardInfo } from './decks'

// Scryfall's public API: free, CORS-enabled. Please keep requests light (≤10/s).
const API = 'https://api.scryfall.com'

interface ScryCard {
  id: string
  name: string
  type_line?: string
  mana_cost?: string
  cmc?: number
  color_identity?: string[]
  set?: string
  set_name?: string
  collector_number?: string
  released_at?: string
  produced_mana?: string[]
  keywords?: string[]
  image_uris?: { normal: string; art_crop: string }
  card_faces?: { mana_cost?: string; type_line?: string; image_uris?: { normal: string; art_crop: string } }[]
  prices?: { eur?: string | null; eur_foil?: string | null; usd?: string | null }
  purchase_uris?: { cardmarket?: string }
}

// what lets two cards share the command zone
const PAIRING = ['partner', 'partner with', 'friends forever', "doctor's companion", 'choose a background']
const isPartner = (c: ScryCard) =>
  !!c.keywords?.some((k) => PAIRING.includes(k.toLowerCase())) || /\bbackground\b/i.test(c.type_line ?? '')

function toInfo(c: ScryCard): CardInfo {
  const face = c.card_faces?.[0]
  const img = c.image_uris ?? face?.image_uris
  return {
    id: c.id,
    name: c.name,
    typeLine: c.type_line ?? face?.type_line ?? '',
    manaCost: c.mana_cost || face?.mana_cost || '',
    cmc: c.cmc ?? 0,
    colorIdentity: c.color_identity ?? [],
    image: img?.normal,
    art: img?.art_crop,
    set: c.set,
    setName: c.set_name,
    cn: c.collector_number,
    produced: c.produced_mana ?? [],
    ...(isPartner(c) ? { partner: true } : {}),
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface CardRequest {
  name: string
  set?: string
  cn?: string
}

export const requestKey = (r: CardRequest) => `${r.name.toLowerCase()}|${r.set ?? ''}|${r.cn ?? ''}`

type Identifier = { name: string } | { name: string; set: string } | { set: string; collector_number: string }

// split cards are exported as "A // B": Scryfall matches on the front face too
const front = (name: string) => name.split(' // ')[0]

const identifierOf = (r: CardRequest, withEdition: boolean): Identifier =>
  withEdition && r.set && r.cn
    ? { set: r.set, collector_number: r.cn }
    : withEdition && r.set
      ? { name: front(r.name), set: r.set }
      : { name: front(r.name) }

async function collection(reqs: CardRequest[], withEdition: boolean) {
  const found = new Map<string, CardInfo>()
  const missing: CardRequest[] = []
  for (let i = 0; i < reqs.length; i += 75) {
    const batch = reqs.slice(i, i + 75)
    const identifiers = batch.map((r) => identifierOf(r, withEdition))
    const res = await fetch(`${API}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers }),
    })
    if (!res.ok) throw new Error(`Scryfall ${res.status}`)
    const json = (await res.json()) as { data: ScryCard[]; not_found: Identifier[] }
    // results come back in request order, minus the identifiers that were not found
    const notFound = new Set(json.not_found.map((x) => JSON.stringify(x).toLowerCase()))
    let k = 0
    batch.forEach((r, j) => {
      if (notFound.has(JSON.stringify(identifiers[j]).toLowerCase())) missing.push(r)
      else if (json.data[k]) found.set(requestKey(r), toInfo(json.data[k++]))
    })
    if (i + 75 < reqs.length) await sleep(120)
  }
  return { found, missing }
}

/**
 * Resolves cards in batches of 75, honouring the requested edition (set + collector number) when given.
 * A wrong or unknown edition falls back to the card's default printing. Results are keyed by requestKey().
 */
export async function fetchCollection(reqs: CardRequest[]) {
  const unique = [...new Map(reqs.map((r) => [requestKey(r), r])).values()]
  const first = await collection(unique, true)
  const retry = first.missing.filter((r) => r.set)
  const notFound = first.missing.filter((r) => !r.set).map((r) => r.name)
  if (retry.length) {
    const second = await collection(retry, false)
    second.found.forEach((v, k) => first.found.set(k, v))
    notFound.push(...second.missing.map((r) => r.name))
  }
  return { found: first.found, notFound }
}

// ---------- prices: Cardmarket's, in euro, which Scryfall refreshes once a day ----------

export interface Price {
  eur: number | null
  foil: number | null
  url?: string // the card on Cardmarket
  from?: string // the set of the printing priced, when not the deck's (which has no price: an MTGO one…)
}

const num = (s?: string | null) => (s ? Number(s) : null)
// Scryfall's link carries referrer/utm params that get it blocked by Cardmarket's firewall
const cmUrl = (s?: string) => {
  if (!s) return
  const u = new URL(s)
  for (const k of [...u.searchParams.keys()]) if (k === 'referrer' || k.startsWith('utm_')) u.searchParams.delete(k)
  return u.href
}
const priceOf = (c: ScryCard): Price => ({ eur: num(c.prices?.eur), foil: num(c.prices?.eur_foil), url: cmUrl(c.purchase_uris?.cardmarket) })
const prices = new Map<string, Price>() // by printing: a session is short enough to keep them

/**
 * The cheapest paper printing of each card, by name. A price counts when the US market has one too: a lone euro
 * price on a printing nobody sells (Summer Magic at €0.02) is noise.
 */
export async function fetchCheapest(names: string[]) {
  const best = new Map<string, Price & { from: string }>()
  for (let i = 0; i < names.length; i += 10) {
    const q = names.slice(i, i + 10).map((n) => `!"${front(n)}"`).join(' or ')
    let url: string | undefined = `${API}/cards/search?q=${encodeURIComponent(`(${q}) game:paper`)}&unique=prints`
    for (let page = 0; url && page < 3; page++) {
      await sleep(120)
      const res = await fetch(url)
      if (!res.ok) break // 404: none
      const json = (await res.json()) as { data: ScryCard[]; next_page?: string }
      for (const c of json.data) {
        const p = priceOf(c)
        const old = best.get(c.name)
        if (p.eur != null && c.prices?.usd && (!old || p.eur < old.eur!)) best.set(c.name, { ...p, from: c.set! })
      }
      url = json.next_page
    }
  }
  return best
}

/** The prices of the deck's printings (by Scryfall id); one without any gets its card's cheapest paper printing's. */
export async function fetchPrices(cards: { id: string; name: string }[]) {
  const todo = [...new Map(cards.filter((c) => !prices.has(c.id)).map((c) => [c.id, c])).values()]
  for (let i = 0; i < todo.length; i += 75) {
    if (i) await sleep(120)
    const res = await fetch(`${API}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers: todo.slice(i, i + 75).map(({ id }) => ({ id })) }),
    })
    if (!res.ok) throw new Error(`Scryfall ${res.status}`)
    for (const c of ((await res.json()) as { data: ScryCard[] }).data) prices.set(c.id, priceOf(c))
  }
  const priced = (id: string) => prices.get(id)?.eur != null || prices.get(id)?.foil != null
  const bare = todo.filter((c) => !priced(c.id))
  const cheap = bare.length ? await fetchCheapest(bare.map((c) => c.name)) : new Map()
  for (const c of bare) prices.set(c.id, cheap.get(c.name) ?? { eur: null, foil: null })
  return new Map(prices)
}

export const euro = (v: number, lang: string, digits = 2) =>
  v.toLocaleString(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits })

async function search(q: string, extra = '', signal?: AbortSignal): Promise<CardInfo[]> {
  const res = await fetch(`${API}/cards/search?q=${encodeURIComponent(q)}${extra}`, { signal })
  if (!res.ok) return [] // 404 = no results
  return ((await res.json()) as { data: ScryCard[] }).data.map(toInfo)
}

/** Free-text card search for the "add card" sheet (most played in Commander first). */
export const searchCards = (q: string, signal?: AbortSignal) =>
  q.trim().length < 2 ? Promise.resolve([]) : search(q, '&order=edhrec', signal).then((r) => r.slice(0, 40))

/** All printings of a card, newest first. */
export const fetchPrints = (name: string) => search(`!"${front(name)}"`, '&unique=prints&order=released&dir=desc')

/** A card's different illustrations, one printing each. */
export const fetchArts = (name: string, signal?: AbortSignal) => search(`!"${front(name)}"`, '&unique=art', signal)

/** Whether a card can lead a deck (legendary creature, "can be your commander"…), by Scryfall's own rule. */
export const isCommander = (name: string, signal?: AbortSignal) =>
  search(`!"${front(name)}" is:commander`, '', signal).then((r) => r.length > 0)

// ---------- one card in full: Oracle text, Italian text, rulings ----------

interface ScryFace {
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  loyalty?: string
  defense?: string
  image_uris?: { normal: string; art_crop: string }
  printed_name?: string
  printed_type_line?: string
  printed_text?: string
}

interface ScryFull extends ScryCard, ScryFace {
  oracle_id: string
  layout: string
  scryfall_uri: string
  legalities: Record<string, string>
  card_faces?: ScryFace[]
}

export interface CardFace {
  name: string
  manaCost: string
  typeLine: string
  text: string
  stats?: string // 2/3, loyalty 4, defense 5
  image?: string
}

export interface CardDetails {
  id: string
  oracleId: string
  name: string
  faces: CardFace[]
  image?: string // the card as a whole: split, adventure and flip cards have one image for all faces
  scryfallUri: string
  notLegal: boolean // not a tournament card (un-sets, test cards…)
  colors: string // color identity
}

const statsOf = (f: ScryFace) =>
  f.power != null ? `${f.power}/${f.toughness}` : f.loyalty != null ? `◆ ${f.loyalty}` : f.defense != null ? `⛨ ${f.defense}` : undefined

const facesOf = (c: ScryFull): ScryFace[] => c.card_faces ?? [c]

export async function fetchCardDetails(name: string, signal?: AbortSignal): Promise<CardDetails | undefined> {
  const res = await fetch(`${API}/cards/named?exact=${encodeURIComponent(name)}`, { signal })
  if (!res.ok) return
  const c = (await res.json()) as ScryFull
  return {
    id: c.id,
    oracleId: c.oracle_id,
    name: c.name,
    faces: facesOf(c).map((f) => ({
      name: f.name,
      manaCost: f.mana_cost ?? '',
      typeLine: f.type_line ?? '',
      text: f.oracle_text ?? '',
      stats: statsOf(f),
      image: f.image_uris?.normal,
    })),
    image: c.image_uris?.normal,
    scryfallUri: c.scryfall_uri.replace(/\?.*/, ''),
    notLegal: c.legalities.commander === 'not_legal',
    colors: (c.color_identity ?? []).join(''),
  }
}

/** The card as printed in Italian, from its most recent Italian printing: name, type and text of each face. */
export async function fetchItalian(name: string, signal?: AbortSignal): Promise<Pick<CardFace, 'name' | 'typeLine' | 'text'>[] | undefined> {
  const q = `!"${front(name)}" lang:it`
  const res = await fetch(`${API}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc`, { signal })
  if (!res.ok) return
  const c = ((await res.json()) as { data: ScryFull[] }).data[0]
  if (!c) return
  const faces = facesOf(c)
  if (!faces.some((f) => f.printed_text || f.printed_name)) return
  return faces.map((f) => ({ name: f.printed_name ?? f.name, typeLine: f.printed_type_line ?? f.type_line ?? '', text: f.printed_text ?? '' }))
}

export interface Ruling {
  date: string
  text: string
}

/** Official rulings (Wizards' release notes and Gatherer), oldest first. */
export async function fetchRulings(id: string, signal?: AbortSignal): Promise<Ruling[]> {
  const res = await fetch(`${API}/cards/${id}/rulings`, { signal })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  const json = (await res.json()) as { data: { published_at: string; comment: string }[] }
  return json.data.map((r) => ({ date: r.published_at, text: r.comment }))
}

/** Scryfall's picture of a mana or tap symbol, e.g. {W/U} → WU.svg. */
export const symbolUrl = (symbol: string) => `https://svgs.scryfall.io/card-symbols/${symbol.replace(/[{}/]/g, '').toUpperCase()}.svg`
