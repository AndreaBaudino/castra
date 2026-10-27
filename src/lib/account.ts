import type { AppUser } from './auth'
import { fb } from './firebase'
import { pauseSync } from './sync'

// Deleting the account: everything stored in the cloud for it, the claimed circuit player, then the login itself.

export type DeleteOutcome = 'done' | 'cancelled' | 'reauth'

/** Firebase lets an account be deleted only shortly after signing in. */
const RECENT_MS = 4 * 60_000

export async function deleteAccount(user: AppUser, claimedPlayer: string | null): Promise<DeleteOutcome> {
  const { auth, authMod } = await fb()
  const current = auth.currentUser
  if (!current || current.uid !== user.uid) return 'cancelled'

  const signedInAt = Date.parse(current.metadata.lastSignInTime ?? '')
  if (!(Date.now() - signedInAt < RECENT_MS)) {
    // a Google account can confirm with the popup; an email account has to sign in again
    if (!current.providerData.some((p) => p.providerId === 'google.com')) return 'reauth'
    try {
      await authMod.reauthenticateWithPopup(current, new authMod.GoogleAuthProvider())
    } catch {
      return 'cancelled'
    }
  }

  pauseSync(true)
  try {
    return await wipe(user, claimedPlayer)
  } finally {
    pauseSync(false)
  }
}

async function wipe(user: AppUser, claimedPlayer: string | null): Promise<DeleteOutcome> {
  const { auth, authMod, db, fs } = await fb()
  const current = auth.currentUser!
  const refs = []
  for (const name of ['decks', 'matches']) {
    const snap = await fs.getDocs(fs.collection(db, 'users', user.uid, name))
    refs.push(...snap.docs.map((d) => d.ref))
  }
  if (claimedPlayer) refs.push(fs.doc(db, 'claims', claimedPlayer))
  refs.push(fs.doc(db, 'users', user.uid)) // last: the claim's rules read it
  for (let i = 0; i < refs.length; i += 400) {
    const batch = fs.writeBatch(db)
    for (const r of refs.slice(i, i + 400)) batch.delete(r)
    await batch.commit()
  }

  try {
    await authMod.deleteUser(current)
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/requires-recent-login') return 'reauth'
    throw e
  }
  return 'done'
}
