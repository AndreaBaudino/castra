import { useEffect, useMemo, useState } from 'react'
import type { AppUser } from './auth'
import type { Claim } from './claims'
import { cloudEnabled, fb, useLiveCollection } from './firebase'

// The admin area: the accounts listed in admins/{uid} (added from the Firebase console) can revoke the claims of
// circuit players and clear what a claimer put on their page. The Firestore rules enforce all of it.

/** A claim revoked by an admin, at revoked/{player key}: that account can't claim the player again. */
export interface Revoked {
  uid: string
  name: string | null // the account's name when it was revoked
  at: string
  by: string // the admin's uid
}

export function useIsAdmin(uid: string | null) {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    setAdmin(false)
    if (!cloudEnabled || !uid) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(
        fs.doc(db, 'admins', uid),
        (snap) => setAdmin(snap.exists()),
        () => setAdmin(false), // rules not deployed yet, or offline
      )
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [uid])
  return admin
}

/** The revoked claims, by player key: only admins can read them. */
export function useRevoked() {
  const { docs } = useLiveCollection<Revoked>('revoked')
  return useMemo(() => new Map(docs), [docs])
}

/**
 * Frees the player and keeps that account from claiming them again. The account's own link to the player is
 * dropped by its app, when it tries to claim the player back and the rules refuse.
 */
export async function revokeClaim(admin: AppUser, key: string, claim: Claim) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  batch.delete(fs.doc(db, 'claims', key))
  batch.set(fs.doc(db, 'revoked', key), { uid: claim.uid, name: claim.name, at: new Date().toISOString(), by: admin.uid })
  await batch.commit()
}

/** Lets that account claim the player again. */
export async function unrevokeClaim(key: string) {
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'revoked', key))
}

/** Back to the automatic look: no art chosen behind the picture, no favourite deck. */
export async function clearClaimLook(key: string) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'claims', key), { coverName: null, coverArt: null, deck: null })
}

/** The "verified" tick on a claim: given by an admin who knows the player. */
export async function setClaimVerified(key: string, verified: boolean) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'claims', key), { verified })
}
