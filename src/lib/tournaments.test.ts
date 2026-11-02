import { describe, expect, it } from 'vitest'
import type { MetaDataset, MetaTournament } from './meta'
import type { Source } from './sources'
import { type Player, type TableMatch, type Tournament, entrantsOf, nextStage, results, tournamentId } from './tournaments'

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

  it('reads the players for the engine: late entries and drops', () => {
    const players: [string, Player][] = [
      ['a', { name: 'A', commander: 'X', at: '', by: '' }],
      ['b', { name: 'B', commander: null, joined: 2, drop: 3, at: '', by: '' }],
    ]
    expect(entrantsOf(players)).toEqual([{ id: 'a', joined: undefined, drop: undefined }, { id: 'b', joined: 2, drop: 3 }])
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
})
