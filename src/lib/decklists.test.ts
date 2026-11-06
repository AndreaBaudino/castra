import { describe, expect, it } from 'vitest'
import { cardStats, cardUse, type Decklists, deckOfList, deckVsMeta, playerCards, typicalList } from './decklists'
import type { Deck, DeckCard } from './decks'
import { ALL, type MetaDataset, type MetaEntry } from './meta'

// The play rate of the circuit's cards (docs/liste-mazzi.md): per entry, among the decks that can play the card.

const entry = (t: number, cmd: number, deckList?: number): MetaEntry => ({
  t,
  player: 'P',
  key: 'p',
  cmd,
  place: 1,
  w: 1,
  l: 0,
  d: 0,
  bye: false,
  list: null,
  ...(deckList != null ? { deckList } : {}),
})
const tournament = (index: number, season: 's1' | 's2') => ({ index, id: `t${index}`, kind: 'l1' as const, season, name: 'X', players: 8 })
const ds: MetaDataset = {
  year: 2026,
  years: [2026],
  updated: '',
  tournaments: [tournament(0, 's1'), tournament(1, 's2')],
  commanders: [
    { id: 0, name: 'Phelia', colors: 'W' },
    { id: 1, name: 'Vohar', colors: 'UB' },
  ],
  entries: [entry(0, 0, 0), entry(1, 0, 0), entry(0, 1, 1), entry(1, 1)],
  pairings: [],
}
const dl: Decklists = {
  v: 2,
  year: 2026,
  cards: [
    ['Swords to Plowshares', 'W', 0],
    ['Sol Ring', '', 0],
    ['Counterspell', 'U', 0],
  ],
  lists: [
    ['Phelia', [0, 1], 36, 0, []],
    ['Vohar', [1, 2], 37, 0, []],
  ],
}

describe('cardStats', () => {
  const byName = (f = ALL) => new Map(cardStats(ds, f, dl).cards.map((c) => [c.name, c]))

  it('counts per entry, among the decks that can play the card', () => {
    const c = byName()
    // Phelia's list brought twice: 2 of the 2 white decks
    expect(c.get('Swords to Plowshares')).toMatchObject({ decks: 2, of: 2, lists: 1, share: 1 })
    // colorless: every deck with a list can play it
    expect(c.get('Sol Ring')).toMatchObject({ decks: 3, of: 3, lists: 2 })
    expect(c.get('Counterspell')).toMatchObject({ decks: 1, of: 1 })
  })

  it('tells how many entries it rests on, with the filters', () => {
    expect(cardStats(ds, ALL, dl)).toMatchObject({ entries: 3, total: 4, lists: 2 })
    expect(byName({ ...ALL, season: 's2' }).get('Sol Ring')).toMatchObject({ decks: 1, of: 1 })
  })

  it('has nothing for another year', () => {
    expect(cardStats({ ...ds, year: 2027 }, ALL, dl).cards).toEqual([])
  })
})

describe('cardUse', () => {
  it('splits a card by commander, as cardStats counts it', () => {
    const u = cardUse(ds, ALL, dl, 'Sol Ring', '')
    expect(u).toMatchObject({ decks: 3, of: 3, lists: 2 })
    expect(u.playing.map((c) => [c.name, c.decks, c.of])).toEqual([
      ['Phelia', 2, 2],
      ['Vohar', 1, 1],
    ])
  })

  it('splits it by top cut and season', () => {
    // every entry is first in a Level 1: all in the top 8s
    const u = cardUse(ds, ALL, dl, 'Swords to Plowshares', 'W')
    expect(u).toMatchObject({ top8: { decks: 2, of: 2 }, out8: { decks: 0, of: 0 }, winners: { of: 0 } })
    expect(u).toMatchObject({ s1: { decks: 1, of: 1 }, s2: { decks: 1, of: 1 } })
    const late = { ...ds, entries: ds.entries.map((e) => ({ ...e, place: 9 })) }
    expect(cardUse(late, ALL, dl, 'Sol Ring', '')).toMatchObject({ top8: { of: 0 }, out8: { decks: 3, of: 3 } })
  })

  it('names the commanders that could play it and never do', () => {
    const u = cardUse(ds, ALL, dl, 'Counterspell', 'U')
    expect(u.playing.map((c) => c.name)).toEqual(['Vohar'])
    expect(cardUse(ds, ALL, dl, 'Brainstorm', 'U')).toMatchObject({ decks: 0, of: 1, skipping: [{ name: 'Vohar', of: 1 }] })
  })
})

