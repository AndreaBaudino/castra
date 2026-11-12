import { describe, expect, it } from 'vitest'
import { BASE, computeElo, idle, tournamentDays } from './elo.mjs'

// The rules of docs/elo.md on small years shaped as meta.json: tournaments, entries ([tournament, player, commander,
// place, w, l, d, bye]) and the matches played in Castra ([tournament, entry, entry, won, lost, drawn, round]).

const stage = (st, d, lg = 'Sanremo') => ({ id: `s1-${lg}-${st}`, k: 'league', s: 's1', lg, st, d })
const event = (k, d) => ({ id: `${k}-${d}`, k, s: 's1', n: 'X', d })
const row = (ti, player, place, w, l, d = 0, bye = 0) => [ti, player, 0, place, w, l, d, bye, null]
// a 4-player stage of 3 rounds in the order given
const four = (ti, [a, b, c, d]) => [row(ti, a, 1, 3, 0), row(ti, b, 2, 2, 1), row(ti, c, 3, 1, 2), row(ti, d, 4, 0, 3)]
const after = (r, i) => r.e[i][1]

describe('Elo', () => {
  it('starts everyone at 1000 and moves winners up, losers down', () => {
    const r = computeElo({ year: 2026, t: [stage(1, '2026-01-10')], e: four(0, ['A', 'B', 'C', 'D']) })
    expect(r.e.map((x) => x[0])).toEqual([BASE, BASE, BASE, BASE])
    expect(after(r, 0)).toBeGreaterThan(BASE)
    expect(after(r, 3)).toBeLessThan(BASE)
    expect(after(r, 0) - BASE).toBeCloseTo(BASE - after(r, 3), 5)
  })

  it('pays more for beating a stronger player', () => {
    // A climbs in the first stage, then E beats A in one stage and F beats D (the weakest) in another
    const t = [stage(1, '2026-01-10'), stage(2, '2026-01-17'), stage(3, '2026-01-17', 'Genova')]
    const e = [...four(0, ['A', 'B', 'C', 'D']), row(1, 'E', 1, 3, 0), row(1, 'A', 2, 0, 3), row(2, 'F', 1, 3, 0), row(2, 'D', 2, 0, 3)]
    const r = computeElo({ year: 2026, t, e })
    expect(r.e[4][2]).toBeGreaterThan(r.e[6][2])
  })

  it('counts the matches played in Castra, without intentional draws, and the top cut only in the levels', () => {
    const t = [stage(1, '2026-01-10'), event('l2', '2026-01-20')]
    const e = [row(0, 'A', 1, 2, 0), row(0, 'B', 2, 1, 1), row(0, 'C', 3, 0, 2), row(1, 'A', 1, 3, 0), row(1, 'B', 2, 1, 2)]
    const pm = [
      [0, 0, 1, 2, 0, 0, 1], [0, 0, 2, 0, 0, 0, 2], // A beats B; A-C is an intentional draw
      [0, 1, 2, 2, 1, 0, 2], [0, 0, 1, 0, 2, 0, 3], // B beats C; B wins the top cut of a stage: not counted
      [1, 3, 4, 2, 0, 0, 4], // a level's top cut counts
    ]
    const r = computeElo({ year: 2026, t, e, pm })
    expect(r.pm[1]).toBeNull()
    expect(r.pm[3]).toBeNull()
    expect(r.pm[0][0]).toBeGreaterThan(0)
    expect(r.pm[0][1]).toBeLessThan(0)
    expect(r.pm[4][0]).toBeGreaterThan(0)
    // a stage's move is the sum of its matches
    expect(r.e[0][2]).toBeCloseTo(r.pm[0][0], 0)
  })

  it('compares a drop by points per round, not by the place the sheet gives', () => {
    const t = [stage(1, '2026-01-10')]
    // D drops at 1-0 and ends last on the sheet; C plays all three rounds at 0-3
    const e = [row(0, 'A', 1, 3, 0), row(0, 'B', 2, 2, 1), row(0, 'C', 3, 0, 3), row(0, 'D', 4, 1, 0)]
    const r = computeElo({ year: 2026, t, e })
    expect(after(r, 3)).toBeGreaterThan(after(r, 2))
  })

  it("brings the league's move at the player's next tournament", () => {
    // Sanremo's players lose a level to Genova's; S2 of Sanremo did not play it and sees it at their next stage
    const t = [stage(1, '2026-01-10'), stage(1, '2026-01-10', 'Genova'), event('l1', '2026-01-20'), stage(2, '2026-02-01')]
    const e = [
      ...four(0, ['S1', 'S2', 'S3', 'S4']), ...four(1, ['G1', 'G2', 'G3', 'G4']),
      row(2, 'G1', 1, 3, 0), row(2, 'G2', 2, 2, 1), row(2, 'S1', 3, 1, 2), row(2, 'S3', 4, 0, 3),
      row(3, 'S2', 1, 1, 0), row(3, 'S4', 2, 0, 1),
    ]
    const r = computeElo({ year: 2026, t, e })
    expect(r.e[1][3]).toBe(0)
    expect(r.e[12][3]).toBeLessThan(0) // S2's line "lega" at stage 2
    expect(r.e[12][0]).toBeCloseTo(r.e[1][1] + r.e[12][3], 0) // and the stage starts from there
  })

  it('starts who arrives after January from the 25th percentile', () => {
    const t = [stage(1, '2026-01-10'), stage(2, '2026-03-01')]
    const e = [...four(0, ['A', 'B', 'C', 'D']), row(1, 'A', 1, 1, 0), row(1, 'N', 2, 0, 1)]
    const r = computeElo({ year: 2026, t, e })
    const sorted = [0, 1, 2, 3].map((i) => after(r, i)).sort((a, b) => a - b)
    expect(r.e[5][0]).toBeCloseTo(sorted[0], 1)
  })

  it('takes 10 points a month from the second month without tournaments, never below 1000', () => {
    expect(idle(1100, '2026-01-01', '2026-01-31')).toBe(0)
    expect(idle(1100, '2026-01-01', '2026-03-02')).toBe(10)
    expect(idle(1100, '2026-01-01', '2026-04-01')).toBe(20)
    expect(idle(1005, '2026-01-01', '2026-06-01')).toBe(5)
    expect(idle(950, '2026-01-01', '2026-06-01')).toBe(0)
  })

  it('places a stage without a date right after the one before it', () => {
    expect(tournamentDays(2026, [stage(1, '2026-01-10'), stage(2), stage(1)])).toEqual(['2026-01-10', '2026-01-10', '2026-01-01'])
  })
})
