import { describe, expect, it } from 'vitest'
import type { MetaDataset, MetaTournament } from './meta'
import type { Source } from './sources'
import type { Deck } from './decks'
import {
  type Player,
  type TableMatch,
  type Tournament,
  entrantsOf,
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
    const t = { status: 'cut', rounds: 2, cut: 2 } as Tournament
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
    const rows = sheetRows({ status: 'done', rounds: 2, cut: 2 } as Tournament, players, matches)
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
    expect(sheetData({ status: 'done', rounds: 2, cut: 2 } as Tournament, players, matches, new Map([['a', mox]]))).toEqual([
      { name: 'Bruno', commander: 'Spider-Man 2099', w: 2, l: 1, d: 0, bye: false, list: '' },
      { name: 'Anna', commander: 'Kinnan, Bonder Prodigy', w: 1, l: 1, d: 1, bye: false, list: mox },
      { name: 'Carla', commander: 'Jeska, Thrice Reborn / Yoshimaru, Ever Faithful', w: 1, l: 0, d: 1, bye: true, list: '' },
      { name: 'Luca', commander: null, w: 0, l: 2, d: 0, bye: false, list: '' },
    ])
    expect(sheetRows({ status: 'done', rounds: 2, cut: 2 } as Tournament, players, matches, new Map([['a', mox]])).results.split('\n')[1]).toBe(
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

  it('shows the Swiss standings while playing, the final order with the sheet\'s records once over', () => {
    const players: [string, Player][] = ['a', 'b', 'c', 'd'].map((id) => [id, { name: id.toUpperCase(), commander: id === 'd' ? null : 'X', at: '', by: '' }])
    const m = (round: number, table: number, p1: string, p2: string, score: [number, number, number]): TableMatch => ({ round, table, p1, p2, score })
    const swiss = [m(1, 1, 'a', 'b', [2, 0, 0]), m(1, 2, 'c', 'd', [2, 0, 0]), m(2, 1, 'a', 'c', [2, 0, 0]), m(2, 2, 'b', 'd', [2, 0, 0])]
    const final = m(3, 1, 'a', 'c', [0, 2, 0])
    const cut = ranking({ status: 'cut', rounds: 2, cut: 2 } as Tournament, players, [...swiss, final])
    expect(cut.map((r) => [r.id, r.points, `${r.wins}-${r.losses}`])).toEqual([['a', 6, '2-0'], ['b', 3, '1-1'], ['c', 3, '1-1'], ['d', 0, '0-2']])
    const done = ranking({ status: 'done', rounds: 2, cut: 2 } as Tournament, players, [...swiss, final])
    // c won the final: first, with the final in its record and points (6, as in the sheet), and its Swiss OMW
    expect(done.map((r) => [r.id, r.points, `${r.wins}-${r.losses}`])).toEqual([['c', 6, '2-1'], ['a', 6, '2-1'], ['b', 3, '1-1'], ['d', 0, '0-2']])
    expect(done[0]).toMatchObject({ name: 'C', commander: 'X', dropped: false, omwp: cut.find((r) => r.id === 'c')!.omwp })
    expect(done[3].commander).toBeNull()
  })
})
