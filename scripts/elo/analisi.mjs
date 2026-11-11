// The players' Elo of docs/elo.md (Glicko adapted to the circuit), computed from the tournament sheets of one year, to
// study the rules before they go into the app; it changes nothing. Tournaments run in Castra count here by their
// placings, like any sheet. To delete once the meta build computes the Elo.
//   node scripts/elo/analisi.mjs [anno] [--file meta-2026.json] [--start 100] [--c 5] [--floor 40] [--top 20]
//                                [--player "Nome Cognome"]
// Without --file it reads meta-<anno>.json from the meta-data branch (git fetch origin meta-data first).

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: 'string' },
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
// the Swiss rounds: the most common number of games (bye included); a tournament without results stays out
const rounds = (es) => {
  const n = new Map()
  for (const x of es) n.set(games(x) + (x[7] ? 1 : 0), (n.get(games(x) + (x[7] ? 1 : 0)) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0][0]
}
const order = [...entries.keys()]
  .filter((ti) => entries.get(ti).length >= 2 && rounds(entries.get(ti)) > 0)
  .sort((a, b) => day[a].localeCompare(day[b]) || (T[a].st ?? 0) - (T[b].st ?? 0))

/**
 * Glicko of docs/elo.md: every player compared with every other entry by placing, each comparison weighing
 * tournament weight × average games of the two ÷ (entries − 1); Elo and margin of the start of the tournament.
 * Also the prediction check: before each tournament from March, who of two players finishes higher.
 */
function glicko({ start, c, floor }) {
  const R = new Map(), RD = new Map(), last = new Map(), hist = new Map(), played = new Map()
  let loss = 0, right = 0, pairs = 0
  for (const ti of order) {
    const es = entries.get(ti), t = T[ti], d = day[ti], n = es.length, w = WEIGHT[t.k] ?? 1
    for (const [p] of es.map((x) => [x[1]])) {
      if (!R.has(p)) R.set(p, 1500), RD.set(p, start)
      if (last.has(p)) RD.set(p, Math.min(start, Math.sqrt(RD.get(p) ** 2 + c * c * days(last.get(p), d))))
    }
    if (d >= `${year}-03-01`)
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const [a, b] = [es[i], es[j]]
          if (a[3] === b[3]) continue
          const gg = g(Math.hypot(RD.get(a[1]), RD.get(b[1])))
          const pa = Math.min(1 - 1e-6, Math.max(1e-6, 1 / (1 + 10 ** ((-gg * (R.get(a[1]) - R.get(b[1]))) / 400))))
          const won = a[3] < b[3]
          loss -= Math.log(won ? pa : 1 - pa)
          right += pa === 0.5 ? 0.5 : (pa > 0.5) === won ? 1 : 0
          pairs++
        }
    const next = es.map((a) => {
      let sum = 0, info = 0
      for (const b of es) {
        if (b === a) continue
        const s = a[3] < b[3] ? 1 : a[3] > b[3] ? 0 : 0.5
        const weight = (w * (games(a) + games(b))) / 2 / (n - 1)
        const gb = g(RD.get(b[1]))
        const e = 1 / (1 + 10 ** ((-gb * (R.get(a[1]) - R.get(b[1]))) / 400))
        sum += weight * gb * (s - e)
        info += weight * Q * Q * gb * gb * e * (1 - e)
      }
      const v = 1 / (1 / RD.get(a[1]) ** 2 + info)
      return [a, R.get(a[1]) + Q * v * sum, Math.max(floor, Math.sqrt(v))]
    })
    for (const [a, r, rd] of next) {
      const p = a[1]
      ;(hist.get(p) ?? hist.set(p, []).get(p)).push({ day: d, t, place: a[3], n, move: r - R.get(p), elo: r, rd })
      R.set(p, r), RD.set(p, rd), last.set(p, d), played.set(p, (played.get(p) ?? 0) + games(a))
    }
  }
  return { R, RD, hist, played, right: right / pairs, loss: loss / pairs, pairs }
}

const fmt = (n, d = 0) => n.toFixed(d).replace('.', ',')
const name = (t) => (t.k === 'league' ? `${t.lg} · tappa ${t.st}` : `${t.k === 'l1' ? 'Livello 1' : 'Livello 2'} · ${t.n}`)
const res = glicko({ start: +opt.start, c: +opt.c, floor: +opt.floor })
const all = [...res.R.keys()]
const mean = all.reduce((s, p) => s + res.R.get(p), 0) / all.length
console.log(`Elo ${year}, Glicko da ±${opt.start}, pause ${opt.c}, minimo ±${opt.floor}: ${all.length} giocatori, media ${fmt(mean, 1)}`)
console.log(`Previsione da marzo: ${fmt(res.right * 100, 2)}% coppie azzeccate, log-loss ${fmt(res.loss, 4)} (${res.pairs} coppie)`)
console.log(`Provvisori (margine sopra ±80): ${all.filter((p) => res.RD.get(p) > 80).length}\n`)

if (opt.player) {
  const h = res.hist.get(opt.player)
  if (!h) throw new Error(`${opt.player}: nessun torneo nel ${year}`)
  for (const x of h)
    console.log(`${x.day}  ${name(x.t).padEnd(34)} ${String(x.place).padStart(2)}º su ${String(x.n).padEnd(3)} ${(x.move >= 0 ? '+' : '') + fmt(x.move, 1)}`.padEnd(70) + `${fmt(x.elo)} ±${fmt(x.rd)}`)
} else {
  const top = all.sort((a, b) => res.R.get(b) - res.R.get(a)).slice(0, +opt.top)
  top.forEach((p, i) => {
    const h = res.hist.get(p)
    const part = (k) => h.filter((x) => (x.t.k === 'league') === k).reduce((s, x) => s + x.move, 0)
    console.log(`${String(i + 1).padStart(3)} ${p.padEnd(26)} ${fmt(res.R.get(p))} ±${fmt(res.RD.get(p)).padEnd(4)} ${String(res.played.get(p)).padStart(4)} partite   leghe ${fmt(part(true))}  livelli ${fmt(part(false))}`)
  })
}
