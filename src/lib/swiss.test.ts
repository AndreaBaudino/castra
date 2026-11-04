import { describe, expect, it } from 'vitest'
import {
  type Entrant,
  type Match,
  type Score,
  cutPairings,
  cutSeeds,
  finalOrder,
  nextCut,
  pairRound,
  standings,
  suggestedRounds,
  validScore,
  winnerOf,
} from './swiss'

// The tournament engine: a mistake here gives wrong pairings or wrong standings at a real tournament, so the cases
// below are worked out by hand, and whole tournaments are simulated to check what must always hold.

/** A seeded random generator (mulberry32): the same pairings at every run. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const players = (...ids: string[]): Entrant[] => ids.map((id) => ({ id }))
const m = (round: number, p1: string, p2: string | null, score?: Score): Match => ({ round, p1, p2, score })
const byId = (st: ReturnType<typeof standings>) => new Map(st.map((s) => [s.id, s]))
const ids = (pairs: [string, string | null][]) => pairs.flat().filter((x): x is string => !!x)

describe('results', () => {
  it('tells the winner: 2-1, 1-0 when time ran out, 1-1, 0-0 and 1-1-1 are draws', () => {
    expect([[2, 1, 0], [1, 2, 0], [1, 0, 0], [0, 1, 2], [1, 1, 0], [0, 0, 0], [1, 1, 1], [0, 0, 3]].map((s) => winnerOf(s as Score))).toEqual([
      1, 2, 1, 2, 0, 0, 0, 0,
    ])
  })

  it('accepts only Bo3 results', () => {
    const ok: Score[] = [[2, 0, 0], [2, 1, 0], [0, 2, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [2, 0, 1], [0, 0, 0], [0, 0, 3]]
    const bad: Score[] = [[3, 0, 0], [2, 2, 0], [2, 1, 1], [0, 0, 4], [-1, 2, 0], [1.5, 0, 0], [0, 3, 0]]
    expect(ok.every(validScore)).toBe(true)
    expect(bad.filter(validScore)).toEqual([])
  })

  it('suggests the Swiss rounds the circuit plays: enough for one undefeated player', () => {
    const table = [0, 1, 2, 4, 5, 8, 9, 16, 17, 32, 33, 64, 65, 128].map((n) => [n, suggestedRounds(n)])
    expect(table).toEqual([
      [0, 0], [1, 0], [2, 1], [4, 2], [5, 3], [8, 3], [9, 4], [16, 4], [17, 5], [32, 5], [33, 6], [64, 6], [65, 7], [128, 7],
    ])
  })
})

describe('standings', () => {
  // six players, three rounds; every number below is worked out by hand
  const six = players('A', 'B', 'C', 'D', 'E', 'F')
  const games: Match[] = [
    m(1, 'A', 'B', [2, 0, 0]),
    m(1, 'C', 'D', [2, 1, 0]),
    m(1, 'E', 'F', [1, 1, 0]),
    m(2, 'A', 'C', [2, 1, 0]),
    m(2, 'E', 'D', [2, 0, 0]),
    m(2, 'F', 'B', [0, 2, 0]),
    m(3, 'A', 'E', [0, 2, 0]),
    m(3, 'C', 'B', [2, 0, 0]),
    m(3, 'D', 'F', [0, 0, 0]), // intentional draw
  ]

  it('counts 3/1/0 points, matches and games, with an intentional draw as 0-0', () => {
    const s = byId(standings(six, games))
    expect([...s.values()].map((x) => [x.id, x.points, x.wins, x.losses, x.draws])).toEqual([
      ['E', 7, 2, 0, 1],
      ['A', 6, 2, 1, 0],
      ['C', 6, 2, 1, 0],
      ['B', 3, 1, 2, 0],
      ['F', 2, 0, 1, 2],
      ['D', 1, 0, 2, 1],
    ])
    // game points: 3 a game won, 1 a game drawn, over 3 a game played
    expect(s.get('A')!.gwp).toBeCloseTo(12 / 21) // 4-3
    expect(s.get('C')!.gwp).toBeCloseTo(15 / 24) // 5-3
    expect(s.get('E')!.gwp).toBeCloseTo(15 / 18) // 5-1 and a drawn match 1-1
    expect(s.get('B')!.gwp).toBeCloseTo(6 / 18) // 2-4: 0.3333, just above the floor
    expect(s.get('D')!.gwp).toBe(0.33) // 1-4 (0.2): the floor
    expect(s.get('F')!.gwp).toBe(0.33) // 1-3 (0.25): the floor
  })

  it('puts A above C on opponents\' match-win %, each opponent at least 0.33', () => {
    const s = byId(standings(six, games))
    expect(s.get('A')!.mwp).toBeCloseTo(6 / 9)
    expect(s.get('D')!.mwp).toBe(0.33) // 1/9
    expect(s.get('A')!.omwp).toBeCloseTo((3 / 9 + 6 / 9 + 7 / 9) / 3) // B, C, E: 0.5926
    expect(s.get('C')!.omwp).toBeCloseTo((0.33 + 6 / 9 + 3 / 9) / 3) // D at the floor, A, B: 0.4433
    expect(s.get('B')!.omwp).toBeCloseTo((6 / 9 + 0.33 + 6 / 9) / 3) // A, F at the floor, C
    expect(s.get('A')!.ogwp).toBeCloseTo((6 / 18 + 15 / 24 + 15 / 18) / 3) // B, C, E: 0.5972
  })

  it('then on game-win %, with the floor deciding between two who lost every game', () => {
    const st = standings(players('A', 'B', 'C', 'D'), [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', 'D', [2, 1, 0])])
    // A and C: 3 points, opponents both at 0.33; A won its games 2-0, C 2-1
    // B and D: 0 points, opponents both at 1.0; B 0 game points (0.33), D 3 out of 9 (0.3333)
    expect(st.map((s) => s.id)).toEqual(['A', 'C', 'D', 'B'])
  })

  it("then on opponents' game-win %", () => {
    const st = standings(players('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'), [
      m(1, 'A', 'B', [2, 0, 0]),
      m(1, 'C', 'D', [2, 0, 0]),
      m(1, 'E', 'F', [2, 0, 0]),
      m(1, 'G', 'H', [2, 1, 0]),
      m(2, 'A', 'E', [2, 0, 0]),
      m(2, 'C', 'G', [2, 0, 0]),
      m(2, 'B', 'D', [1, 1, 0]),
      m(2, 'F', 'H', [2, 0, 0]),
    ])
    const s = byId(st)
    // A and C: 6 points, 4-0 in games; opponents B and E, D and G, at 0.33 and 0.5 each
    expect(s.get('A')!.omwp).toBeCloseTo(s.get('C')!.omwp)
    expect(s.get('A')!.gwp).toBe(s.get('C')!.gwp)
    // their games: E 2-0 then 0-2 (0.5), G 2-1 then 0-2 (6 out of 15: 0.4); B and D 0.25, at the floor
    expect(s.get('A')!.ogwp).toBeCloseTo((0.33 + 0.5) / 2)
    expect(s.get('C')!.ogwp).toBeCloseTo((0.33 + 0.4) / 2)
    expect(st.slice(0, 2).map((x) => x.id)).toEqual(['A', 'C'])
  })

  it('then always the same order on every phone, whatever the order of the matches', () => {
    const list = players('B', 'A', 'D', 'C')
    const ms = [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', 'D', [2, 0, 0])]
    // A and C are equal on everything: the player key decides
    expect(standings(list, ms).map((s) => s.id)).toEqual(['A', 'C', 'B', 'D'])
    expect(standings([...list].reverse(), [...ms].reverse()).map((s) => s.id)).toEqual(['A', 'C', 'B', 'D'])
  })

  it('counts a bye as a match won 2-0, and not as an opponent of anyone', () => {
    const st = byId(standings(players('A', 'B', 'C'), [m(1, 'A', 'B', [2, 1, 0]), m(1, 'C', null)]))
    expect(st.get('C')).toMatchObject({ points: 3, wins: 1, byes: 1, mwp: 1, gwp: 1, omwp: 0.33, ogwp: 0.33 })
    expect(st.get('A')!.omwp).toBe(0.33) // only B, who lost
  })

  it('gives a late entry a 0-2 loss for every round missed', () => {
    const list: Entrant[] = [...players('A', 'B', 'C'), { id: 'L', joined: 3 }]
    const st = byId(standings(list, [m(3, 'L', 'C', [2, 1, 0])]))
    // two rounds lost 0-2 and one won 2-1: 3 points out of 9, 6 game points out of 21 (at the floor)
    expect(st.get('L')).toMatchObject({ points: 3, wins: 1, losses: 2, mwp: 3 / 9, gwp: 0.33 })
    expect(st.get('L')!.omwp).toBe(0.33) // C, who lost: the missed rounds have no opponent
    expect(st.get('C')!.omwp).toBeCloseTo(3 / 9) // L counts with all three rounds
  })

  it('keeps a dropped player, with the matches played; unreported matches count for no one', () => {
    const list: Entrant[] = [...players('A', 'B', 'C'), { id: 'D', drop: 1 }]
    const st = byId(standings(list, [m(1, 'A', 'D', [0, 2, 0]), m(1, 'B', 'C', [2, 0, 0]), m(2, 'A', 'B'), m(2, 'C', null)]))
    expect(st.get('D')).toMatchObject({ points: 3, dropped: true })
    expect(st.get('A')).toMatchObject({ points: 0, wins: 0, losses: 1 })
    expect(st.get('B')).toMatchObject({ points: 3, wins: 1, losses: 0 }) // round 2 not reported yet
  })
})

describe('pairings', () => {
  it('round 1: everyone once, in a random order; with an odd number, one bye', () => {
    const list = players('A', 'B', 'C', 'D', 'E')
    const one = pairRound(list, [], 1, seeded(1))
    expect(ids(one).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(one.filter(([, b]) => b === null)).toHaveLength(1)
    expect(one.at(-1)![1]).toBeNull() // the bye last
    // another seed, another draw
    const draws = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(pairRound(list, [], 1, seeded(s)))))
    expect(draws.size).toBeGreaterThan(1)
  })

  it('round 2: winners meet winners, losers meet losers, best table first', () => {
    const list = players('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')
    const r1 = [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', 'D', [2, 1, 0]), m(1, 'E', 'F', [0, 2, 0]), m(1, 'G', 'H', [1, 2, 0])]
    for (const seed of [1, 2, 3, 4, 5]) {
      const r2 = pairRound(list, r1, 2, seeded(seed))
      const winners = ['A', 'C', 'F', 'H']
      expect(r2).toHaveLength(4)
      expect(r2.slice(0, 2).flat().every((p) => winners.includes(p!))).toBe(true)
      expect(r2.slice(2).flat().every((p) => !winners.includes(p!))).toBe(true)
    }
  })

  it('a drawn group with an odd number sends one player down to the next one', () => {
    const list = players('A', 'B', 'C', 'D', 'E', 'F')
    const r1 = [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', 'D', [2, 0, 0]), m(1, 'E', 'F', [1, 1, 0])]
    const r2 = pairRound(list, r1, 2, seeded(7))
    // A and C (3 points) meet; E and F (1 point) met already, so each meets one of B and D (0 points)
    expect(r2[0].slice().sort()).toEqual(['A', 'C'])
    expect(r2.slice(1).map((p) => p.slice().sort().join(''))).toEqual(expect.arrayContaining([expect.stringMatching(/^[BD][EF]$/)]))
    expect(ids(r2).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('never pairs a rematch while there is another way, even far down the standings', () => {
    const list = players('A', 'B', 'C', 'D')
    const r12 = [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', 'D', [2, 0, 0]), m(2, 'A', 'C', [2, 0, 0]), m(2, 'B', 'D', [2, 0, 0])]
    // A 6 points, B and C 3, D 0: A has met B and C, so A-D and B-C
    for (const seed of [1, 2, 3]) {
      const r3 = pairRound(list, r12, 3, seeded(seed))
      expect(r3.map((p) => p.slice().sort().join(''))).toEqual(['AD', 'BC'])
    }
  })

  it('when everyone has met everyone, still pairs everyone (with a rematch)', () => {
    const list = players('A', 'B', 'C', 'D')
    const all = [
      m(1, 'A', 'B', [2, 0, 0]),
      m(1, 'C', 'D', [2, 0, 0]),
      m(2, 'A', 'C', [2, 0, 0]),
      m(2, 'B', 'D', [2, 0, 0]),
      m(3, 'A', 'D', [2, 0, 0]),
      m(3, 'B', 'C', [2, 0, 0]),
    ]
    const r4 = pairRound(list, all, 4, seeded(1))
    expect(r4).toHaveLength(2)
    expect(ids(r4).sort()).toEqual(['A', 'B', 'C', 'D'])
  })

  it('gives the bye to the lowest player without one', () => {
    const list = players('A', 'B', 'C', 'D', 'E')
    const r1 = [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', 'D', [2, 0, 0]), m(1, 'E', null)]
    for (const seed of [1, 2, 3, 4]) {
      const bye = pairRound(list, r1, 2, seeded(seed)).find(([, b]) => b === null)![0]
      expect(['B', 'D']).toContain(bye) // 0 points; E has 3 and had it
    }
    // three players: C had the bye in round 1, B in round 2; in round 3 it goes to A, and B meets C
    const three = players('A', 'B', 'C')
    const done = [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', null), m(2, 'C', 'A', [2, 0, 0]), m(2, 'B', null)]
    expect(pairRound(three, done, 3, seeded(1))).toEqual([expect.arrayContaining(['B', 'C']), ['A', null]])
  })

  it('moves the bye up when giving it to the lowest one would force a rematch', () => {
    // nine players after six rounds (found by a simulation); 'AB' means A beat B 2-0, a single letter a bye
    const list = players('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I')
    const rounds = [
      ['HE', 'DG', 'AC', 'BF', 'I'],
      ['ID', 'AB', 'HF', 'GC', 'E'],
      ['IA', 'GH', 'BE', 'DF', 'C'],
      ['BI', 'AG', 'HD', 'CE', 'F'],
      ['HA', 'DB', 'IC', 'EF', 'G'],
      ['IH', 'BG', 'ED', 'CF', 'A'],
    ]
    const done = rounds.flatMap((r, i) => r.map((x) => (x.length === 1 ? m(i + 1, x, null) : m(i + 1, x[0], x[1], [2, 0, 0]))))
    const points = new Map(standings(list, done).map((x) => [x.id, x.points]))
    // without a bye yet: D (9 points), B and H (12); everyone else had one
    expect([points.get('D'), points.get('B'), points.get('H')]).toEqual([9, 12, 12])
    const met = new Set(done.filter((x) => x.p2).map((x) => [x.p1, x.p2].sort().join('')))
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r7 = pairRound(list, done, 7, seeded(seed))
      const bye = r7.find(([, b]) => b === null)![0]
      expect(['B', 'H']).toContain(bye) // not D: the other eight couldn't avoid a rematch
      expect(r7.filter(([, b]) => b).some((p) => met.has(p.slice().sort().join('')))).toBe(false)
    }
  })

  it('leaves out who dropped and brings in a late entry from its round', () => {
    const list: Entrant[] = [...players('A', 'B', 'C', 'D'), { id: 'E', drop: 1 }, { id: 'L', joined: 2 }]
    expect(ids(pairRound(list, [], 1, seeded(1))).sort()).toEqual(['A', 'B', 'C', 'D', 'E']) // L not yet
    const r1 = [m(1, 'A', 'B', [2, 0, 0]), m(1, 'C', 'D', [2, 0, 0]), m(1, 'E', null)]
    expect(ids(pairRound(list, r1, 2, seeded(1))).sort()).toEqual(['A', 'B', 'C', 'D', 'L']) // E gone, L in
  })
})

// hundreds of simulated tournaments: seconds on a slow machine, past Vitest's 5 s default
describe('whole tournaments', { timeout: 60_000 }, () => {
  // random tournaments of every size, with draws, drops and late entries: what must always hold
  const SCORES: Score[] = [[2, 0, 0], [2, 1, 0], [0, 2, 0], [1, 2, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0], [2, 0, 1]]
  type Run = { entrants: Entrant[]; matches: Match[]; rounds: number }

  function run(n: number, seed: number, chaos: boolean): Run {
    const rand = seeded(seed)
    const entrants: Entrant[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}` }))
    const matches: Match[] = []
    const rounds = suggestedRounds(n)
    for (let r = 1; r <= rounds; r++) {
      if (chaos && r > 1) {
        for (const e of entrants) if (e.drop == null && (e.joined ?? 1) < r && rand() < 0.06) e.drop = r - 1
        if (rand() < 0.3) entrants.push({ id: `late${r}`, joined: r })
      }
      const playing = entrants.filter((e) => (e.joined ?? 1) <= r && (e.drop == null || e.drop >= r)).map((e) => e.id)
      const before = matches.filter((x) => x.round < r)
      const points = new Map(standings(entrants, before).map((s) => [s.id, s.points]))
      const pairs = pairRound(entrants, matches, r, rand)

      // everyone still in, once
      expect(ids(pairs).sort()).toEqual([...playing].sort())
      // one bye with an odd number, none otherwise, never twice to the same player
      const byes = pairs.filter(([, b]) => b === null)
      expect(byes).toHaveLength(playing.length % 2)
      for (const [p] of byes) expect(before.some((x) => !x.p2 && x.p1 === p)).toBe(false)
      // no rematches
      const met = new Set(before.filter((x) => x.p2).map((x) => [x.p1, x.p2].sort().join('|')))
      for (const [a, b] of pairs) if (b) expect(met.has([a, b].sort().join('|'))).toBe(false)
      // tables best first
      const top = pairs.filter(([, b]) => b).map(([a, b]) => Math.max(points.get(a)!, points.get(b!)!))
      expect(top).toEqual([...top].sort((x, y) => y - x))

      for (const [a, b] of pairs) matches.push(b ? m(r, a, b, SCORES[Math.floor(rand() * SCORES.length)]) : m(r, a, null))
    }
    return { entrants, matches, rounds }
  }

  it('pairs everyone once a round, one bye at most and never twice, no rematches, best tables first', () => {
    let tournaments = 0
    for (let n = 2; n <= 64; n++) for (let seed = 1; seed <= 12; seed++, tournaments++) run(n, seed * 1000 + n, n > 5)
    expect(tournaments).toBe(63 * 12)
  })

  /**
   * The closest pairing there is, trying every one: the least sum of squared gaps in points, a rematch costing
   * `rematch` (Infinity: none possible without one).
   */
  function best(list: string[], met: Set<string>, points: Map<string, number>, rematch = Infinity): number {
    if (!list.length) return 0
    const [a, ...rest] = list
    let least = Infinity
    for (let i = 0; i < rest.length; i++) {
      const again = met.has([a, rest[i]].sort().join('|')) ? rematch : 0
      least = Math.min(least, (points.get(a)! - points.get(rest[i])!) ** 2 + again + best(rest.filter((_, j) => j !== i), met, points, rematch))
    }
    return least
  }

  it('pairs as close in points as trying every pairing, with a rematch only when nothing else is possible', () => {
    let rounds = 0
    let rematches = 0
    for (let n = 4; n <= 12; n++)
      for (let seed = 1; seed <= 25; seed++) {
        const rand = seeded(seed * 31 + n)
        const entrants: Entrant[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}` }))
        const matches: Match[] = []
        // two rounds more than suggested, so that rematches become unavoidable
        for (let r = 1; r <= Math.min(n - 1, suggestedRounds(n) + 2); r++, rounds++) {
          const before = matches.filter((x) => x.round < r)
          const points = new Map(standings(entrants, before).map((x) => [x.id, x.points]))
          const met = new Set(before.filter((x) => x.p2).map((x) => [x.p1, x.p2].sort().join('|')))
          const pairs = pairRound(entrants, matches, r, rand)
          const bye = pairs.find(([, b]) => !b)?.[0]
          const seated = pairs.filter(([, b]) => b) as [string, string][]
          const all = entrants.map((e) => e.id)
          const again = seated.filter(([a, b]) => met.has([a, b].sort().join('|'))).length
          const gaps = seated.reduce((sum, [a, b]) => sum + (points.get(a)! - points.get(b)!) ** 2, 0)
          if (again) {
            rematches++
            // impossible whoever gets the bye; then as few rematches as there can be, and the closest pairing with them
            for (const c of n % 2 ? all : [null]) expect(best(all.filter((id) => id !== c), met, points)).toBe(Infinity)
            expect(again * 1e6 + gaps).toBe(best(all.filter((id) => id !== bye), met, points, 1e6))
          } else expect(gaps).toBe(best(all.filter((id) => id !== bye), met, points))
          for (const [a, b] of pairs) matches.push(b ? m(r, a, b, SCORES[Math.floor(rand() * SCORES.length)]) : m(r, a, null))
        }
      }
    expect(rounds).toBe(1150) // 46 rounds for each seed, from 4 to 12 players
    expect(rematches).toBeGreaterThan(10) // the case was tried
  })

  it('adds up: points, rounds and games of every player', () => {
    for (const [n, seed] of [[7, 1], [16, 2], [23, 3], [40, 4], [64, 5]]) {
      const { entrants, matches, rounds } = run(n, seed, true)
      const st = standings(entrants, matches)
      const reported = matches.filter((x) => x.p2)
      const draws = reported.filter((x) => winnerOf(x.score!) === 0).length
      const byes = matches.length - reported.length
      expect(st.reduce((s, x) => s + x.points, 0)).toBe(3 * (reported.length - draws) + 2 * draws + 3 * byes)
      for (const e of entrants) {
        const s = st.find((x) => x.id === e.id)!
        const last = Math.min(e.drop ?? rounds, rounds)
        // late rounds lost, then one match (or bye) a round until the drop
        expect(s.wins + s.losses + s.draws).toBe(last)
        expect(s.points).toBe(3 * s.wins + s.draws)
      }
      // ordered by points, then the tiebreakers
      for (let i = 1; i < st.length; i++) {
        const [a, b] = [st[i - 1], st[i]]
        const key = (x: typeof a) => [x.points, x.omwp, x.gwp, x.ogwp]
        const ka = key(a)
        const kb = key(b)
        const first = ka.findIndex((v, j) => Math.abs(v - kb[j]) > 1e-9)
        if (first >= 0) expect(ka[first]).toBeGreaterThan(kb[first])
        else expect(a.id < b.id).toBe(true)
      }
    }
  })
})

describe('top cut', () => {
  const ranked = (...list: string[]) => standings(players(...list), []).sort((a, b) => list.indexOf(a.id) - list.indexOf(b.id))

  it('seeds the best who have not dropped', () => {
    const list = [...players('A', 'B', 'C', 'E', 'F'), { id: 'D', drop: 2 }]
    const st = standings(list, [m(1, 'D', 'A', [2, 0, 0]), m(1, 'B', 'C', [2, 0, 0]), m(1, 'E', 'F', [2, 0, 0])])
    expect(st.map((s) => s.id).slice(0, 3)).toEqual(['B', 'D', 'E'])
    expect(cutSeeds(st, 2)).toEqual(['B', 'E'])
  })

  it('pairs the bracket so that the first two can meet only in the final', () => {
    expect(cutPairings(['1', '2'])).toEqual([['1', '2']])
    expect(cutPairings(['1', '2', '3', '4'])).toEqual([['1', '4'], ['2', '3']])
    expect(cutPairings(['1', '2', '3', '4', '5', '6', '7', '8'])).toEqual([['1', '8'], ['4', '5'], ['2', '7'], ['3', '6']])
    // fewer players than the cut (drops): no bracket with an empty seat
    expect(() => cutPairings(['1', '2', '3', '4', '5', '6'])).toThrow()
  })

  it('moves the winners on in bracket order, only once every match has one', () => {
    const qf = [m(5, '1', '8', [2, 0, 0]), m(5, '4', '5', [1, 2, 0]), m(5, '2', '7', [2, 1, 0]), m(5, '3', '6', [0, 2, 0])]
    expect(nextCut(qf)).toEqual([['1', '5'], ['2', '6']])
    expect(nextCut([qf[0], m(5, '4', '5')])).toBeNull() // not reported
    expect(nextCut([qf[0], m(5, '4', '5', [1, 1, 0])])).toBeNull() // a draw can't move on
    expect(nextCut([m(6, '1', '5', [2, 0, 0])])).toBeNull() // the final has no next round
  })

  it('orders the final standings by the top cut, then by the Swiss', () => {
    const st = ranked('1', '2', '3', '4', '5', '6', '7', '8', '9', '10')
    const cut = [
      m(5, '1', '8', [2, 0, 0]),
      m(5, '4', '5', [1, 2, 0]),
      m(5, '2', '7', [2, 1, 0]),
      m(5, '3', '6', [0, 2, 0]),
      m(6, '1', '5', [2, 0, 0]),
      m(6, '2', '6', [0, 2, 0]),
      m(7, '1', '6', [1, 2, 0]),
    ]
    // 6 won the final, 1 lost it, 2 and 5 lost the semifinals, 3 4 7 8 the quarterfinals
    expect(finalOrder(st, cut)).toEqual(['6', '1', '2', '5', '3', '4', '7', '8', '9', '10'])
    // halfway, with the semifinals played and the final not yet: who's in the final first
    expect(finalOrder(st, cut.slice(0, 6))).toEqual(['1', '6', '2', '5', '3', '4', '7', '8', '9', '10'])
    // no top cut: the Swiss standings
    expect(finalOrder(st, [])).toEqual(st.map((s) => s.id))
  })
})
