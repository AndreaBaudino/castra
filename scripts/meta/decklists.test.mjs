import { describe, expect, it } from 'vitest'
import { playerKey } from './aliases.mjs'
import { assignLists, cardName, givePhotos, photoCards } from './decklists.mjs'

// The rules of docs/liste-mazzi.md on a small year shaped as the real one: tournaments, commanders and entries as in
// meta.json ([tournament, player, commander, place, w, l, d, bye, link]).

const t = [
  { id: 'l1-2026-01-09-cogoleto', d: '2026-01-09' },
  { id: 'l1-2026-01-30-cogoleto', d: '2026-01-30' },
  { id: 's1-sanremo-2', lg: 'Sanremo', s: 's1', st: 2, d: '2026-03-03' },
  { id: 's1-sanremo-3', lg: 'Sanremo', s: 's1', st: 3 }, // no date: right after stage 2
  { id: 'l2-2026-03-04-albisola', d: '2026-03-04' },
  { id: 'l1-2026-12-12-savona', d: '2026-12-12' }, // played after the archive was taken
]
const c = [{ n: 'Phelia, Exuberant Shepherd' }, { n: 'Atraxa, Grand Unifier' }, { n: 'Tivit, Seller of Secrets' }, { n: 'Oloro, Ageless Ascetic' }]
const PHELIA = 'https://moxfield.com/decks/phelia'
const NEW = 'https://moxfield.com/decks/new'
const TIVIT = 'https://moxfield.com/decks/tivit'
const row = (ti, player, cmd, link = null) => [ti, player, cmd, 1, 3, 1, 0, 0, link]
const e = [
  row(0, 'Lorenzo Misuri', 0, PHELIA), // 0 direct
  row(1, 'Lorenzo Misuri', 0), // 1 no link: Misuri's Phelia list
  row(1, 'Gian Marco Waltz', 1, PHELIA), // 2 the same link for another commander: no list
  row(0, 'Lorenzo Arzenton', 2, TIVIT), // 3 direct
  row(4, 'Lorenzo Bresciani', 3, TIVIT), // 4 someone else's link, another commander: no list
  row(3, 'Lorenzo Misuri', 0, NEW), // 5 direct, a newer Phelia list of his, at the stage without a date
  row(2, 'lorenzo misuri', 0, 'https://moxfield.com/decks/rotto'), // 6 broken link: his latest list, same player key
  row(5, 'Lorenzo Misuri', 0), // 7 a later tournament of the year: still his latest list
  row(4, null, 0), // 8 anonymous: no list
  row(4, 'Lorenzo Arzenton', 0), // 9 no Phelia list of his
]
const archive = {
  taken: '2026-11-05',
  lists: [
    { link: PHELIA, commander: c[0].n, entries: [['l1-2026-01-09-cogoleto', 'Lorenzo Misuri']], cards: ['1 Swords to Plowshares'] },
    { link: TIVIT, commander: c[2].n, entries: [['l1-2026-01-09-cogoleto', 'Lorenzo Arzenton']], cards: ['1 Brainstorm'] },
    { link: NEW, commander: c[0].n, entries: [['s1-sanremo-3', 'Lorenzo Misuri'], ['l1-2026-01-30-cogoleto', 'Nessuno']], cards: [] },
  ],
}

describe('assignLists', () => {
  const { lists, orphans } = assignLists(archive, 2026, t, c, e, playerKey)

  it('links the archive entries with their commander', () => {
    expect(lists[0]).toEqual([0, 0])
    expect(lists[3]).toEqual([1, 0])
    expect(lists[5]).toEqual([2, 0])
  })

  it('gives no list when the commander is another one', () => {
    expect(lists[2]).toBeNull()
    expect(lists[4]).toBeNull()
  })

  it("extends a player's latest list for the same commander, by stage number when a stage has no date", () => {
    // NEW was played at Sanremo stage 3 (no date: after stage 2, on 3/3), PHELIA on 9/1: NEW is the latest
    expect(lists[1]).toEqual([2, 1])
    expect(lists[6]).toEqual([2, 1])
    expect(lists[7]).toEqual([2, 1])
  })

  it('leaves alone anonymous entries and players without a list for that commander', () => {
    expect(lists[8]).toBeNull()
    expect(lists[9]).toBeNull()
  })

  it('reports the archive entries no longer found', () => {
    expect(orphans).toEqual(['l1-2026-01-30-cogoleto Nessuno: https://moxfield.com/decks/new'])
  })

  it('gives nothing to another year', () => {
    expect(assignLists(archive, 2027, t, c, e, playerKey).lists.every((x) => x === null)).toBe(true)
  })

  it('counts once per entry: a list played twice counts twice', () => {
    const plays = lists.filter((x) => x?.[0] === 2).length
    expect(plays).toBe(4) // entries 1, 5, 6, 7
  })
})

