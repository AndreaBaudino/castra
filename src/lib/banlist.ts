import { useSyncExternalStore } from 'react'
import type { DeckCard } from './decks'
import { FIREBASE_CONFIG } from '../config'
import { readStored, writeStored } from './storage'

// Centurion Commander banlist, from https://www.centurioncommander.eu/it/ban-list-it/. An admin reads it from the site
// and publishes it from the admin area (src/lib/banlistSync.ts) at config/banlist on Firestore, where every app reads
// it at start: the lists below are the copy shipped with the app, used until the published one has been read once
// (then it's kept on the device).

/** Not allowed anywhere in the game. */
const BANNED = [
  // artifacts
  'Black Lotus', 'Chrome Mox', 'Grim Monolith', 'Jeweled Lotus', 'Mana Crypt', 'Mana Vault', 'Mox Diamond', 'Mox Emerald',
  'Mox Jet', 'Mox Pearl', 'Mox Ruby', 'Mox Sapphire', "Sensei's Divining Top", 'Sol Ring', 'The One Ring', 'Time Vault',
  // enchantments
  'Back to Basics', 'Fastbond', 'Humility', 'Parallax Tide', 'Underworld Breach', 'Food Chain',
  // sorceries
  'Balance', 'Channel', 'Demonic Tutor', 'Imperial Seal', 'Natural Order', 'Time Walk', 'Tinker', 'Treasure Cruise',
  // instants
  'Ancestral Recall', 'Deadly Rollick', 'Deflecting Swat', 'Entomb', 'Fierce Guardianship', 'Flash', 'Gifts Ungiven',
  'Intuition', 'Invert Polarity', 'Mana Drain', 'Mystical Tutor', 'Price of Progress', 'Vampiric Tutor',
  // creatures
  'Emrakul, the Aeons Torn', 'Emrakul, the Promised End', 'Necrotic Ooze', "Thassa's Oracle", 'Trazyn the Infinite',
  // lands
  'Ancient Tomb', "Gaea's Cradle", 'Karakas', "Mishra's Workshop", 'Strip Mine', 'The Tabernacle at Pendrell Vale', 'Tolarian Academy',
  // planeswalkers
  'Comet, Stellar Pup',
]

/** Ante, physical and subgame cards: the format's rules rather than its banlist, so not on the site's lists. */
const NEVER_LEGAL = [
  'Amulet of Quoz', 'Bronze Tablet', 'Contract from Below', 'Darkpact', 'Demonic Attorney', 'Jeweled Bird', 'Rebirth',
  'Tempest Efreet', 'Timmerian Fiends', 'Falling Star', 'Chaos Orb', 'Shahrazad',
]

/** Fine in the 99, not as the commander. */
const BANNED_AS_COMMANDER = [
  'Derevi, Empyrial Tactician', 'Edgar Markov', 'Emry, Lurker of the Loch', 'Eris, Roar of the Storm', 'Inalla, Archmage Ritualist',
  'Nadu, Winged Wisdom', 'Raffine, Scheming Seer', 'Shorikai, Genesis Engine', 'Tamiyo, Inquisitive Student',
  "Uro, Titan of Nature's Wrath", 'Winota, Joiner of Forces', "Yuriko, the Tiger's Shadow",
]

/** Fine as a lone commander or in the 99, not next to another commander or as a companion. */
const BANNED_AS_PARTNER = ['Lutri, the Spellchaser']

/** The banlist as published by scripts/fetch-banlist.mjs. */
export interface Banlist {
  v: 1
  checked: string // when it was read from the site
  announcement: { date: string; title: string; url: string } | null // the latest banlist update on the site
  banned: string[]
  commander: string[]
  partner: string[]
  builtIn?: true // the copy shipped with the app, never published
}

