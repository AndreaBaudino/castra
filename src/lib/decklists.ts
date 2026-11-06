import { useEffect, useState } from 'react'
import { type Deck, groupOf, newId } from './decks'
import { ALL, type MetaDataset, type MetaEntry, type MetaFilter, entriesOf } from './meta'

// The circuit's deck lists (public/decklists.json, built by scripts/build-meta.mjs from a fixed archive read once from
// Moxfield): the cards of each list, which the build gives to the meta's entries (MetaEntry.deckList) by the rules of
// docs/liste-mazzi.md. Shipped with the app and read only by the cards' pages.

export interface Decklists {
  v: number
  year: number // the only year with lists
  // colors: color identity, null if unknown. Kind, by the front face: 0 not a land, 1 a land, 2 a staple land (basic,
  // fetch, making 2 to 4 colors), 3 a modal card with a land on the back
  cards: [name: string, colors: string | null, kind: 0 | 1 | 2 | 3][]
  // lands and modal cards: with copies; copies: the cards with more than one
  lists: [commander: string, cards: number[], lands: number, modal: number, copies: [card: number, n: number][]][]
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

export interface CommanderUse {
  name: string
  colors: string
  decks: number // its entries whose list plays the card
  of: number // its entries with a list
  players: number // different players among those decks
}

/** One card in the circuit, counted as in cardStats, by commander: those playing it (the most first) and those that
 * could and never do (the most entries first). `colors`: the card's color identity, for a card in no list. */
export function cardUse(ds: MetaDataset, f: MetaFilter, dl: Decklists, name: string, colors: string) {
  const id = dl.cards.findIndex((c) => c[0] === name)
  const identity = id >= 0 ? (dl.cards[id][1] ?? '') : colors
  const rows = (ds.year === dl.year ? entriesOf(ds, f) : []).filter(
    (e) => e.deckList != null && e.cmd >= 0 && within(ds.commanders[e.cmd].colors, identity),
  )
  const by = new Map<number, { decks: number; of: number; players: Set<string> }>()
  const lists = new Set<number>()
  for (const e of rows) {
    const x = by.get(e.cmd) ?? { decks: 0, of: 0, players: new Set<string>() }
    x.of++
    if (id >= 0 && dl.lists[e.deckList!][1].includes(id)) {
      x.decks++
      lists.add(e.deckList!)
      if (e.key) x.players.add(e.key)
    }
    by.set(e.cmd, x)
  }
  const cmds: CommanderUse[] = [...by].map(([c, x]) => ({ ...ds.commanders[c], decks: x.decks, of: x.of, players: x.players.size }))
  const decks = cmds.reduce((s, c) => s + c.decks, 0)
  return {
    decks,
    of: rows.length,
    share: rows.length ? decks / rows.length : 0,
    lists: lists.size,
    playing: cmds.filter((c) => c.decks).sort((a, b) => b.decks - a.decks || b.of - a.of),
    skipping: cmds.filter((c) => !c.decks).sort((a, b) => b.of - a.of),
  }
}

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
    const [name, colors, kind] = dl.cards[id]
    const of = [...byIdentity].reduce((s, [identity, k]) => s + (within(identity, colors ?? '') ? k : 0), 0)
    return { id, name, colors: colors ?? '', land: kind === 1 || kind === 2, decks: n, of, lists: lists.get(id)!.size, share: n / of }
  })
  return {
    cards: cards.sort((a, b) => b.share - a.share || b.decks - a.decks),
    entries: rows.length,
    total: all.length,
    lists: new Set(rows.map((e) => e.deckList)).size,
  }
}

export interface TypicalCard {
  id: number
  name: string
  decks: number // the commander's entries whose list plays it
  lists: number
  share: number // of the commander's entries with a list
  rest?: number // lands: share among the other commanders' entries that can play it
}

/** A commander's typical list (docs/liste-mazzi.md), counted per entry as in cardStats: the cards in nearly every list,
 * the choices of a few lists, the lands picked on purpose, and the average land count. */
