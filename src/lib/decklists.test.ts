import { describe, expect, it } from 'vitest'
import { cardStats, type Decklists } from './decklists'
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
  v: 1,
  year: 2026,
  cards: [
    ['Swords to Plowshares', 'W', 0],
    ['Sol Ring', '', 0],
    ['Counterspell', 'U', 0],
  ],
  lists: [
    ['Phelia', [0, 1]],
    ['Vohar', [1, 2]],
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
