// The players' Elo of docs/elo.md (Glicko adapted to the circuit), computed from the tournament sheets of one year, to
// study the rules before they go into the app; it changes nothing. A tournament run in Castra counts by its matches
// (`pm` of the meta) when the meta has them, otherwise by its placings like any sheet. To delete once the meta build
// computes the Elo.
//   node scripts/elo/analisi.mjs [anno] [--file meta-2026.json] [--base 1000] [--nuovi p25|base|900] [--start 100]
//                                [--c 5] [--floor 40] [--top 20] [--player "Nome Cognome"]
//                                [--eta 4] [--al 2026-11-12]
// --nuovi: where a player first seen after January starts (the 25th percentile of the Elo at that moment, as decided,
// the year's base, or a number); --eta: how fast each league's own Elo learns from its players in the levels (0: no
// league Elo); --al: the day of the ranking (default today): who has not played for 3 months goes among the inactive.
// Without --file it reads meta-<anno>.json from the meta-data branch (git fetch origin meta-data first).

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: 'string' },
    base: { type: 'string', default: '1000' },
    nuovi: { type: 'string', default: 'p25' },
    eta: { type: 'string', default: '4' },
    al: { type: 'string' },
    start: { type: 'string', default: '100' },
    c: { type: 'string', default: '5' },
    floor: { type: 'string', default: '40' },
    top: { type: 'string', default: '20' },
    player: { type: 'string' },
  },
})
const year = positionals[0] ?? '2026'
const meta = JSON.parse(opt.file ? readFileSync(opt.file, 'utf8') : execSync(`git show origin/meta-data:meta-${year}.json`, { maxBuffer: 1e8 }))

const WEIGHT = { league: 1, l1: 1.5, l2: 2 }
const Q = Math.log(10) / 400
const g = (rd) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / Math.PI ** 2)
const points = (x) => 3 * (x[4] ?? 0) + (x[6] ?? 0)
const level = (t) => t.k === 'l1' || t.k === 'l2'
const games = (x) => (x[4] ?? 0) + (x[5] ?? 0) + (x[6] ?? 0) - (x[7] ? 1 : 0) // the bye is no game
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5

