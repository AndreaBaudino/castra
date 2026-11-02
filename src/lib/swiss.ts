// Swiss tournaments as the circuit plays them (docs/tornei.md): Bo3 matches, 3/1/0 points, a random first round, then
// pairs by points without rematches; standings by the MTR tiebreakers; a single elimination top cut.
// Pure functions: the TO's phone pairs, and every phone computes the same standings from the same matches.

/** Games won by p1, won by p2, drawn. An intentional draw is 0-0-0. */
export type Score = [number, number, number]

export interface Entrant {
  id: string // player key
  joined?: number // first round played: a late entry loses the ones before 0-2
  drop?: number // last round played
}

export interface Match {
  round: number
  p1: string
  p2: string | null // null: a bye
  score?: Score | null // missing until reported; a bye needs none
}

export interface Standing {
  id: string
  points: number
  wins: number // matches, byes included
  losses: number // late rounds included
  draws: number
  byes: number
  dropped: boolean
  mwp: number // match-win %
  gwp: number // game-win %
  omwp: number // opponents' match-win %
  ogwp: number // opponents' game-win %
}

// MTR: a percentage below 0.33 counts as 0.33, so that losing to a weak player doesn't weigh like a bye
const FLOOR = 0.33
const EPS = 1e-9

/** 1: p1 won, 2: p2 won, 0: a draw. */
export const winnerOf = ([a, b]: Score) => (a > b ? 1 : b > a ? 2 : 0)

/** A Bo3 result: up to 2 games won each and 3 games in all; fewer when the round ran out of time. */
export const validScore = (s: Score) =>
  s.every((n) => Number.isInteger(n) && n >= 0) && s[0] <= 2 && s[1] <= 2 && s[0] + s[1] + s[2] <= 3

/** Swiss rounds for a number of players, as the circuit plays them: enough for one undefeated player. */
export const suggestedRounds = (players: number) => (players < 2 ? 0 : Math.ceil(Math.log2(players)))

