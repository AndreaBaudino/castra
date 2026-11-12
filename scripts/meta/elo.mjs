// The players' Elo of docs/elo.md (Glicko adapted to the circuit), computed by the meta build for one year from the
// sheets and, where the meta has them, the matches played in Castra (`pm`). Pure: the year's raw data in, the numbers
// out; the app works out what depends on today (the pause, the inactive, the rank) from them.

const WEIGHT = { league: 1, online: 1, l1: 1.5, l2: 2 }
export const BASE = 1000
const START = 100 // the margin everyone starts from, and its ceiling
const FLOOR = 40 // the margin never goes below
const PAUSE = 5 // each day without tournaments widens the margin by this (√ of the sum of squares)
const LEAGUE = 4 // how fast a league's own Elo learns from its players in the levels
export const IDLE = 10 // points lost for each whole month without tournaments, from the second on, never below BASE

const Q = Math.log(10) / 400
const g = (rd) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / Math.PI ** 2)
const points = (x) => 3 * (x[4] ?? 0) + (x[6] ?? 0)
const level = (t) => t.k === 'l1' || t.k === 'l2'
const games = (x) => (x[4] ?? 0) + (x[5] ?? 0) + (x[6] ?? 0) - (x[7] ? 1 : 0) // the bye is no game
const turns = (x) => games(x) + (x[7] ? 1 : 0)
export const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5

/** What a pause costs: IDLE points for each whole month without tournaments from the second on, never below BASE. */
export const idle = (elo, from, to) => Math.min(IDLE * Math.max(0, Math.floor(days(from, to) / 30) - 1), Math.max(0, elo - BASE))

/** The day of each tournament: a stage without a date comes right after the one before it in its league. */
export function tournamentDays(year, t) {
  return t.map((x) => {
    if (x.d) return x.d
    const before = t.filter((y) => y.lg === x.lg && y.s === x.s && y.d && y.st < x.st).map((y) => y.d).sort()
    return before.pop() ?? `${year}-01-01`
  })
}

/**
 * The year's Elo, from its raw meta (`year`, `t`, `e`, `pm`). For each entry of `e` (null if the tournament doesn't
 * count): [Elo used in the tournament, Elo after, the tournament's move, the league's move arriving, the pause's loss,
 * margin after]; for each match of `pm`: the moves of the two players; each league's own Elo at the end (`l`), which
 * goes on whole the next year (`leagues`: the previous year's).
 */
