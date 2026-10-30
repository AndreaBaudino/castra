import { useMemo } from 'react'
import type { AppUser } from './auth'
import { fb, useLiveCollection } from './firebase'

// A circuit player claimed by an account ("this is me"): one account per player, shared by everyone.
// Stored at claims/{player key}; the Firestore rules let only the claimer change or drop it, and only an admin verify it.

export interface Claim {
  uid: string
  name: string | null
  photo: string | null
  at: string
  // chosen by the player on their page; missing = automatic (their most played commander)
  coverName?: string | null // the card whose art is behind their picture
  coverArt?: string | null // its art crop on Scryfall
  deck?: string | null // the commander shown as their favourite deck
  verified?: boolean // set by an admin who knows the player: until then the claim is only "linked"
}

export type ClaimLook = Pick<Claim, 'coverName' | 'coverArt' | 'deck'>

export function useClaims() {
  const { docs, loaded } = useLiveCollection<Claim>('claims')
  return { claims: useMemo(() => new Map(docs), [docs]), loaded }
}

/** Claims `key` for the user, dropping their previous claim in the same write. */
export async function claimPlayer(user: AppUser, key: string, previous: string | null) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  if (previous && previous !== key) batch.delete(fs.doc(db, 'claims', previous))
  // everyone can read the claims: the account's name only, never its email
  batch.set(fs.doc(db, 'claims', key), { uid: user.uid, name: user.name ?? null, photo: user.photo, at: new Date().toISOString() })
  // the rules check that the account points to the player it claims
  batch.set(fs.doc(db, 'users', user.uid), { circuitMe: key }, { merge: true })
  await batch.commit()
}

export async function unclaimPlayer(user: AppUser, key: string) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  batch.delete(fs.doc(db, 'claims', key))
  batch.set(fs.doc(db, 'users', user.uid), { circuitMe: null }, { merge: true })
  await batch.commit()
}

/** The claimer's choices for their page: the art behind their picture and their favourite deck. */
export async function customizeClaim(key: string, look: ClaimLook) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'claims', key), { coverName: look.coverName ?? null, coverArt: look.coverArt ?? null, deck: look.deck ?? null })
}