export function standings(entrants: Entrant[], matches: Match[]): Standing[] {
  type Rec = Pick<Standing, 'points' | 'wins' | 'losses' | 'draws' | 'byes'> & {
    rounds: number
    games: number
    gamePoints: number
    opps: string[]
  }
  const recs = new Map<string, Rec>()
  for (const e of entrants) {
    const late = Math.max(0, (e.joined ?? 1) - 1) // each one a 0-2 loss
    recs.set(e.id, { points: 0, wins: 0, losses: late, draws: 0, byes: 0, rounds: late, games: 2 * late, gamePoints: 0, opps: [] })
  }
  const add = (r: Rec | undefined, won: number, lost: number, drawn: number, opp: string) => {
    if (!r) return
    const w = winnerOf([won, lost, drawn])
    r.points += w === 1 ? 3 : w === 0 ? 1 : 0
    r[w === 1 ? 'wins' : w === 0 ? 'draws' : 'losses']++
    r.rounds++
    r.games += won + lost + drawn
    r.gamePoints += 3 * won + drawn
    r.opps.push(opp)
  }
  for (const m of matches) {
    if (!m.p2) {
      const r = recs.get(m.p1)
      if (!r) continue
      // a bye is a match won 2-0, without an opponent
      r.points += 3
      r.wins++
      r.byes++
      r.rounds++
      r.games += 2
      r.gamePoints += 6
    } else if (m.score) {
      const [a, b, d] = m.score
      add(recs.get(m.p1), a, b, d, m.p2)
      add(recs.get(m.p2), b, a, d, m.p1)
    }
  }
  const mwp = new Map<string, number>()
  const gwp = new Map<string, number>()
  for (const [id, r] of recs) {
    mwp.set(id, Math.max(FLOOR, r.rounds ? r.points / (3 * r.rounds) : 0))
    gwp.set(id, Math.max(FLOOR, r.games ? r.gamePoints / (3 * r.games) : 0))
  }
  const avg = (ids: string[], of: Map<string, number>) =>
    ids.length ? ids.reduce((s, id) => s + (of.get(id) ?? FLOOR), 0) / ids.length : FLOOR
  const dropped = new Set(entrants.filter((e) => e.drop != null).map((e) => e.id))
  return [...recs]
    .map(([id, r]): Standing => ({
      id,
      points: r.points,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      byes: r.byes,
      dropped: dropped.has(id),
      mwp: mwp.get(id)!,
      gwp: gwp.get(id)!,
      omwp: avg(r.opps, mwp),
      ogwp: avg(r.opps, gwp),
    }))
    .sort((x, y) => {
      for (const k of ['points', 'omwp', 'gwp', 'ogwp'] as const) if (Math.abs(x[k] - y[k]) > EPS) return y[k] - x[k]
      return x.id < y.id ? -1 : x.id > y.id ? 1 : 0 // the same on every phone
    })
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function shuffle<T>(list: T[], rand: () => number) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Pairs `list` (by points, best first) with the smallest gaps in points: the sum of the squared gaps, so that two
 * players moved one score down weigh less than one moved two. A rematch costs `rematch` (Infinity: never). Branch and
 * bound from the nearest partners, those not met first: the first pairing found is the greedy one, then better ones
 * until no better one can exist (pairing neighbours, rematches aside, is the least possible) or the search takes too
 * long. Null when none was found.
 */
function pairUp(list: string[], met: Set<string>, points: Map<string, number>, rematch = Infinity): [string, string][] | null {
  const gap = (a: string, b: string) => (points.get(a)! - points.get(b)!) ** 2
  const neighbours = (rest: string[]) => {
    let c = 0
    for (let i = 1; i < rest.length; i += 2) c += gap(rest[i - 1], rest[i])
    return c
  }
  const least = neighbours(list)
  let best: [string, string][] | null = null
  let bestCost = Infinity
  let steps = 0
  const go = (rest: string[], pairs: [string, string][], c: number) => {
    if (bestCost === least || ++steps > 20000 || c + neighbours(rest) >= bestCost) return
    if (!rest.length) {
      best = pairs
      bestCost = c
      return
    }
    const [a, ...others] = rest
    for (const again of rematch < Infinity ? [false, true] : [false])
      for (let i = 0; i < others.length; i++)
        if (met.has(pairKey(a, others[i])) === again)
          go(
            others.filter((_, j) => j !== i),
            [...pairs, [a, others[i]]],
            c + gap(a, others[i]) + (again ? rematch : 0),
          )
  }
  go(list, [], 0)
  return best
}

// a rematch weighs more than any gap in points: as few as possible, and only when there's no other way
const REMATCH = 1e6

/**
 * The pairings of a Swiss round, table 1 first and the bye (if any) last: the players still in it, by points and in a
 * random order within the same points, each with the nearest one they haven't met; a rematch only when no pairing
 * avoids it, as few as possible. With an odd number the bye goes to the lowest player who hasn't had one (higher up
 * when that one would force a rematch).
 */
export function pairRound(
  entrants: Entrant[],
  matches: Match[],
  round: number,
  rand = Math.random,
): [string, string | null][] {
  const playing = entrants.filter((e) => (e.joined ?? 1) <= round && (e.drop == null || e.drop >= round)).map((e) => e.id)
  const before = matches.filter((m) => m.round < round)
  const points = new Map(standings(entrants, before).map((s) => [s.id, s.points]))
  // the stable sort keeps the shuffled order within the same points
  const order = shuffle(playing, rand).sort((a, b) => points.get(b)! - points.get(a)!)
  const met = new Set(before.flatMap((m) => (m.p2 ? [pairKey(m.p1, m.p2)] : [])))
  if (order.length % 2 === 0) return pairUp(order, met, points) ?? pairUp(order, met, points, REMATCH)!

  const hadBye = new Set(before.filter((m) => !m.p2).map((m) => m.p1))
  const lowest = [...order].reverse()
  const byes = [...lowest.filter((id) => !hadBye.has(id)), ...lowest.filter((id) => hadBye.has(id))]
  for (const bye of byes) {
    const pairs = pairUp(
      order.filter((id) => id !== bye),
      met,
      points,
    )
    if (pairs) return [...pairs, [bye, null]]
  }
  return [...pairUp(order.filter((id) => id !== byes[0]), met, points, REMATCH)!, [byes[0], null]]
}

/** The players of a top cut: the best in the standings who haven't dropped. */
export const cutSeeds = (st: Standing[], size: number) => st.filter((s) => !s.dropped).slice(0, size).map((s) => s.id)

/** The first round of a top cut (2, 4 or 8 seeds, best first) in bracket order: 1-8, 4-5, 2-7, 3-6. */
export function cutPairings(seeds: string[]): [string, string][] {
  if (![2, 4, 8].includes(seeds.length)) throw new Error(`top cut of ${seeds.length}`)
  let order = [0]
  while (order.length < seeds.length) order = order.flatMap((i) => [i, order.length * 2 - 1 - i])
  const out: [string, string][] = []
  for (let i = 0; i < order.length; i += 2) out.push([seeds[order[i]], seeds[order[i + 1]]])
  return out
}

/** The next round of a top cut: the winners of each two matches, in bracket order; null until every match has one. */
export function nextCut(round: Match[]): [string, string][] | null {
  const winners = round.map((m) => {
    const w = m.p2 && m.score ? winnerOf(m.score) : 0
    return w === 1 ? m.p1 : w === 2 ? m.p2 : null
  })
  if (winners.length < 2 || winners.some((w) => !w)) return null
  const out: [string, string][] = []
  for (let i = 0; i < winners.length; i += 2) out.push([winners[i]!, winners[i + 1]!])
  return out
}

/**
 * The final order: the top cut by matches won there (the winner, the finalist, the semifinalists…), each level by the
 * Swiss standings, then everyone else as in the Swiss standings.
 */
export function finalOrder(st: Standing[], cut: Match[]): string[] {
  const wins = new Map<string, number>()
  const inCut = new Set<string>()
  for (const m of cut) {
    if (!m.p2) continue
    inCut.add(m.p1).add(m.p2)
    const w = m.score ? winnerOf(m.score) : 0
    if (w) wins.set(w === 1 ? m.p1 : m.p2, (wins.get(w === 1 ? m.p1 : m.p2) ?? 0) + 1)
  }
  const swiss = st.map((s) => s.id)
  const cutOrder = swiss.filter((id) => inCut.has(id)).sort((a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0))
  return [...cutOrder, ...swiss.filter((id) => !inCut.has(id))]
}
