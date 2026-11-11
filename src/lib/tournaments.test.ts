import { describe, expect, it } from 'vitest'
import { type MetaDataset, type MetaTournament, ALL, matchupsOf } from './meta'
import type { Source } from './sources'
import type { Deck } from './decks'
import { type Match as Played, deckTournaments, fmtRecord } from './matches'
import {
  type Player,
  type TableMatch,
  type Tournament,
  entrantsOf,
  icsOf,
  upcoming,
  isListLink,
  newCode,
  nextStage,
  personalMatches,
  ranking,
  results,
  sheetData,
  sheetRows,
  sideScore,
  tournamentId,
  unconfirmed,
} from './tournaments'

// What the app keeps of a tournament on Firestore, and what it reads back from it.

const league: Source = { drive: 'savonaS2', kind: 'league', year: 2026, season: 's2', league: 'Savona' }
const stage = (st: number, more: Partial<MetaTournament> = {}): MetaTournament =>
  ({ index: 0, id: `s2-savona-${st}`, kind: 'league', season: 's2', name: 'Savona', league: 'Savona', stage: st, players: 9, ...more })
const meta = (year: number, tournaments: MetaTournament[]) => ({ year, tournaments }) as MetaDataset
const inApp = (drive: string, st: number): [string, Tournament] => [tournamentId(drive, st), { drive, stage: st } as Tournament]