export function computeElo({ year, t: T, e: E, pm = [] }, leagues = {}) {
  const day = tournamentDays(year, T)
  const entries = new Map()
  E.forEach((x, i) => x[1] && (entries.get(x[0]) ?? entries.set(x[0], []).get(x[0])).push(i))
  const matchesOf = new Map()
  pm.forEach((x, i) => (matchesOf.get(x[0]) ?? matchesOf.set(x[0], []).get(x[0])).push(i))
  // the Swiss rounds: the most common number of rounds (bye included); a tournament without results stays out
  const rounds = (es) => {
    const n = new Map()
    for (const i of es) n.set(turns(E[i]), (n.get(turns(E[i])) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1])[0][0]
  }
  // a sheet comparison: by placing, but against who played fewer rounds than the Swiss (drop, late arrival) by points
  // per round, since the sheet ranks a drop under everyone who kept playing (the bye counts as a round, with its points)
  const ppr = (x) => points(x) / Math.max(1, turns(x))
  const versus = (a, b, swiss) =>
    turns(a) < swiss || turns(b) < swiss ? (ppr(a) > ppr(b) ? 1 : ppr(a) < ppr(b) ? 0 : 0.5) : a[3] < b[3] ? 1 : a[3] > b[3] ? 0 : 0.5
  // each player's league: the one with most stages in the year
  const home = new Map()
  {
    const n = new Map()
    for (const x of E) if (x[1] && !level(T[x[0]]) && T[x[0]].lg) n.set(`${x[1]}|${T[x[0]].lg}`, (n.get(`${x[1]}|${T[x[0]].lg}`) ?? 0) + 1)
    for (const [k] of [...n].sort((a, b) => a[1] - b[1])) home.set(k.split('|')[0], k.split('|')[1])
  }
  const order = [...entries.keys()]
    .filter((ti) => entries.get(ti).length >= 2 && rounds(entries.get(ti)) > 0)
    .sort((a, b) => day[a].localeCompare(day[b]) || (T[a].st ?? 0) - (T[b].st ?? 0))

  const R = new Map(), RD = new Map(), last = new Map()
  // each league's Elo, learnt in the levels: a player's Elo is theirs plus their league's, one number. Each player keeps
  // the league's value of their last tournament (Lp), so their Elo moves only when they play; the tournament itself
  // uses the current one
  const L = new Map(Object.entries(leagues)), Lp = new Map()
  const lg = (p) => L.get(home.get(p)) ?? 0
  const elo = (p) => R.get(p) + lg(p)
  const shown = (p) => R.get(p) + (Lp.get(p) ?? 0)
  // who arrives after January starts where one player in four from the bottom is
  const newcomer = () => {
    const v = [...R.keys()].map(shown).sort((a, b) => a - b)
    return v.length ? v[Math.floor((v.length - 1) / 4)] : BASE
  }
  const out = E.map(() => null)
  const pmOut = pm.map(() => null)
  const r1 = (n) => Math.round(n * 10) / 10

  for (const ti of order) {
    const es = entries.get(ti), t = T[ti], d = day[ti], n = es.length, w = WEIGHT[t.k] ?? 1
    const lpBefore = new Map(), lost = new Map()
    for (const i of es) {
      const p = E[i][1]
      // in January everyone starts from BASE plus their league's Elo; later, from the 25th percentile of who plays
      if (!R.has(p)) R.set(p, d < `${year}-02-01` ? BASE : newcomer() - lg(p)), RD.set(p, START), Lp.set(p, lg(p))
      if (last.has(p)) {
        RD.set(p, Math.min(START, Math.sqrt(RD.get(p) ** 2 + PAUSE * PAUSE * days(last.get(p), d))))
        lost.set(p, idle(shown(p), last.get(p), d))
        R.set(p, R.get(p) - lost.get(p))
      }
      lpBefore.set(p, Lp.get(p) ?? 0)
    }
    const start = new Map(es.map((i) => [i, elo(E[i][1])]))
    // each player's games: the real matches (the top cut only in levels, no intentional draw), or every other entry
    const swiss = rounds(es)
    const vs = new Map(es.map((i) => [i, []]))
    const pmMoves = []
    if (matchesOf.has(ti)) {
      for (const k of matchesOf.get(ti)) {
        const [, a, b, x, y, dr, round] = pm[k]
        if ((!level(t) && round > swiss) || x + y + dr === 0 || !vs.has(a) || !vs.has(b)) continue
        const s = x > y ? 1 : x < y ? 0 : 0.5
        vs.get(a).push([b, s, w, k, 0])
        vs.get(b).push([a, 1 - s, w, k, 1])
      }
    } else
      for (const a of es)
        for (const b of es)
          if (b !== a) vs.get(a).push([b, versus(E[a], E[b], swiss), (w * (games(E[a]) + games(E[b]))) / 2 / (n - 1)])
    const next = es.map((a) => {
      const p = E[a][1]
      let sum = 0, info = 0, off = 0
      const terms = []
      for (const [b, s, weight, k, side] of vs.get(a)) {
        const gb = g(RD.get(E[b][1]))
        const ex = 1 / (1 + 10 ** ((-gb * (start.get(a) - start.get(b))) / 400))
        sum += weight * gb * (s - ex)
        info += weight * Q * Q * gb * gb * ex * (1 - ex)
        off += weight * (s - ex)
        if (k != null) terms.push([k, side, weight * gb * (s - ex)])
      }
      const v = 1 / (1 / RD.get(p) ** 2 + info)
      for (const [k, side, x] of terms) pmMoves.push([k, side, Q * v * x])
      return [a, R.get(p) + Q * v * sum, Math.max(FLOOR, Math.sqrt(v)), off]
    })
    for (const [k, side, x] of pmMoves) (pmOut[k] ??= [0, 0])[side] = r1(x)
    // the league learns from how its players did in a level against their Elo
    if (level(t)) for (const [a, , , off] of next) if (home.has(E[a][1])) L.set(home.get(E[a][1]), (L.get(home.get(E[a][1])) ?? 0) + LEAGUE * off)
    for (const [a, r, rd] of next) {
      const p = E[a][1]
      const move = r - R.get(p)
      R.set(p, r), RD.set(p, rd), Lp.set(p, lg(p)), last.set(p, d)
      // the league's moves since the player's last tournament arrive now, on a line of their own
      out[a] = [r1(start.get(a)), r1(shown(p)), r1(move), r1(Lp.get(p) - lpBefore.get(p)), r1(lost.get(p) ?? 0), Math.round(rd)]
    }
  }
  return { d: day, e: out, ...(pm.length ? { pm: pmOut } : {}), l: Object.fromEntries([...L].map(([k, v]) => [k, r1(v)])) }
}
