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
  image_uris?: { normal: string; art_crop: string }
  card_faces?: { mana_cost?: string; type_line?: string; image_uris?: { normal: string; art_crop: string } }[]
}

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
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Resolves names in batches of 75. Returns found cards keyed by lowercase requested name, plus misses. */
export async function fetchCollection(names: string[]) {
  const found = new Map<string, CardInfo>()
  const notFound: string[] = []
  const unique = [...new Set(names)]
  for (let i = 0; i < unique.length; i += 75) {
    const batch = unique.slice(i, i + 75)
    // split cards are exported as "A // B": Scryfall matches on the front face too
    const identifiers = batch.map((n) => ({ name: n.split(' // ')[0] }))
    const res = await fetch(`${API}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers }),
    })
    if (!res.ok) throw new Error(`Scryfall ${res.status}`)
    const json = (await res.json()) as { data: ScryCard[]; not_found: { name: string }[] }
    const missing = new Set(json.not_found.map((n) => n.name.toLowerCase()))
    let k = 0
    for (const n of batch) {
      if (missing.has(n.split(' // ')[0].toLowerCase())) notFound.push(n)
      else if (json.data[k]) found.set(n.toLowerCase(), toInfo(json.data[k++]))
    }
    if (i + 75 < unique.length) await sleep(120)
  }
  return { found, notFound }
}

export async function autocomplete(q: string, signal?: AbortSignal): Promise<string[]> {
  if (q.trim().length < 2) return []
  const res = await fetch(`${API}/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) return []
  return ((await res.json()) as { data: string[] }).data.slice(0, 8)
}

export async function fetchNamed(name: string): Promise<CardInfo | undefined> {
  const res = await fetch(`${API}/cards/named?exact=${encodeURIComponent(name)}`)
  if (!res.ok) return
  return toInfo((await res.json()) as ScryCard)
}