describe('tournaments', () => {
  it('one for each sheet, and for a league one for each stage', () => {
    expect(tournamentId('1abc')).toBe('1abc')
    expect(tournamentId('1abc', 7)).toBe('1abc~7')
  })

  it('proposes the stage after the highest one in the meta or in the app, for that league and season only', () => {
    expect(nextStage(league, null, [])).toBe(1)
    const m = meta(2026, [stage(1), stage(5), stage(9, { season: 's1' }), stage(12, { league: 'Genova' }), stage(14, { kind: 'online' })])
    expect(nextStage(league, m, [])).toBe(6)
    // stages played in the app and not in the meta yet; another sheet's don't count
    expect(nextStage(league, m, [inApp('savonaS2', 6), inApp('savonaS2', 7), inApp('genova', 20)])).toBe(8)
    // the meta of another year
    expect(nextStage(league, meta(2025, [stage(5)]), [])).toBe(1)
  })

  it('reads the players for the engine: late entries and drops; the ones waiting for the TO are not in', () => {
    const players: [string, Player][] = [
      ['a', { name: 'A', commander: 'X', at: '', by: '' }],
      ['b', { name: 'B', commander: null, joined: 2, drop: 3, at: '', by: '' }],
      ['c', { name: 'C', commander: 'Y', uid: 'u', pending: true, at: '', by: 'u' }],
    ]
    expect(entrantsOf(players)).toEqual([{ id: 'a', joined: undefined, drop: undefined }, { id: 'b', joined: 2, drop: 3 }])
  })

  it('makes registration codes of six characters, none easy to mix up', () => {
    const codes = Array.from({ length: 2000 }, newCode)
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/) // no 0 O 1 I, as the rules want [A-Z0-9]{6}
    expect(new Set(codes).size).toBeGreaterThan(1990)
    // every character turns up: the 32 are picked evenly from a byte
    expect(new Set(codes.join('')).size).toBe(32)
  })

  it('tells a result waiting for the opponent from one that counts', () => {
    const m: TableMatch = { round: 1, table: 1, p1: 'a', p2: 'b', score: [2, 1, 0] }
    expect(unconfirmed(m)).toBe(false) // the TO's
    expect(unconfirmed({ ...m, reportedBy: 'a', confirmed: false })).toBe(true)
    expect(unconfirmed({ ...m, reportedBy: 'a', confirmed: true })).toBe(false)
    expect(unconfirmed({ ...m, score: null, reportedBy: 'a' })).toBe(false)
  })

  it('takes Moxfield deck links only', () => {
    expect(isListLink('https://moxfield.com/decks/Ab3_x-9QzK')).toBe(true)
    expect(isListLink('https://www.moxfield.com/decks/Ab3_x-9QzK/')).toBe(true)
    expect(isListLink('http://moxfield.com/decks/Ab3')).toBe(false)
    expect(isListLink('https://moxfield.com/users/someone')).toBe(false)
    expect(isListLink('https://moxfield.com.spy.example/decks/x')).toBe(false)
    expect(isListLink('https://archidekt.com/decks/123')).toBe(false)
  })

  it('keeps the top cut out of the Swiss standings, and puts it first in the final order', () => {
    const players: [string, Player][] = ['a', 'b', 'c', 'd'].map((id) => [id, { name: id, commander: 'X', at: '', by: '' }])
    const m = (round: number, table: number, p1: string, p2: string, score: [number, number, number]): TableMatch => ({ round, table, p1, p2, score })
    const swiss = [m(1, 1, 'a', 'b', [2, 0, 0]), m(1, 2, 'c', 'd', [2, 0, 0]), m(2, 1, 'a', 'c', [2, 0, 0]), m(2, 2, 'b', 'd', [2, 0, 0])]
    const final = m(3, 1, 'a', 'c', [0, 2, 0])
    const t = { kind: 'l1', status: 'cut', rounds: 2, cut: 2 } as Tournament
    const r = results(t, players, [...swiss, final])
    expect(r.standings.map((s) => [s.id, s.points])).toEqual([['a', 6], ['b', 3], ['c', 3], ['d', 0]])
    expect(r.order).toEqual(['c', 'a', 'b', 'd'])
    // during the Swiss rounds every match counts
    expect(results({ status: 'swiss', rounds: 3, cut: 2 } as Tournament, players, swiss).order).toEqual(['a', 'b', 'c', 'd'])
  })

  it('writes the rows for the sheet in two blocks around the points column, in the final order', () => {
    const p = (name: string, commander: string | null, more: Partial<Player> = {}): Player => ({ name, commander, at: '', by: '', ...more })
    const players: [string, Player][] = [
      ['a', p('Anna', 'Kinnan, Bonder Prodigy')],
      ['b', p('Bruno', 'Spider-Man 2099')],
      ['c', p('Carla', 'Jeska, Thrice Reborn / Yoshimaru, Ever Faithful')],
      ['l', p('Luca', null, { joined: 2 })],
    ]
    const m = (round: number, table: number, p1: string, p2: string | null, score?: [number, number, number]): TableMatch => ({ round, table, p1, p2, score })
    const matches = [
      m(1, 1, 'a', 'b', [2, 1, 0]),
      m(1, 0, 'c', null), // c's bye
      m(2, 1, 'a', 'c', [1, 1, 0]),
      m(2, 2, 'b', 'l', [2, 0, 0]),
      m(3, 1, 'a', 'b', [0, 2, 0]), // the final, a top 2
    ]
    const rows = sheetRows({ kind: 'l1', status: 'done', rounds: 2, cut: 2 } as Tournament, players, matches)
    // the final: b beat a, so b first and a second; then the others as in the Swiss, c (4 points) and l (0)
    expect(rows.names.split('\n')).toEqual([
      'Bruno\tSpider-Man 2099',
      'Anna\tKinnan, Bonder Prodigy',
      'Carla\tJeska, Thrice Reborn / Yoshimaru, Ever Faithful',
      'Luca\t',
    ])
    // wins, losses, draws, bye, decklist: the top cut counts, the bye is a win, the missed round a loss
    expect(rows.results.split('\n')).toEqual(['2\t1\t0\tFALSE\t', '1\t1\t1\tFALSE\t', '1\t0\t1\tTRUE\t', '0\t2\t0\tFALSE\t'])
    // what the script writes: the same, with the decklists given
    const mox = 'https://moxfield.com/decks/Ab3'
    expect(sheetData({ kind: 'l1', status: 'done', rounds: 2, cut: 2 } as Tournament, players, matches, new Map([['a', mox]]))).toEqual([
      { name: 'Bruno', commander: 'Spider-Man 2099', w: 2, l: 1, d: 0, bye: false, list: '' },
      { name: 'Anna', commander: 'Kinnan, Bonder Prodigy', w: 1, l: 1, d: 1, bye: false, list: mox },
      { name: 'Carla', commander: 'Jeska, Thrice Reborn / Yoshimaru, Ever Faithful', w: 1, l: 0, d: 1, bye: true, list: '' },
      { name: 'Luca', commander: null, w: 0, l: 2, d: 0, bye: false, list: '' },
    ])
    expect(sheetRows({ kind: 'l1', status: 'done', rounds: 2, cut: 2 } as Tournament, players, matches, new Map([['a', mox]])).results.split('\n')[1]).toBe(
      `1\t1\t1\tFALSE\t${mox}`,
    )
  })

  it("records a player's matches as their own, from their side, once whatever happens", () => {
    const players: [string, Player][] = [
      ['a', { name: 'Anna', commander: 'Kinnan, Bonder Prodigy', deck: 'd1', at: '', by: '' }],
      ['b', { name: 'Bruno', commander: 'Spider-Man 2099', at: '', by: '' }],
      ['c', { name: 'Carla', commander: 'Urza, Lord High Artificer', at: '', by: '' }],
    ]
    const m = (round: number, table: number, p1: string, p2: string | null, score: [number, number, number] | null): TableMatch => ({ round, table, p1, p2, score })
    const matches = [m(1, 1, 'b', 'a', [1, 2, 0]), m(1, 0, 'c', null, null), m(2, 1, 'a', 'c', [1, 1, 1]), m(3, 1, 'c', 'a', [2, 0, 0]), m(3, 0, 'b', null, null)]
    const t = { date: '2026-11-23' } as Tournament
    const deck = { id: 'd1', name: 'Kinnan turbo' } as Deck
    const mine = personalMatches('S~5', t, players, matches, 'a', [deck], 'Savona · Tappa 5')
    expect(mine.map((x) => [x.id, x.result, x.score, x.opponentName, x.opponent, x.deckId, x.deckName])).toEqual([
      ['S~5~r1', 'W', [2, 1], 'Bruno', 'Spider-Man 2099', 'd1', 'Kinnan turbo'], // a was p2: turned round
      ['S~5~r2', 'D', [1, 1], 'Carla', 'Urza, Lord High Artificer', 'd1', 'Kinnan turbo'],
      ['S~5~r3', 'L', [0, 2], 'Carla', 'Urza, Lord High Artificer', 'd1', 'Kinnan turbo'],
    ])
    expect(mine.every((x) => x.kind === 'tournament' && x.format === 'bo3' && x.notes === 'Savona · Tappa 5')).toBe(true)
    expect(mine.map((x) => x.date)).toEqual([...mine.map((x) => x.date)].sort()) // the rounds in order
    // the bye isn't a match; a deck no longer in the app: the commander as its name
    const c = personalMatches('S~5', t, players, matches, 'c', [], '')
    expect(c.map((x) => [x.result, x.deckId, x.deckName])).toEqual([['D', undefined, 'Urza, Lord High Artificer'], ['W', undefined, 'Urza, Lord High Artificer']])
    expect(sideScore([1, 2, 0], true)).toBe('2-1')
    expect(sideScore([1, 1, 1], false)).toBe('1-1-1')
  })

  it("keeps the final position, and the photo's player when the deck of the app was the decklist", () => {
    const players: [string, Player][] = [
      ['a', { name: 'Anna', commander: 'Kinnan, Bonder Prodigy', deck: 'd1', list: true, at: '', by: '' }],
      ['b', { name: 'Bruno', commander: 'Spider-Man 2099', list: true, at: '', by: '' }],
    ]
    const matches: TableMatch[] = [{ round: 1, table: 1, p1: 'a', p2: 'b', score: [0, 2, 0] }]
    const t = { date: '2026-11-23', status: 'done', rounds: 1, cut: 0 } as Tournament
    const deck = { id: 'd1', name: 'Kinnan turbo' } as Deck
    expect(personalMatches('S~5', t, players, matches, 'a', [deck], 'Savona · Tappa 5').map((x) => [x.place, x.photo])).toEqual([[2, 'a']])
    // a Moxfield link, no deck of the app: no photo
    expect(personalMatches('S~5', t, players, matches, 'b', [], '').map((x) => [x.place, x.photo])).toEqual([[1, undefined]])
    // while it's played: no position yet
    expect(personalMatches('S~5', { ...t, status: 'swiss' }, players, matches, 'a', [deck], '')[0].place).toBeUndefined()
  })

  it("tells the tournaments a deck was played at, from the games in the stats", () => {
    const g = (id: string, result: 'W' | 'L' | 'D', more: Partial<Played> = {}): Played =>
      ({ id, date: '2026-11-23T10:00:00.000Z', result, deckId: 'd1', deckName: 'K', opponent: '', kind: 'tournament', notes: 'Savona · Tappa 5', ...more }) as Played
    const ms = [
      g('S~5~r1', 'W', { place: 3, photo: 'a' }),
      g('S~5~r2', 'L', { place: 3, photo: 'a' }),
      g('S~6~r1', 'D', { date: '2026-12-01T10:00:00.000Z', notes: 'Savona · Tappa 6' }),
      g('x1', 'W'), // a tournament game typed by hand: no tournament of the app
      g('S~7~r1', 'W', { deckId: 'd2' }), // another deck
    ]
    expect(deckTournaments(ms, 'd1').map((x) => [x.id, x.name, fmtRecord(x.rec), x.place, x.photo])).toEqual([
      ['S~6', 'Savona · Tappa 6', '0-0-1', undefined, undefined],
      ['S~5', 'Savona · Tappa 5', '1-1', 3, 'a'],
    ])
  })

  it('shows the Swiss standings while playing, the final order with the sheet\'s records once over', () => {
    const players: [string, Player][] = ['a', 'b', 'c', 'd'].map((id) => [id, { name: id.toUpperCase(), commander: id === 'd' ? null : 'X', at: '', by: '' }])
    const m = (round: number, table: number, p1: string, p2: string, score: [number, number, number]): TableMatch => ({ round, table, p1, p2, score })
    const swiss = [m(1, 1, 'a', 'b', [2, 0, 0]), m(1, 2, 'c', 'd', [2, 0, 0]), m(2, 1, 'a', 'c', [2, 0, 0]), m(2, 2, 'b', 'd', [2, 0, 0])]
    const final = m(3, 1, 'a', 'c', [0, 2, 0])
    const cut = ranking({ kind: 'l1', status: 'cut', rounds: 2, cut: 2 } as Tournament, players, [...swiss, final])
    expect(cut.map((r) => [r.id, r.points, `${r.wins}-${r.losses}`])).toEqual([['a', 6, '2-0'], ['b', 3, '1-1'], ['c', 3, '1-1'], ['d', 0, '0-2']])
    const done = ranking({ kind: 'l1', status: 'done', rounds: 2, cut: 2 } as Tournament, players, [...swiss, final])
    // c won the final: first, with the final in its record and points (6, as in the sheet), and its Swiss OMW
    expect(done.map((r) => [r.id, r.points, `${r.wins}-${r.losses}`])).toEqual([['c', 6, '2-1'], ['a', 6, '2-1'], ['b', 3, '1-1'], ['d', 0, '0-2']])
    expect(done[0]).toMatchObject({ name: 'C', commander: 'X', dropped: false, omwp: cut.find((r) => r.id === 'c')!.omwp })
    expect(done[3].commander).toBeNull()
    // a league stage: the top cut is for the prizes, places and records stay the Swiss ones, in the app and the sheet
    const league = { kind: 'league', status: 'done', rounds: 2, cut: 2 } as Tournament
    expect(ranking(league, players, [...swiss, final]).map((r) => [r.id, r.points, `${r.wins}-${r.losses}`])).toEqual(
      cut.map((r) => [r.id, r.points, `${r.wins}-${r.losses}`]),
    )
    expect(sheetData(league, players, [...swiss, final]).map((r) => [r.name, r.w, r.l])).toEqual([['A', 2, 0], ['B', 1, 1], ['C', 1, 1], ['D', 0, 2]])
  })
})

