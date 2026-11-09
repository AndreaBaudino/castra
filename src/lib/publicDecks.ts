import { useEffect } from 'react'
import { type Deck, deckCover } from './decks'
import { fb, useLiveCollection } from './firebase'
import { readStored, writeStored } from './storage'
import type { Claim } from './claims'

// The public decks of the verified players, by commander (publicDecks/{uid}~{deck}): a small card of each, kept by the
// owner's app, so a commander's page reads them in one query instead of every player's whole decks. The rules take it
// only from an account whose claim is verified.

export interface PublicDeck {
  uid: string
  deck: string
  player: string // the claim's key
  name: string
  commanders: string[]
  cover: string | null
  tags: string[]
  at: string // the deck's updatedAt
}

// a double-faced commander by its front face, as the meta and the imported lists may name it either way
const front = (name: string) => name.split(' // ')[0]

const KEY = 'cc.publicIndex' // what this device last wrote: id → the card as JSON

const entryOf = (uid: string, player: string, d: Deck): PublicDeck => ({
  uid,
  deck: d.id,
  player,
  name: d.name.slice(0, 200),
  commanders: d.cards.filter((c) => c.section === 'commander').map((c) => front(c.name)).slice(0, 2),
  cover: deckCover(d) ?? null,
  tags: d.tags.slice(0, 5),
  at: d.updatedAt,
})

/** Keeps the account's public decks in the index while its player is verified, and takes them out otherwise. */
export function usePublishDecks(uid: string | null, player: string | null, decks: Deck[]) {
  useEffect(() => {
    if (!uid) return
    // a deck being edited changes at every tap: written once it settles
    const timer = setTimeout(async () => {
      const want = new Map(
        player
          ? decks
              .filter((d) => d.visibility === 'public' && d.cards.some((c) => c.section === 'commander'))
              .map((d) => [`${uid}~${d.id}`, JSON.stringify(entryOf(uid, player, d))])
          : [],
      )
      // another account's, signed in before on this device, aren't this one's to touch
      const last = Object.fromEntries(Object.entries(readStored<Record<string, string>>(KEY, {})).filter(([id]) => id.startsWith(`${uid}~`)))
      const { db, fs } = await fb()
      const done: Record<string, string> = {}
      // a write that failed (offline) is tried again next time
      for (const [id, json] of want) {
        if (last[id] === json) done[id] = json
        else await fs.setDoc(fs.doc(db, 'publicDecks', id), JSON.parse(json)).then(() => (done[id] = json), () => {})
      }
      for (const id of Object.keys(last))
        if (!want.has(id)) await fs.deleteDoc(fs.doc(db, 'publicDecks', id)).catch(() => (done[id] = last[id]))
      writeStored(KEY, done)
    }, 2000)
    return () => clearTimeout(timer)
  }, [uid, player, decks])
}

/**
 * A commander of the meta's public decks ("Jeska, Thrice Reborn / Yoshimaru, Ever Faithful" for partners), newest
 * first: only of the players still verified (a tick taken back hides them).
 */
export function useCommanderDecks(name: string, claims: Map<string, Claim>) {
  const parts = name.split(' / ').map(front)
  // no commander (a deck without one, or none asked for): nothing to read
  const { docs, loaded } = useLiveCollection<PublicDeck>(parts[0] ? 'publicDecks' : null, ['commanders', 'array-contains', parts[0]])
  const decks = docs
    .map(([, d]) => d)
    .filter((d) => d.commanders.length === parts.length && parts.every((p) => d.commanders.includes(p)))
    .filter((d) => claims.get(d.player)?.verified && claims.get(d.player)?.uid === d.uid)
    .sort((a, b) => b.at.localeCompare(a.at))
  return { decks, loaded }
}
