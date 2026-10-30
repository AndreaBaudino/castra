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