describe('commanders against commanders', () => {
  // the nightly meta build turns each tournament run in the app into pairings (scripts/meta/pairings.mjs)
  const pairingsOf = async (...args: unknown[]) =>
    (await import(/* @vite-ignore */ new URL('../../scripts/meta/pairings.mjs', import.meta.url).href)).pairingsOf(...args)

  it('takes each played match with the commanders of the sheet, by player key', async () => {
    const cmdOf = new Map([['ada', 0], ['bea', 1], ['cleo', 2], ['dan', -1]])
    const m = (p1: string, p2: string | null, score?: number[]) => ({ round: 1, table: 1, p1, p2, ...(score ? { score } : {}) })
    expect(
      await pairingsOf(4, [
        m('ada', 'bea', [2, 1, 0]), // ada's commander wins
        m('cleo', 'ada', [0, 2, 0]), // the second one wins
        m('bea', 'cleo', [1, 1, 1]), // a draw
        m('ada', null, [2, 0, 0]), // the bye
        m('bea', 'ada'), // no result
        m('ada', 'dan', [2, 0, 0]), // no commander in the sheet
        m('ada', 'zoe', [2, 0, 0]), // not in the sheet
      ], cmdOf),
    ).toEqual([
      [4, 0, 1, 1],
      [4, 2, 0, 2],
      [4, 1, 2, 0],
    ])
  })

  it("keeps each played match with the players' rows, for the Elo, commander or not", async () => {
    const { playerMatchesOf } = await import(/* @vite-ignore */ new URL('../../scripts/meta/pairings.mjs', import.meta.url).href)
    const entryOf = new Map([['ada', 10], ['bea', 11], ['dan', 12]])
    const m = (round: number, p1: string, p2: string | null, score?: number[]) => ({ round, table: 1, p1, p2, ...(score ? { score } : {}) })
    expect(
      playerMatchesOf(4, [
        m(1, 'ada', 'bea', [2, 1, 0]),
        m(1, 'dan', null, [2, 0, 0]), // the bye
        m(2, 'bea', 'dan', [1, 1, 1]), // dan has no commander in the sheet: still a match
        m(2, 'ada', 'zoe', [2, 0, 0]), // not in the sheet
        m(3, 'ada', 'dan'), // no result
        m(4, 'bea', 'ada', [0, 2]), // the top cut's final, a score without draws
      ], entryOf),
    ).toEqual([
      [4, 10, 11, 2, 1, 0, 1],
      [4, 11, 12, 1, 1, 1, 2],
      [4, 11, 10, 0, 2, 0, 4],
    ])
  })

  it("adds up a commander's matches against each other one, from either side, mirrors left out", () => {
    const ds = {
      tournaments: [stage(1, { season: 's1' }), stage(2)],
      pairings: [
        { t: 0, a: 0, b: 1, r: 1 },
        { t: 1, a: 1, b: 0, r: 1 },
        { t: 1, a: 0, b: 1, r: 1 },
        { t: 1, a: 2, b: 0, r: 2 },
        { t: 1, a: 0, b: 2, r: 0 },
        { t: 1, a: 0, b: 0, r: 1 }, // mirror
        { t: 1, a: 1, b: 2, r: 1 }, // without commander 0
      ],
    } as MetaDataset
    expect(matchupsOf(ds, ALL, 0)).toEqual([
      { id: 1, wins: 2, losses: 1, draws: 0, games: 3 },
      { id: 2, wins: 1, losses: 0, draws: 1, games: 2 },
    ])
    // the filters of the page: the second season only; as many matches, the better winrate first
    expect(matchupsOf(ds, { ...ALL, season: 's2' }, 0)).toEqual([
      { id: 2, wins: 1, losses: 0, draws: 1, games: 2 },
      { id: 1, wins: 1, losses: 1, draws: 0, games: 2 },
    ])
    // the same matches seen from the other side
    expect(matchupsOf(ds, ALL, 1)).toEqual([
      { id: 0, wins: 1, losses: 2, draws: 0, games: 3 },
      { id: 2, wins: 1, losses: 0, draws: 0, games: 1 },
    ])
  })
})