// tournaments in time order: a stage without a date comes right after the one before it in its league
const T = meta.t
const day = T.map((t) => {
  if (t.d) return t.d
  const before = T.filter((x) => x.lg === t.lg && x.s === t.s && x.d && x.st < t.st).map((x) => x.d).sort()
  return before.pop() ?? `${year}-01-01`
})
const entries = new Map()
for (const x of meta.e) if (x[1]) (entries.get(x[0]) ?? entries.set(x[0], []).get(x[0])).push(x)
// the matches of the tournaments run in Castra: [tournament, entry, entry, won, lost, drawn, round]
const matchesOf = new Map()
for (const x of meta.pm ?? []) (matchesOf.get(x[0]) ?? matchesOf.set(x[0], []).get(x[0])).push(x)
// the Swiss rounds: the most common number of games (bye included); a tournament without results stays out
const rounds = (es) => {
  const n = new Map()
  for (const x of es) n.set(games(x) + (x[7] ? 1 : 0), (n.get(games(x) + (x[7] ? 1 : 0)) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0][0]
}
// each player's league: the one with most stages in the year
const home = new Map()
{
  const n = new Map()
  for (const x of meta.e) if (x[1] && !level(T[x[0]]) && T[x[0]].lg) n.set(`${x[1]}|${T[x[0]].lg}`, (n.get(`${x[1]}|${T[x[0]].lg}`) ?? 0) + 1)
  for (const [k, v] of [...n].sort((a, b) => a[1] - b[1])) home.set(k.split('|')[0], k.split('|')[1])
}
const order = [...entries.keys()]
  .filter((ti) => entries.get(ti).length >= 2 && rounds(entries.get(ti)) > 0)
  .sort((a, b) => day[a].localeCompare(day[b]) || (T[a].st ?? 0) - (T[b].st ?? 0))

/**
 * Glicko of docs/elo.md: every player compared with every other entry by placing, each comparison weighing
 * tournament weight × average games of the two ÷ (entries − 1); Elo and margin of the start of the tournament.
 * Also the prediction check: before each tournament from March, who of two players with different points finishes
 * higher (between equal points the tiebreakers decide, not the players).
 */
function glicko({ base, nuovi, start, c, floor, eta }) {
  const R = new Map(), RD = new Map(), last = new Map(), hist = new Map(), played = new Map()
  // each league's Elo, learnt in the levels: a player's Elo is theirs plus their league's, one number. Each player keeps
  // the league's value of their last tournament (Lp), so their Elo moves only when they play; the tournament itself
  // uses the current one, so the expected results are the same
  const L = new Map(), Lp = new Map()
  const lg = (p) => L.get(home.get(p)) ?? 0
  const elo = (p) => R.get(p) + lg(p)
  const shown = (p) => R.get(p) + (Lp.get(p) ?? 0)
  let loss = 0, right = 0, pairs = 0
  const newcomer = (d) => {
    if (d < `${year}-02-01` || nuovi === 'base') return base
    if (nuovi !== 'p25') return +nuovi
    const v = [...R.keys()].map(shown).sort((a, b) => a - b)
    return v.length ? v[Math.floor((v.length - 1) / 4)] : base
  }
  for (const ti of order) {
    const es = entries.get(ti), t = T[ti], d = day[ti], n = es.length, w = WEIGHT[t.k] ?? 1
    const before = new Map(), lpBefore = new Map()
    for (const [p] of es.map((x) => [x[1]])) {
      if (!R.has(p)) R.set(p, newcomer(d) - lg(p)), RD.set(p, start), Lp.set(p, lg(p))
      if (last.has(p)) RD.set(p, Math.min(start, Math.sqrt(RD.get(p) ** 2 + c * c * days(last.get(p), d))))
      before.set(p, shown(p)), lpBefore.set(p, Lp.get(p) ?? 0)
    }
    if (d >= `${year}-03-01`)
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const [a, b] = [es[i], es[j]]
          if (points(a) === points(b)) continue
          const gg = g(Math.hypot(RD.get(a[1]), RD.get(b[1])))
          const pa = Math.min(1 - 1e-6, Math.max(1e-6, 1 / (1 + 10 ** ((-gg * (elo(a[1]) - elo(b[1]))) / 400))))
          const won = points(a) > points(b)
          loss -= Math.log(won ? pa : 1 - pa)
          right += pa === 0.5 ? 0.5 : (pa > 0.5) === won ? 1 : 0
          pairs++
        }
    // each player's games: the real matches (the top cut only in levels, no intentional draw), or every other entry
    // by placing
    const swiss = rounds(es)
    const vs = new Map(es.map((a) => [a, []]))
    if (matchesOf.has(ti)) {
      for (const [, ea, eb, x, y, dr, round] of matchesOf.get(ti)) {
        if ((!level(t) && round > swiss) || x + y + dr === 0) continue
        const [a, b] = [meta.e[ea], meta.e[eb]]
        const s = x > y ? 1 : x < y ? 0 : 0.5
        vs.get(a)?.push([b, s, w])
        vs.get(b)?.push([a, 1 - s, w])
      }
    } else
      for (const a of es)
        for (const b of es)
          if (b !== a) vs.get(a).push([b, a[3] < b[3] ? 1 : a[3] > b[3] ? 0 : 0.5, (w * (games(a) + games(b))) / 2 / (n - 1)])
    const next = es.map((a) => {
      let sum = 0, info = 0, off = 0
      for (const [b, s, weight] of vs.get(a)) {
        const gb = g(RD.get(b[1]))
        const e = 1 / (1 + 10 ** ((-gb * (elo(a[1]) - elo(b[1]))) / 400))
        sum += weight * gb * (s - e)
        info += weight * Q * Q * gb * gb * e * (1 - e)
        off += weight * (s - e)
      }
      const v = 1 / (1 / RD.get(a[1]) ** 2 + info)
      return [a, R.get(a[1]) + Q * v * sum, Math.max(floor, Math.sqrt(v)), off]
    })
    // the league learns from how its players did in a level against their Elo
    if (level(t)) for (const [a, , , off] of next) if (home.has(a[1])) L.set(home.get(a[1]), (L.get(home.get(a[1])) ?? 0) + eta * off)
    for (const [a, r, rd] of next) R.set(a[1], r), RD.set(a[1], rd)
    for (const [a, , rd] of next) {
      const p = a[1]
      Lp.set(p, lg(p))
      // the league's moves since the player's last tournament arrive now, on a line of their own
      const league = Lp.get(p) - lpBefore.get(p)
      ;(hist.get(p) ?? hist.set(p, []).get(p)).push({ day: d, t, place: a[3], n, move: shown(p) - before.get(p) - league, league, elo: shown(p), rd })
      last.set(p, d), played.set(p, (played.get(p) ?? 0) + games(a))
    }
  }
  return { R: new Map([...R.keys()].map((p) => [p, shown(p)])), RD, L, hist, played, right: right / pairs, loss: loss / pairs, pairs }
}

