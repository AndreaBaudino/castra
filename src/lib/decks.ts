import { DECK_SIZE } from '../config'
import { type BanCheck, banCheck, banCount } from './banlist'

export type Section = 'commander' | 'main' | 'side'

export interface CardInfo {
  id: string
  name: string
  typeLine: string
  manaCost: string
  cmc: number
  colorIdentity: string[]
  image?: string // normal size
  art?: string // art crop
  set?: string // edition code, e.g. "c21"
  setName?: string
  cn?: string // collector number
}

export interface DeckCard {
  name: string
  qty: number
  section: Section
  set?: string // requested edition (from import or chosen in the app)
  cn?: string
  info?: CardInfo
}

export type DeckView = 'list' | 'pile' | 'grid'

export interface Deck {
  id: string
  name: string
  tags: string[]
  notes: string
  cards: DeckCard[]
  view?: DeckView // default 'list'
  cover?: string // name of the card whose art is the deck's splash; default: commander
  createdAt: string
  updatedAt: string
}

export type Group =
  | 'commander'
  | 'creatures'
  | 'planeswalkers'
  | 'instants'
  | 'sorceries'
  | 'artifacts'
  | 'enchantments'
  | 'battles'
  | 'lands'
  | 'other'
  | 'sideboard'

export const GROUP_ORDER: Group[] = [
  'commander',
  'creatures',
  'planeswalkers',
  'instants',
  'sorceries',
  'artifacts',
  'enchantments',
  'battles',
  'lands',
  'other',
  'sideboard',
]

export function groupOf(c: DeckCard): Group {
  if (c.section === 'commander') return 'commander'
  if (c.section === 'side') return 'sideboard'
  const t = (c.info?.typeLine ?? '').split('//')[0].toLowerCase()
  if (t.includes('land')) return 'lands'
  if (t.includes('creature')) return 'creatures'
  if (t.includes('planeswalker')) return 'planeswalkers'
  if (t.includes('battle')) return 'battles'
  if (t.includes('instant')) return 'instants'
  if (t.includes('sorcery')) return 'sorceries'
  if (t.includes('artifact')) return 'artifacts'
  if (t.includes('enchantment')) return 'enchantments'
  return 'other'
}

// ---------- text import (Moxfield / MTGO / Arena style) ----------

const SECTION_HEADERS: [RegExp, Section | null][] = [
  [/^(\/\/\s*)?(commanders?|comandant[ei]|command zone)\s*:?$/i, 'commander'],
  [/^(\/\/\s*)?(sideboard|side|maybeboard|considering|fuori mazzo)\s*:?$/i, 'side'],
  [/^(\/\/\s*)?(deck|main|mainboard|mazzo|companion)\s*:?$/i, 'main'],
]

export function parseDecklist(text: string): DeckCard[] {
  const out: DeckCard[] = []
  let section: Section = 'main'
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line) continue
    const header = SECTION_HEADERS.find(([re]) => re.test(line))
    if (header) {
      section = header[1] ?? 'main'
      continue
    }
    if (line.startsWith('//') || line.startsWith('#')) continue
    let s = line.replace(/^SB:\s*/i, () => {
      section = 'side'
      return ''
    })
    const m = s.match(/^(\d+)\s*x?\s+(.+)$/i)
    const qty = m ? parseInt(m[1], 10) : 1
    s = m ? m[2] : s
    // tags and foil markers: "Sol Ring (C21) 263 *F* #ramp"
    s = s
      .replace(/\s+#\S.*$/, '')
      .replace(/\s+\*[A-Z]+\*/g, '')
      .trim()
    // edition: "(C21) 263" (Moxfield/Arena) or "[C21]" (MTGO-like)
    let set: string | undefined
    let cn: string | undefined
    s = s
      .replace(/\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([\w★-]+))?\s*$/, (_, a: string, b?: string) => {
        set = a.toLowerCase()
        cn = b
        return ''
      })
      .replace(/\s+\[([A-Za-z0-9]{2,6})\]\s*$/, (_, a: string) => {
        set = a.toLowerCase()
        return ''
      })
      .trim()
    if (!s) continue
    const existing = out.find((c) => c.name.toLowerCase() === s.toLowerCase() && c.section === section)
    if (existing) existing.qty += qty
    else out.push({ name: s, qty, section, ...(set ? { set } : {}), ...(cn ? { cn } : {}) })
  }
  return out
}

export function exportDecklist(deck: Deck): string {
  const line = (c: DeckCard) => {
    const set = c.info?.set ?? c.set
    const cn = c.info?.cn ?? c.cn
    return `${c.qty} ${c.name}${set ? ` (${set.toUpperCase()})${cn ? ` ${cn}` : ''}` : ''}`
  }
  const cmd = deck.cards.filter((c) => c.section === 'commander')
  const main = deck.cards.filter((c) => c.section === 'main')
  const side = deck.cards.filter((c) => c.section === 'side')
  const parts: string[] = []
  if (cmd.length) parts.push('Commander', ...cmd.map(line), '')
  parts.push('Deck', ...main.map(line))
  if (side.length) parts.push('', 'Sideboard', ...side.map(line))
  return parts.join('\n')
}

// ---------- validation ----------

const BASIC = /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i
const ANY_NUMBER = [
  'relentless rats',
  'rat colony',
  'persistent petitioners',
  'shadowborn apostle',
  'dragon\'s approach',
  'slime against humanity',
  'templar knight',
  'hare apparent',
  'cid, timeless artificer',
]

export interface DeckCheck {
  count: number
  commanders: DeckCard[]
  identity: string[]
  duplicates: string[]
  offIdentity: string[]
  bans: BanCheck
}

export function checkDeck(deck: Deck): DeckCheck {
  const inDeck = deck.cards.filter((c) => c.section !== 'side')
  const commanders = deck.cards.filter((c) => c.section === 'commander')
  const identity = [...new Set(commanders.flatMap((c) => c.info?.colorIdentity ?? []))]
  const duplicates = inDeck
    .filter((c) => c.qty > 1 && !BASIC.test(c.name) && !ANY_NUMBER.includes(c.name.toLowerCase()))
    .map((c) => c.name)
  const offIdentity = commanders.length
    ? inDeck.filter((c) => c.info && c.info.colorIdentity.some((x) => !identity.includes(x))).map((c) => c.name)
    : []
  return {
    count: inDeck.reduce((s, c) => s + c.qty, 0),
    commanders,
    identity,
    duplicates,
    offIdentity,
    bans: banCheck(deck.cards),
  }
}

export const isValid = (c: DeckCheck) =>
  c.count === DECK_SIZE && c.commanders.length > 0 && !c.duplicates.length && !c.offIdentity.length && !banCount(c.bans)

export const WUBRG = ['W', 'U', 'B', 'R', 'G']
export const sortColors = (cs: string[]) => WUBRG.filter((c) => cs.includes(c))

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

/** The deck's splash art: the chosen cover card (in its edition), otherwise the first commander. */
export function deckCover(deck: Deck): string | undefined {
  const chosen = deck.cover ? deck.cards.find((c) => c.name === deck.cover)?.info?.art : undefined
  return chosen ?? deck.cards.find((c) => c.section === 'commander')?.info?.art
}

export const cardKey = (c: Pick<DeckCard, 'name' | 'section'>) => `${c.section}|${c.name}`