describe('the calendar of the next tournaments', () => {
  const day = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv')
  const tour = (p: Partial<Tournament>) => ({ name: 'Savona', kind: 'league', stage: 4, status: 'open', date: day(3), cut: 0, ...p }) as Tournament

  it('keeps the ones not started, from today on, not hidden, the soonest first', () => {
    const list: [string, Tournament][] = [
      ['late', tour({ date: day(9) })],
      ['afternoon', tour({ date: day(2), time: '15:00' })],
      ['morning', tour({ date: day(2), time: '10:00' })],
      ['today', tour({ date: day(0) })],
      ['yesterday', tour({ date: day(-1) })],
      ['playing', tour({ status: 'swiss' })],
      ['hidden', tour({ hidden: true })],
    ]
    expect(upcoming(list).map(([id]) => id)).toEqual(['today', 'morning', 'afternoon', 'late'])
  })

  it('makes a calendar file: from the start time, or the whole day', () => {
    const at = icsOf('sv~4', tour({ date: '2026-11-15', time: '15:30', place: 'Fortezza', address: 'Via Roma 1, Savona' }), 'Savona · Tappa 4', 'https://x/#live/sv~4')
    expect(at).toContain('DTSTART:20261115T153000')
    expect(at).toContain('LOCATION:Fortezza\\, Via Roma 1\\, Savona')
    expect(at.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
    const allDay = icsOf('sv~4', tour({ date: '2026-11-15' }), 'Savona', 'https://x')
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261115')
    expect(allDay).not.toContain('LOCATION')
  })
})