export function typicalList(ds: MetaDataset, f: MetaFilter, dl: Decklists, cmd: number) {
  const shown = ds.year === dl.year ? entriesOf(ds, f) : []
  const all = shown.filter((e) => e.deckList != null && e.cmd >= 0)
  const rows = all.filter((e) => e.cmd === cmd)
  const identity = ds.commanders[cmd].colors
  const decks = new Map<number, number>()
  const lists = new Map<number, Set<number>>()
  let lands = 0
  let modal = 0
  let lo = Infinity
  let hi = 0
  for (const e of rows) {
    const [, cards, l, m] = dl.lists[e.deckList!]
    lands += l
    modal += m
    lo = Math.min(lo, l + m)
    hi = Math.max(hi, l + m)
    for (const c of cards) {
      if (!within(identity, dl.cards[c][1] ?? '')) continue
      decks.set(c, (decks.get(c) ?? 0) + 1)
      lists.set(c, (lists.get(c) ?? new Set()).add(e.deckList!))
    }
  }
  const n = rows.length
  const cards: (TypicalCard & { kind: number })[] = [...decks]
    .map(([id, d]) => ({ id, name: dl.cards[id][0], kind: dl.cards[id][2], decks: d, lists: lists.get(id)!.size, share: d / n }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name))
  // modal cards are spells too: they stay with the cards (and count among the lands above)
  const spells = cards.filter((c) => c.kind === 0 || c.kind === 3)
  const choices = (max: number) => spells.filter((c) => c.share <= max && c.lists >= 2)
  const tech = choices(0.2).length >= 5 ? 0.2 : 0.3
  const others = all.filter((e) => e.cmd !== cmd)
  const rest = (id: number) => {
    const can = others.filter((e) => within(ds.commanders[e.cmd].colors, dl.cards[id][1] ?? ''))
    return can.length ? can.filter((e) => dl.lists[e.deckList!][1].includes(id)).length / can.length : 0
  }
  // not the format's staples (basics, fetches, duals…) nor what most of the circuit plays anyway; those in nearly every
  // list are must haves (by the cards' thresholds), and from 70% they're not unusual
  const unusual = cards.filter((c) => c.kind === 1 && c.lists >= 2 && rest(c.id) < 0.5)
  const byShare = (a: TypicalCard, b: TypicalCard) => b.share - a.share || a.name.localeCompare(b.name)
  return {
    entries: n,
    total: shown.filter((e) => e.cmd === cmd).length,
    lists: new Set(rows.map((e) => e.deckList)).size,
    players: [...new Set(rows.map((e) => e.player).filter(Boolean))] as string[],
    lands: n ? lands / n : 0,
    modal: n ? modal / n : 0,
    lo,
    hi,
    must: [...spells, ...unusual].filter((c) => c.share >= 0.95).sort(byShare),
    often: [...spells, ...unusual].filter((c) => c.share >= 0.8 && c.share < 0.95).sort(byShare),
    tech,
    choices: choices(tech),
    picked: unusual.filter((c) => c.share < 0.7).map((c) => ({ ...c, rest: rest(c.id) })),
    cards, // every card, the most played first
  }
}

export interface PlayerCard {
  id: number
  name: string
  decks: number // the player's entries whose list plays it
  of: number // the player's entries with a list whose commander can play it
  share: number
  rest: number // share among the other players' entries that can play it
}

/** A player's favourite cards (docs/liste-mazzi.md): in at least 2 of their lists and 60% of their entries that can
 * play them, and at least 30 points above the rest of the circuit. The biggest gap first. Only with 2+ lists. */