describe('typicalList', () => {
  const names = (list: { name: string }[]) => list.map((c) => c.name)
  const cards: Decklists['cards'] = [
    ['Swords to Plowshares', 'W', 0],
    ['Sol Ring', '', 0],
    ['Ocelot Pride', 'W', 0],
    ['Seam Rip', 'W', 0],
    ['Maze of Ith', '', 1],
    ['Plains', 'W', 2],
    ['Command Tower', '', 1],
    ["Emeria's Call // Emeria, Shattered Skyclave", 'W', 3],
    ['Counterspell', 'U', 0],
    ['Tangle Wire', '', 0],
    ['Dust Bowl', '', 1],
  ]
  const lists: Decklists['lists'] = [
    ['Phelia', [0, 1, 2, 4, 5, 6, 7, 8], 35, 1, []],
    ['Phelia', [0, 1, 2, 4, 5, 6, 7], 36, 0, []],
    ['Phelia', [0, 1, 3, 5, 6, 7, 10], 37, 0, []],
    ['Phelia', [0, 1, 3, 5, 6, 7, 9, 10], 38, 1, []],
    ['Vohar', [1, 6, 8], 36, 0, []],
  ]
  // Phelia: list 0 brought 5 times, list 1 three times, lists 2 and 3 once, one entry without a list
  const phelia = [0, 0, 0, 0, 0, 1, 1, 1, 2, 3].map((l) => entry(0, 0, l))
  const vohar = [{ ...entry(0, 1, 4), player: 'Luca', key: 'luca' }, { ...entry(1, 1, 4), player: 'Luca', key: 'luca' }]
  const data: MetaDataset = { ...ds, entries: [...phelia, entry(1, 0), ...vohar, entry(1, 1)] }
  const dl2: Decklists = { v: 2, year: 2026, cards, lists }
  const x = typicalList(data, ALL, dl2, 0)

  it('counts per entry, out of the entries with a list', () => {
    expect(x).toMatchObject({ entries: 10, total: 11, lists: 4 })
    expect(x.must[0]).toMatchObject({ name: "Emeria's Call // Emeria, Shattered Skyclave", decks: 10, lists: 4, share: 1 })
  })

  it('splits the cards by share, modal cards with them, never a card the commander cannot play', () => {
    expect(names(x.must)).toEqual(["Emeria's Call // Emeria, Shattered Skyclave", 'Sol Ring', 'Swords to Plowshares'])
    // Maze of Ith, 8 of 10: a land in nearly every list is no unusual land
    expect(names(x.often)).toEqual(['Maze of Ith', 'Ocelot Pride'])
    expect([...names(x.must), ...names(x.often), ...names(x.choices)]).not.toContain('Counterspell')
  })

  it('takes the choices of at least 2 lists, up to 30% when under 20% they are fewer than 5', () => {
    // Seam Rip: 2 of 10 in 2 lists; Tangle Wire: 1 of 10, in one list only
    expect(x.tech).toBe(0.3)
    expect(names(x.choices)).toEqual(['Seam Rip'])
  })

  it('picks the lands that are neither staples, nor played by most of the circuit, nor in nearly every list', () => {
    // Plains is a staple, Command Tower is in every other list
    expect(x.picked).toEqual([expect.objectContaining({ name: 'Dust Bowl', decks: 2, lists: 2, rest: 0 })])
  })

  it('averages the lands per entry, modal cards apart', () => {
    expect(x.lands).toBeCloseTo(35.8)
    expect(x.modal).toBeCloseTo(0.6)
    expect([x.lo, x.hi]).toEqual([36, 39])
  })

  it('tells who brought the only list', () => {
    expect(typicalList(data, ALL, dl2, 1)).toMatchObject({ entries: 2, total: 3, lists: 1, players: ['Luca'] })
  })

  it('has nothing for another year', () => {
    expect(typicalList({ ...data, year: 2027 }, ALL, dl2, 0).entries).toBe(0)
  })
})

