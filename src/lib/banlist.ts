import type { DeckCard } from './decks'

// Centurion Commander banlist, from https://www.centurioncommander.eu/it/ban-list-it/
// Update these lists (and the date) with every banlist announcement.
export const BANLIST_UPDATED = '2026-10-15'

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
  // ante, physical and subgame cards
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

// curly apostrophes, case, and the back face of double-faced cards don't matter
const norm = (name: string) => name.split('//')[0].trim().replace(/[’‘]/g, "'").toLowerCase()
const banned = new Set(BANNED.map(norm))
const bannedCommander = new Set(BANNED_AS_COMMANDER.map(norm))
const bannedPartner = new Set(BANNED_AS_PARTNER.map(norm))

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

export const banCount = (b: BanCheck) => b.banned.length + b.asCommander.length + b.asPartner.length