const BUILT_IN: Banlist = {
  v: 1,
  checked: '2026-10-15',
  announcement: { date: '2026-10-15', title: 'Banlist Update – 15 ottobre 2026', url: 'https://www.centurioncommander.eu/it/banlist-update-15-ottobre-2026/' },
  banned: BANNED,
  commander: BANNED_AS_COMMANDER,
  partner: BANNED_AS_PARTNER,
  builtIn: true,
}
// read through Firestore's REST API: no need to load Firebase for it, nor to be signed in
const URL_ = FIREBASE_CONFIG && `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/config/banlist`
const CACHE_KEY = 'cc.banlist'

// curly apostrophes, case, and the back face of double-faced cards don't matter
export const cardKey = (name: string) => name.split('//')[0].trim().replace(/[’‘]/g, "'").toLowerCase()
const norm = cardKey
let current = BUILT_IN
let banned = new Set<string>()
let bannedCommander = new Set<string>()
let bannedPartner = new Set<string>()
const listeners = new Set<() => void>()
function apply(b: Banlist) {
  current = b
  banned = new Set([...b.banned, ...NEVER_LEGAL].map(norm))
  bannedCommander = new Set(b.commander.map(norm))
  bannedPartner = new Set(b.partner.map(norm))
  listeners.forEach((l) => l())
}
const valid = (b: unknown): b is Banlist => {
  const x = b as Banlist
  return !!x && x.v === 1 && [x.banned, x.commander, x.partner].every((l) => Array.isArray(l) && l.every((n) => typeof n === 'string')) && x.banned.length >= 30
}
apply(((b) => (valid(b) ? b : BUILT_IN))(readStored<unknown>(CACHE_KEY, null)))

let loading: Promise<void> | null = null
/** Reads the published banlist once per session; offline, the last one read stays. */
export function loadBanlist() {
  if (!URL_) return Promise.resolve()
  return (loading ??= fetch(URL_, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((doc: { fields?: { json?: { stringValue?: string } } } | null) => {
      const b: unknown = JSON.parse(doc?.fields?.json?.stringValue ?? 'null')
      if (valid(b) && JSON.stringify(b) !== JSON.stringify(current)) setBanlist(b)
    })
    .catch(() => {}))
}

/** Uses a banlist from now on, on this device too. */
export function setBanlist(b: Banlist) {
  writeStored(CACHE_KEY, b)
  apply(b)
}

/** The banlist in use; components calling this re-render when a newer one arrives. */
export function useBanlist() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

export interface BanCheck {
  banned: string[] // anywhere in the deck
  asCommander: string[] // set as commander, allowed only in the 99
  asPartner: string[] // commander with a partner, or companion in the sideboard
}

export function banCheck(cards: DeckCard[]): BanCheck {
  const commanders = cards.filter((c) => c.section === 'commander')
  // stickers and attractions are banned too: recognisable from the type line
  const subgame = (c: DeckCard) => /\b(attraction|stickers)\b/i.test(c.info?.typeLine ?? '')
  return {
    banned: cards.filter((c) => banned.has(norm(c.name)) || subgame(c)).map((c) => c.name),
    asCommander: commanders.filter((c) => bannedCommander.has(norm(c.name))).map((c) => c.name),
    asPartner: cards
      .filter((c) => bannedPartner.has(norm(c.name)) && ((c.section === 'commander' && commanders.length > 1) || c.section === 'side'))
      .map((c) => c.name),
  }
}

export const isBanned = (name: string) => banned.has(norm(name))

export type Legality = 'legal' | 'banned' | 'notCommander' | 'notPartner'

/** One card on its own, for its page: banned, banned as commander or as a partner, or legal. */
export function legalityOf(name: string, typeLine = ''): Legality {
  if (banned.has(norm(name)) || /\b(attraction|stickers)\b/i.test(typeLine)) return 'banned'
  if (bannedCommander.has(norm(name))) return 'notCommander'
  if (bannedPartner.has(norm(name))) return 'notPartner'
  return 'legal'
}

export const banCount = (b: BanCheck) => b.banned.length + b.asCommander.length + b.asPartner.length