describe('playerCards', () => {
  const cards: Decklists['cards'] = [
    ['Swords to Plowshares', 'W', 0],
    ['Gilded Drake', 'U', 0],
    ['Brainstorm', 'U', 0],
    ['Meekstone', '', 0],
    ['Flooded Strand', '', 2],
    ['Solo', '', 0],
  ]
  const lists: Decklists['lists'] = [
    ['A', [0, 1, 2, 3, 4], 36, 0, []], // Ana's two lists
    ['B', [1, 2, 3, 4, 5], 36, 0, []],
    ['A', [0, 2], 36, 0, []], // the others
    ['B', [2], 36, 0, []],
  ]
  const ana = (t: number, cmd: number, l?: number) => ({ ...entry(t, cmd, l), player: 'Ana', key: 'ana' })
  const data: MetaDataset = {
    ...ds,
    commanders: [
      { id: 0, name: 'A', colors: 'WU' },
      { id: 1, name: 'B', colors: 'U' },
    ],
    entries: [ana(0, 0, 0), ana(1, 0, 0), ana(1, 1, 1), ana(0, 1), entry(0, 0, 2), entry(1, 1, 3), entry(1, 1, 3)],
  }
  const dl2: Decklists = { v: 2, year: 2026, cards, lists }
  const x = playerCards(data, dl2, 'ana')

  it('tells what it rests on', () => {
    expect(x).toMatchObject({ entries: 3, total: 4, lists: 2, commanders: 2 })
  })

  it('takes the cards of 2+ lists played far more than the rest of the circuit, never lands', () => {
    // Gilded Drake and Meekstone: all of hers, none of the others'. Brainstorm: everybody plays it. Swords: one list.
    // Solo: one list. Flooded Strand: a land.
    expect(x.cards.map((c) => [c.name, c.decks, c.of, c.rest])).toEqual([
      ['Gilded Drake', 3, 3, 0],
      ['Meekstone', 3, 3, 0],
    ])
  })

  it('has nothing for another year', () => {
    expect(playerCards({ ...data, year: 2027 }, dl2, 'ana')).toMatchObject({ entries: 0, cards: [] })
  })
})

describe('deckVsMeta', () => {
  const cards: Decklists['cards'] = [
    ['Swords to Plowshares', 'W', 0],
    ['Ocelot Pride', 'W', 0],
    ['Seam Rip', 'W', 0],
    ['Plains', 'W', 2],
    ["Emeria's Call // Emeria, Shattered Skyclave", 'W', 3],
  ]
  const lists: Decklists['lists'] = [
    ['Phelia', [0, 1, 3], 36, 0, []],
    ['Phelia', [0, 1, 2, 3, 4], 35, 1, []],
  ]
  const data: MetaDataset = { ...ds, entries: [entry(0, 0, 0), entry(1, 0, 0), entry(1, 0, 1), entry(0, 1, 0)] }
  const dl2: Decklists = { v: 2, year: 2026, cards, lists }
  const card = (name: string, qty = 1, typeLine = 'Creature'): DeckCard => ({ name, qty, section: 'main', info: { typeLine } as DeckCard['info'] })
  const deck = (cs: DeckCard[]): Deck => ({ id: 'd', name: 'D', tags: [], notes: '', cards: [{ name: 'Phelia', qty: 1, section: 'commander' }, ...cs], createdAt: '', updatedAt: '' })

  it('tells the must haves it lacks, its lands and its own cards', () => {
    const x = deckVsMeta(data, dl2, 0, deck([card('Swords to Plowshares'), card('Plains', 30, 'Basic Land — Plains'), card("Emeria's Call"), card('Armageddon')]))
    expect(x).toMatchObject({ entries: 3, lists: 2, have: 1, of: 2, lands: 31 })
    expect(x!.avgLands).toBeCloseTo(36)
    expect(x!.missing.map((c) => c.name)).toEqual(['Ocelot Pride'])
    // Emeria's Call: in 1 of 3 entries, so not a pet card; Armageddon: in none
    expect(x!.pets).toEqual([{ name: 'Armageddon', decks: 0, share: 0 }])
  })

  it('has nothing with fewer than 2 lists', () => {
    expect(deckVsMeta({ ...data, entries: [entry(0, 0, 0)] }, dl2, 0, deck([]))).toBeNull()
  })
})

describe('deckOfList', () => {
  it('makes a deck with the list, its copies and its commanders', () => {
    const dl2: Decklists = { v: 2, year: 2026, cards: [['Island', 'U', 2], ['Brainstorm', 'U', 0]], lists: [['Jeska / Yoshimaru', [0, 1], 30, 0, [[0, 30]]]] }
    const d = deckOfList(dl2, 0, 'Jeska di Ana')
    expect(d.name).toBe('Jeska di Ana')
    expect(d.cards.map((c) => [c.name, c.qty, c.section])).toEqual([
      ['Jeska', 1, 'commander'],
      ['Yoshimaru', 1, 'commander'],
      ['Island', 30, 'main'],
      ['Brainstorm', 1, 'main'],
    ])
  })
})