it('cardName drops the quantity', () => {
  expect(cardName('1 Brazen Borrower // Petty Theft')).toBe('Brazen Borrower // Petty Theft')
  expect(cardName('12 Snow-Covered Island')).toBe('Snow-Covered Island')
})

describe('the photos of the decks of the app', () => {
  it('keep the 99 as the archive writes them: no commander, no headers, no edition', () => {
    const text = 'Commander\n1 Phelia, Exuberant Shepherd (MH3) 39\n\nDeck\n1 Sol Ring (C21) 263\n16 Snow-Covered Plains (KHM) 276\n1 Fire // Ice\n1 Mother of Runes'
    expect(photoCards(text)).toEqual(['1 Sol Ring', '16 Snow-Covered Plains', '1 Fire // Ice', '1 Mother of Runes'])
  })
})

describe('the photos given to the entries', () => {
  const DECK = 'Commander\n1 Phelia, Exuberant Shepherd\n\nDeck\n1 Sol Ring (C21) 263\n1 Mother of Runes'
  const year = (y, rows) => ({
    year: y,
    t: [{ id: 'l1-2027-02-06-savona' }, { id: 's1-genova-2' }],
    app: ['drive1', 'drive2~2'],
    c: [{ n: 'Phelia, Exuberant Shepherd' }, { n: 'Atraxa, Grand Unifier' }],
    e: rows,
  })
  const photos = () =>
    new Map([
      ['drive1', new Map([['lorenzo misuri', { cards: DECK, name: 'Phelia di Lorenzo', at: 'x', invalid: false }]])],
      ['drive2~2', new Map([['gian marco waltz', { cards: DECK, name: 'Prova', at: 'y', invalid: true }]])],
    ])

  it('a new photo joins the archive under its entry, for any year, and the entry gets it', () => {
    const archive = { v: 1, lists: [] }
    const y = year(2027, [row(0, 'Lorenzo Misuri', 0), row(1, 'Lorenzo Misuri', 0), row(0, 'Gian Marco Waltz', 1)])
    expect(givePhotos(archive, photos(), [y], playerKey)).toEqual([[0, undefined, undefined]])
    expect(archive.lists).toEqual([
      { id: 'drive1', player: 'lorenzo misuri', year: 2027, commander: 'Phelia, Exuberant Shepherd', name: 'Phelia di Lorenzo', at: 'x', invalid: false, cards: ['1 Sol Ring', '1 Mother of Runes'] },
    ])
  })

  it('a deck that failed the check is archived as such', () => {
    const archive = { v: 1, lists: [] }
    expect(givePhotos(archive, photos(), [year(2027, [row(1, 'Gian Marco Waltz', 1)])], playerKey)).toEqual([[0]])
    expect(archive.lists[0].invalid).toBe(true)
  })

  it('a photo already in the archive never changes, and still goes to its entry', () => {
    const old = { id: 'drive1', player: 'lorenzo misuri', year: 2027, commander: 'Phelia, Exuberant Shepherd', name: 'Prima', at: 'a', invalid: false, cards: ['1 Sol Ring'] }
    const archive = { v: 1, lists: [old] }
    expect(givePhotos(archive, photos(), [year(2027, [row(0, 'lorenzo misuri', 0)])], playerKey)).toEqual([[0]])
    expect(archive.lists).toEqual([old])
    // the next night, Firestore not read: the entry keeps its photo
    expect(givePhotos(archive, new Map(), [year(2027, [row(0, 'Lorenzo Misuri', 0)])], playerKey)).toEqual([[0]])
  })

  it('no photo for an entry without a commander', () => {
    const archive = { v: 1, lists: [] }
    expect(givePhotos(archive, photos(), [year(2027, [row(0, 'Lorenzo Misuri', -1)])], playerKey)).toEqual([[undefined]])
    expect(archive.lists).toEqual([])
  })
})
