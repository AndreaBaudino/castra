import { type Deck, type DeckCard, groupOf } from './decks'

// Numbers behind the deck page's analysis: mana curve, chance of having a card on curve, colours.

export const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
export type Color = (typeof COLORS)[number]

/** The 99 (or whatever the main deck holds), one entry per copy. */
const mainCards = (deck: Deck) => deck.cards.filter((c) => c.section === 'main')
const isLand = (c: DeckCard) => groupOf(c) === 'lands'
const isPermanent = (c: DeckCard) => !/\b(instant|sorcery)\b/i.test((c.info?.typeLine ?? '').split('//')[0])

export const CURVE_MAX = 7 // the last bar holds 7 and more

export interface CurveBar {
  mv: number
  permanents: DeckCard[]
  spells: DeckCard[]
  count: number
}

export function curveOf(deck: Deck): CurveBar[] {
  const bars: CurveBar[] = Array.from({ length: CURVE_MAX + 1 }, (_, mv) => ({ mv, permanents: [], spells: [], count: 0 }))
  for (const c of mainCards(deck)) {
    if (isLand(c)) continue
    const bar = bars[Math.min(CURVE_MAX, Math.floor(c.info?.cmc ?? 0))]
    ;(isPermanent(c) ? bar.permanents : bar.spells).push(c)
    bar.count += c.qty
  }
  return bars
}

const qty = (cs: DeckCard[]) => cs.reduce((s, c) => s + c.qty, 0)

export function summaryOf(deck: Deck) {
  const main = mainCards(deck)
  const values: number[] = []
  const valuesNoLands: number[] = []
  for (const c of main)
    for (let i = 0; i < c.qty; i++) {
      const mv = c.info?.cmc ?? 0
      values.push(mv)
      if (!isLand(c)) valuesNoLands.push(mv)
    }
  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)
  const median = (v: number[]) => {
    if (!v.length) return 0
    const s = [...v].sort((a, b) => a - b)
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  return {
    cards: values.length,
    lands: qty(main.filter(isLand)),
    avg: avg(values),
    avgNoLands: avg(valuesNoLands),
    median: median(values),
    medianNoLands: median(valuesNoLands),
    total: values.reduce((a, b) => a + b, 0),
  }
}

// ---------- probabilities ----------

/** ln(n!) by summing logs: decks are small, so this is exact enough and fast. */
const lnFact = (() => {
  const memo = [0]
  return (n: number) => {
    for (let i = memo.length; i <= n; i++) memo[i] = memo[i - 1] + Math.log(i)
    return memo[n]
  }
})()
const lnChoose = (n: number, k: number) => (k < 0 || k > n ? -Infinity : lnFact(n) - lnFact(k) - lnFact(n - k))

/** Chance of at least `atLeast` of `hits` cards among `seen` drawn from `deck` cards. */
export function atLeast(deck: number, hits: number, seen: number, atLeastN: number) {
  seen = Math.min(seen, deck)
  let p = 0
  for (let k = atLeastN; k <= Math.min(hits, seen); k++) p += Math.exp(lnChoose(hits, k) + lnChoose(deck - hits, seen - k) - lnChoose(deck, seen))
  return Math.min(1, p)
}

/** Cards seen by the given turn: 7 in hand, plus a draw each turn (none on turn 1 on the play). */
export const seenBy = (turn: number, onPlay: boolean) => 7 + turn - (onPlay ? 1 : 0)

export function onCurve(deck: Deck, bar: CurveBar) {
  const main = mainCards(deck)
  const size = qty(main)
  const lands = qty(main.filter(isLand))
  const turn = Math.max(1, bar.mv)
  const at = (onPlay: boolean) => ({
    card: atLeast(size, bar.count, seenBy(turn, onPlay), 1),
    lands: bar.mv ? atLeast(size, lands, seenBy(turn, onPlay), bar.mv) : 1,
  })
  return { turn, play: at(true), draw: at(false) }
}

// ---------- colours ----------

/** Coloured symbols in a mana cost: a hybrid symbol counts for each of its colours. */
export function symbolsOf(cost: string): Partial<Record<Color, number>> {
  const out: Partial<Record<Color, number>> = {}
  for (const s of cost.match(/\{[^}]+\}/g) ?? [])
    for (const c of COLORS) if (s.slice(1, -1).split('/').includes(c)) out[c] = (out[c] ?? 0) + 1
  return out
}

export interface ColorStat {
  color: Color
  symbols: number
  symbolShare: number // of all coloured symbols
  lands: number // lands that produce it
  landShare: number // of the lands
  others: number // non-land sources (rocks, dorks…)
}

export function colorsOf(deck: Deck) {
  const main = mainCards(deck)
  const lands = main.filter(isLand)
  const landCount = qty(lands)
  const symbols: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  for (const c of main) {
    if (isLand(c)) continue
    const s = symbolsOf(c.info?.manaCost ?? '')
    for (const k of COLORS) symbols[k] += (s[k] ?? 0) * c.qty
  }
  const totalSymbols = COLORS.reduce((a, k) => a + symbols[k], 0)
  const produces = (c: DeckCard, k: Color) => !!c.info?.produced?.includes(k)
  const stats: ColorStat[] = COLORS.map((k) => {
    const l = qty(lands.filter((c) => produces(c, k)))
    return {
      color: k,
      symbols: symbols[k],
      symbolShare: totalSymbols ? symbols[k] / totalSymbols : 0,
      lands: l,
      landShare: landCount ? l / landCount : 0,
      others: qty(main.filter((c) => !isLand(c) && produces(c, k))),
    }
  })
  // production is known only for cards fetched since it was added
  const unknown = main.filter((c) => c.info && c.info.produced === undefined).length
  return { stats, landCount, unknown }
}
