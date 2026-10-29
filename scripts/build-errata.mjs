// Builds the errata data: for every card whose text today reads differently from its first printing, the text
// as printed there. The app shows it next to the Oracle text (from Scryfall), with the changed words marked.
//
// Reads MTGJSON's per-set files (https://mtgjson.com/api/v5/AllSetFiles.tar.xz, extracted) and writes
// <out>/<first two characters of the Oracle id>.json, each { "<oracle id>": { s, n, d, f: [{ n, t, y }] } }:
// set code, set name, release date and, per face, its name, printed text and printed type line.
// .github/workflows/cards.yml runs it every week and publishes the files on the cards-data branch.
//
//   node scripts/build-errata.mjs <folder of set files> <out folder>
//
// Changes of wording alone don't count (normalize() below): "this creature" for the card's name, "enters" for
// "enters the battlefield", "mill" for putting the top cards into the graveyard, reminder text… Anything else
// is kept, so old cards come with what they said in their day.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [src, out] = process.argv.slice(2)
if (!src || !out) {
  console.error('Uso: node scripts/build-errata.mjs <cartella dei set MTGJSON> <cartella di uscita>')
  process.exit(1)
}

// sets that aren't real printings of the card's text, or not on paper
const SKIP_TYPES = new Set(['funny', 'memorabilia', 'token', 'minigame', 'alchemy', 'treasure_chest'])
const SELF =
  /\bthis (creature|artifact|enchantment|land|permanent|spell|card|aura|equipment|vehicle|planeswalker|battle|saga|class|token|room|case|siege|kindred|tribal|instant|sorcery|background|role|attraction|contraption|mount|spacecraft|planet)\b/g
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The text with today's templating, to tell a real change from a change of wording. */
function normalize(text, names) {
  let s = ` ${text ?? ''} `.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–−]/g, '-')
  s = s.replace(/\\[rn]/g, ' ') // a few printed texts carry "\r" as two characters
  s = s.replace(/\([^)]*\)/g, ' ') // reminder text
  for (const n of names) s = s.replace(new RegExp(`(?<![a-z])${escape(n.toLowerCase())}(?![a-z])`, 'g'), '~')
  s = s
    .replace(/cardname/g, '~')
    .replace(SELF, '~')
    .replace(/\[([+-]?(\d+|x))\]/g, '$1') // loyalty costs: [+1]
    .replace(/\b(enter|enters|entered|entering) the battlefield\b/g, '$1')
    .replace(/\b(enters?|entered) under (your|an opponent's) control\b/g, '$1')
    .replace(/\b(you|an opponent) controls? (enters?|entered)\b/g, '$2')
    .replace(/\bput ([^.:]*?) tokens? onto the battlefield\b/g, 'create $1 token')
    .replace(/\bcreate ([^.]*?) tokens?\b/g, 'create $1 token')
    .replace(/\b(is|are) put into a graveyard from the battlefield\b/g, (_, v) => (v === 'is' ? 'dies' : 'die'))
    .replace(/\bputs? the top (card|\w+ cards) of (your|his or her|their) library into (your|his or her|their) graveyard\b/g, (_, n) =>
      n === 'card' ? 'mill a card' : `mill ${n}`,
    )
    .replace(/\b(you )?mills?\b/g, 'mill')
    .replace(/\bhis or her\b/g, 'their')
    .replace(/\bhim or her\b/g, 'them')
    .replace(/\bhe or she\b/g, 'they')
    .replace(/\bshuffle (your|their) library\b/g, 'shuffle')
    .replace(/\bshuffle it\./g, 'shuffle.')
    .replace(/\badd ((\{c\})+)/g, (_, cs) => `add {${cs.length / 3}}`) // {C}{C} was {2}
    .replace(/\b(sacrifices? [^.]*?) of their choice\b/g, '$1')
    .replace(/\bwhen you cast your next\b/g, 'when you next cast')
    .replace(/\bplay lands and cast spells\b/g, 'play cards')
    .replace(/\byou or a planeswalker you control\b/g, 'you or planeswalkers you control')
    .replace(/\bconverted mana costs?\b/g, 'mana value')
    .replace(/\bactivate this ability only\b/g, 'activate only')
    .replace(/\bany time you could cast a sorcery\b/g, 'as a sorcery')
    .replace(/\bprecombat main phase\b/g, 'first main phase')
    .replace(/\btotem armor\b/g, 'umbra armor')
    .replace(/ to your mana pool\b/g, '')
    .replace(/\btribal\b/g, 'kindred')
    .replace(/[\s,]+/g, '') // some printed texts come without line breaks: "Flyingat the beginning…"
  return s
}

/** A card's text as a set of normalized pieces: adventures and split cards print their halves together. */
const pieces = (texts, names) =>
  [...new Set(texts.flatMap((t) => (t ?? '').split(/\s*\/\/\s*/)).map((t) => normalize(t, names)).filter(Boolean))].sort().join(' | ')

// how much two texts share, to catch a printing that MTGJSON gives with another card's text
const words = (s) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? [])
function likeness(a, b) {
  const x = words(a)
  const y = words(b)
  const both = [...x].filter((w) => y.has(w)).length
  return both / Math.max(1, new Set([...x, ...y]).size)
}