const fmt = (n, d = 0) => n.toFixed(d).replace('.', ',')
const name = (t) => (level(t) ? `${t.k === 'l1' ? 'Livello 1' : 'Livello 2'} · ${t.n}` : `${t.lg ?? t.n} ${t.s ?? ''} · tappa ${t.st}`)
const res = glicko({ base: +opt.base, nuovi: opt.nuovi, start: +opt.start, c: +opt.c, floor: +opt.floor, eta: +opt.eta })
const all = [...res.R.keys()]
const mean = all.reduce((s, p) => s + res.R.get(p), 0) / all.length
console.log(`Elo ${year}, base ${opt.base}, nuovi da ${opt.nuovi}, Elo di lega ${opt.eta}, Glicko da ±${opt.start}, pause ${opt.c}, minimo ±${opt.floor}: ${all.length} giocatori, media ${fmt(mean, 1)}`)
console.log(`Previsione da marzo: ${fmt(res.right * 100, 2)}% coppie azzeccate, log-loss ${fmt(res.loss, 4)} (${res.pairs} coppie)`)
// the ranking of a day: who has not played for 3 months goes among the inactive, Elo untouched; provisional is who
// played little (the margin of their last tournament above ±80), so the two labels never overlap
const today = opt.al ?? new Date().toISOString().slice(0, 10)
const away = (p) => days(res.hist.get(p).at(-1).day, today) > 90
const group = (p) => (away(p) ? 'inattivi' : res.RD.get(p) > 80 ? 'provvisori' : 'classifica')
const count = (k) => all.filter((p) => group(p) === k).length
console.log(`Al ${today}: in classifica ${count('classifica')}, provvisori ${count('provvisori')}, inattivi (fermi da più di 3 mesi) ${count('inattivi')}\n`)

console.log('Elo di lega (arriva nell\'Elo di ogni giocatore al suo torneo successivo):', [...res.L].sort((a, b) => a[1] - b[1]).filter((x) => Math.abs(x[1]) >= 1).map(([lg, v]) => `${lg} ${v >= 0 ? '+' : ''}${fmt(v)}`).join(', '), '\n')
if (opt.player) {
  const h = res.hist.get(opt.player)
  if (!h) throw new Error(`${opt.player}: nessun torneo nel ${year}`)
  for (const x of h)
    console.log(`${x.day}  ${name(x.t).padEnd(34)} ${String(x.place).padStart(2)}º su ${String(x.n).padEnd(3)} ${(x.move >= 0 ? '+' : '') + fmt(x.move, 1)}`.padEnd(70) + `${fmt(x.elo)} ±${fmt(x.rd)}` + (Math.abs(x.league) >= 0.05 ? `   lega ${(x.league >= 0 ? '+' : '') + fmt(x.league, 1)}` : ''))
} else {
  const top = all.filter((p) => group(p) === 'classifica').sort((a, b) => res.R.get(b) - res.R.get(a)).slice(0, +opt.top)
  top.forEach((p, i) => {
    const h = res.hist.get(p)
    const part = (k) => h.filter((x) => !level(x.t) === k).reduce((s, x) => s + x.move, 0)
    console.log(`${String(i + 1).padStart(3)} ${p.padEnd(26)} ${fmt(res.R.get(p))} ±${fmt(res.RD.get(p)).padEnd(4)} ${String(res.played.get(p)).padStart(4)} partite   leghe ${fmt(part(true))}  livelli ${fmt(part(false))}`)
  })
}
