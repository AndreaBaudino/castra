import { useEffect, useState } from 'react'
import type { AppUser } from './auth'
import { cloudEnabled, fb } from './firebase'

// A circuit player claimed by an account ("this is me"): one account per player, shared by everyone.
// Stored at claims/{player key}; the Firestore rules let only the claimer change or drop it.

export interface Claim {
  uid: string
  name: string | null
  photo: string | null
  at: string
}

export function useClaims() {
  const [claims, setClaims] = useState<Map<string, Claim>>(new Map())
  const [loaded, setLoaded] = useState(false) // confirmed by the server, not just the offline cache
  useEffect(() => {
    if (!cloudEnabled) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(
        fs.collection(db, 'claims'),
        { includeMetadataChanges: true },
        (snap) => {
          setClaims(new Map(snap.docs.map((d) => [d.id, d.data() as Claim])))
          if (!snap.metadata.fromCache) setLoaded(true)
        },
        () => {}, // rules not deployed yet, or offline: no claims shown
      )
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])
  return { claims, loaded }
}

/** Claims `key` for the user, dropping their previous claim in the same write. */
export async function claimPlayer(user: AppUser, key: string, previous: string | null) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  if (previous && previous !== key) batch.delete(fs.doc(db, 'claims', previous))
  batch.set(fs.doc(db, 'claims', key), { uid: user.uid, name: user.name ?? user.email, photo: user.photo, at: new Date().toISOString() })
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