export function playerCards(ds: MetaDataset, dl: Decklists, key: string) {
  const all = (ds.year === dl.year ? ds.entries : []).filter((e) => e.deckList != null && e.cmd >= 0)
  const mine = all.filter((e) => e.key === key)
  const others = all.filter((e) => e.key !== key)
  const lists = new Map<number, Set<number>>()
  for (const e of mine) for (const c of dl.lists[e.deckList!][1]) lists.set(c, (lists.get(c) ?? new Set()).add(e.deckList!))
  const shareOf = (rows: MetaEntry[], id: number) => {
    const can = rows.filter((e) => within(ds.commanders[e.cmd].colors, dl.cards[id][1] ?? ''))
    return [can.filter((e) => dl.lists[e.deckList!][1].includes(id)).length, can.length]
  }
  const cards: PlayerCard[] = []
  for (const [id, l] of lists) {
    const kind = dl.cards[id][2]
    if (l.size < 2 || (kind !== 0 && kind !== 3)) continue // lands are the deck's colors, not a taste
    const [decks, of] = shareOf(mine, id)
    if (!of || decks / of < 0.6) continue
    const [n, m] = shareOf(others, id)
    const rest = m ? n / m : 0
    if (decks / of - rest >= 0.3) cards.push({ id, name: dl.cards[id][0], decks, of, share: decks / of, rest })
  }
  return {
    entries: mine.length,
    total: (ds.year === dl.year ? ds.entries : []).filter((e) => e.key === key).length,
    lists: new Set(mine.map((e) => e.deckList)).size,
    commanders: new Set(mine.map((e) => e.cmd)).size,
    cards: cards.sort((a, b) => b.share - b.rest - (a.share - a.rest) || a.name.localeCompare(b.name)),
  }
}

const front = (name: string) => name.split(' // ')[0].trim().toLowerCase()

/** One of the user's decks against its commander's most played cards in the whole year (docs/liste-mazzi.md): the
 * must haves and almost-always cards it has and lacks, its lands, and its cards in at most 5% of the lists' entries.
 * Null when the commander has fewer than 2 lists. */
export function deckVsMeta(ds: MetaDataset, dl: Decklists, cmd: number, deck: Deck) {
  const x = typicalList(ds, ALL, dl, cmd)
  if (x.lists < 2) return null
  const main = deck.cards.filter((c) => c.section === 'main')
  const mine = new Set(main.map((c) => front(c.name)))
  const top = [...x.must, ...x.often]
  const share = new Map(x.cards.map((c) => [front(c.name), c]))
  const kinds = new Map(dl.cards.map((c) => [front(c[0]), c[2]]))
  // a card without its Scryfall data yet: the lists know if it's a land
  const isLand = (c: Deck['cards'][number]) => groupOf(c) === 'lands' || [1, 2].includes(kinds.get(front(c.name)) ?? 0)
  return {
    entries: x.entries,
    lists: x.lists,
    have: top.filter((c) => mine.has(front(c.name))).length,
    of: top.length,
    lands: main.filter((c) => isLand(c) || kinds.get(front(c.name)) === 3).reduce((s, c) => s + c.qty, 0),
    avgLands: x.lands + x.modal,
    missing: top.filter((c) => !mine.has(front(c.name))),
    // spells only: lands are the deck's colors, not a choice
    pets: main
      .filter((c) => !isLand(c) && (share.get(front(c.name))?.share ?? 0) <= 0.05)
      .map((c) => ({ name: c.name, decks: share.get(front(c.name))?.decks ?? 0, share: share.get(front(c.name))?.share ?? 0 }))
      .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name)),
  }
}

/** A new deck with one of the circuit's lists, as it was on the day it was read (partners: two commanders). */
export function deckOfList(dl: Decklists, list: number, name: string): Deck {
  const [commander, cards, , , copies] = dl.lists[list]
  const n = new Map(copies)
  const now = new Date().toISOString()
  return {
    id: newId(),
    name,
    tags: [],
    notes: '',
    cards: [
      ...commander.split(' / ').map((c) => ({ name: c, qty: 1, section: 'commander' as const })),
      ...cards.map((c) => ({ name: dl.cards[c][0], qty: n.get(c) ?? 1, section: 'main' as const })),
    ],
    createdAt: now,
    updatedAt: now,
  }
}
