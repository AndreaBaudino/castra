import { useEffect, useState } from 'react'
import { type MetaDataset, type MetaFilter, entriesOf } from './meta'

// The circuit's deck lists (public/decklists.json, built by scripts/build-meta.mjs from a fixed archive read once from
// Moxfield): the cards of each list, which the build gives to the meta's entries (MetaEntry.deckList) by the rules of
// docs/liste-mazzi.md. Shipped with the app and read only by the cards' pages.

export interface Decklists {
  v: number
  year: number // the only year with lists
  cards: [name: string, colors: string | null, land: 0 | 1][] // colors: color identity, null if unknown
  lists: [commander: string, cards: number[]][]
}

let loading: Promise<Decklists | null> | null = null

/** undefined while loading, null when it couldn't be read (tried again on the next mount) */
export function useDecklists() {
  const [data, setData] = useState<Decklists | null>()
  useEffect(() => {
    loading ??= fetch(`${import.meta.env.BASE_URL}decklists.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => (d ? d : ((loading = null), null)))
    let on = true
    loading.then((d) => on && setData(d))
    return () => {
      on = false
    }
  }, [])
  return data
}

export interface CardStat {
  id: number
  name: string
  colors: string
  land: boolean
  decks: number // entries whose list plays it
  of: number // entries with a list whose commander can play it
  lists: number // different lists playing it
  share: number // decks / of
}

const within = (identity: string, colors: string) => [...colors].every((c) => identity.includes(c))

/** Each card's play rate among the entries with a list, counted once per entry (a list brought twice counts twice),
 * out of those whose commander's color identity allows the card. Also how many entries and lists it rests on. */
export function cardStats(ds: MetaDataset, f: MetaFilter, dl: Decklists) {
  const all = ds.year === dl.year ? entriesOf(ds, f) : []
  const rows = all.filter((e) => e.deckList != null && e.cmd >= 0)
  const byIdentity = new Map<string, number>()
  const decks = new Map<number, number>()
  const lists = new Map<number, Set<number>>()
  for (const e of rows) {
    const identity = ds.commanders[e.cmd].colors
    byIdentity.set(identity, (byIdentity.get(identity) ?? 0) + 1)
    for (const c of dl.lists[e.deckList!][1]) {
      if (!within(identity, dl.cards[c][1] ?? '')) continue // not playable there: Moxfield let it in
      decks.set(c, (decks.get(c) ?? 0) + 1)
      lists.set(c, (lists.get(c) ?? new Set()).add(e.deckList!))
    }
  }
  const cards: CardStat[] = [...decks].map(([id, n]) => {
    const [name, colors, land] = dl.cards[id]
    const of = [...byIdentity].reduce((s, [identity, k]) => s + (within(identity, colors ?? '') ? k : 0), 0)
    return { id, name, colors: colors ?? '', land: !!land, decks: n, of, lists: lists.get(id)!.size, share: n / of }
  })
  return {
    cards: cards.sort((a, b) => b.share - a.share || b.decks - a.decks),
    entries: rows.length,
    total: all.length,
    lists: new Set(rows.map((e) => e.deckList)).size,
  }
}