const sets = readdirSync(src)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(src, f), 'utf8')).data)
  .filter((s) => !s.isOnlineOnly && !SKIP_TYPES.has(s.type))

// per Oracle id: today's text of each face, and every printing by set
const current = new Map()
const printings = new Map()
for (const set of sets) {
  const rank = `${set.releaseDate} ${set.type === 'promo' ? 1 : 0} ${set.code}` // a main set before a promo of its day
  for (const c of set.cards) {
    const id = c.identifiers?.scryfallOracleId
    if (!id || c.isFunny || c.isRebalanced || !c.availability?.includes('paper')) continue
    const face = c.faceName ?? c.name
    if (!current.has(id)) current.set(id, new Map())
    current.get(id).set(face, c)
    if (!printings.has(id)) printings.set(id, new Map())
    const bySet = printings.get(id)
    if (!bySet.has(rank)) bySet.set(rank, { set, cards: [] })
    bySet.get(rank).cards.push(c)
  }
}

const shards = new Map()
let kept = 0
for (const [id, bySet] of printings) {
  const now = current.get(id)
  const { set, cards } = bySet.get([...bySet.keys()].sort()[0])
  // one printing per face; when the set has more than one, the one closest to today's text
  const faces = [...now.keys()].map((face) => {
    const options = cards.filter((c) => (c.faceName ?? c.name) === face)
    const today = now.get(face).text ?? ''
    return options.sort((a, b) => likeness(b.originalText ?? '', today) - likeness(a.originalText ?? '', today))[0]
  })
  if (!faces.every(Boolean) || !faces.some((c) => c.originalText)) continue // no printed text known (some promos)
  // the card's own name, its faces' and the short name a legend goes by in its text ("Bontu", "Chandra")
  const names = [
    ...new Set(
      faces.flatMap((c) => {
        const short = (c.faceName ?? c.name).split(/,| the | of /)[0]
        const first = short.split(' ')[0]
        const legend = c.supertypes?.includes('Legendary')
        return [c.name, ...c.name.split(' // '), c.faceName, c.name.split(', ')[0], ...(legend ? [short, first] : [])]
      }),
    ),
  ]
    .filter((n) => n && n.length > 2 && !['The', 'Lord', 'Lady', 'Sir'].includes(n))
    .sort((a, b) => b.length - a.length)
  const changed = pieces(faces.map((c) => c.originalText), names) !== pieces([...now.values()].map((c) => c.text), names)
  if (!changed) continue
  kept++
  const key = id.slice(0, 2)
  if (!shards.has(key)) shards.set(key, {})
  shards.get(key)[id] = {
    s: set.code,
    n: set.name,
    d: set.releaseDate,
    f: faces.map((c) => ({ n: c.faceName ?? c.name, t: c.originalText ?? '', y: c.originalType ?? c.type })),
  }
}

mkdirSync(out, { recursive: true })
for (const [key, data] of shards) writeFileSync(join(out, `${key}.json`), JSON.stringify(data))
console.log(`${printings.size} carte, ${kept} con il testo cambiato dalla prima stampa, ${shards.size} file`)
