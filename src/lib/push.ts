import { fb } from './firebase'
import { readStored, writeStored } from './storage'

// Push notifications: this device's Firebase Messaging token, saved at users/{uid}/devices/{token}. What to send is in
// the account's prefs (notifyCircuit, notifyBanlist, notifyAdmin), and scripts/notify.mjs sends it.

const SAVED = 'cc.push' // { uid, token }: the token already saved for that account

/** Why notifications can't be turned on here, or null. */
export function pushBlock(): 'ios' | 'unsupported' | 'denied' | null {
  if (/iPhone|iPad/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches) return 'ios'
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  return Notification.permission === 'denied' ? 'denied' : null
}

/** Asks for the permission when needed and saves this device's token for the account: false if refused. */
export async function enablePush(uid: string) {
  if ((await Notification.requestPermission()) !== 'granted') return false
  const [{ getMessaging, getToken }, { getApp }, { db, fs }] = await Promise.all([import('firebase/messaging'), import('firebase/app'), fb()])
  // the app's own service worker shows them (public/push-sw.js), not Firebase's default one
  const token = await getToken(getMessaging(getApp()), { serviceWorkerRegistration: await navigator.serviceWorker.ready })
  const saved = readStored<{ uid: string; token: string } | null>(SAVED, null)
  if (saved?.uid === uid && saved.token === token) return true
  await fs.setDoc(fs.doc(db, 'users', uid, 'devices', token), { at: new Date().toISOString() })
  if (saved?.uid === uid) await fs.deleteDoc(fs.doc(db, 'users', uid, 'devices', saved.token)) // replaced by the new one
  writeStored(SAVED, { uid, token })
  return true
}

/** Signing out: this device stops getting the account's notifications. */
export async function dropPush(uid: string) {
  const saved = readStored<{ uid: string; token: string } | null>(SAVED, null)
  if (saved?.uid !== uid) return
  writeStored(SAVED, null)
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'users', uid, 'devices', saved.token)).catch(() => {}) // offline: the sender drops it later
}
