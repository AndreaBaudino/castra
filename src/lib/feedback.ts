import type { AppUser } from './auth'
import { fb } from './firebase'

// Reports sent from the app to the admins, at feedback/{id}: only admins read them (see firestore.rules).

export type FeedbackKind = 'bug' | 'data' | 'idea'
export const FEEDBACK_KINDS: FeedbackKind[] = ['bug', 'data', 'idea']

export interface Feedback {
  uid: string
  name: string | null // the account's name
  email: string | null // only when the user wants an answer
  kind: FeedbackKind
  text: string
  page: string | null // the hash of the page it is about, e.g. "#meta/p~mario rossi"
  about: string | null // that page's title
  version: string
  device: string
  at: string
  done: boolean
}

// "Android · Chrome": enough to reproduce a problem, without the whole user agent
function deviceOf() {
  const ua = navigator.userAgent
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Linux'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : 'Safari'
  return `${os} · ${browser}${matchMedia('(display-mode: standalone)').matches ? ' · app' : ''}`
}

export async function sendFeedback(user: AppUser, f: Pick<Feedback, 'kind' | 'text' | 'page' | 'about'>, reply: boolean) {
  const { db, fs } = await fb()
  await fs.addDoc(fs.collection(db, 'feedback'), {
    ...f,
    uid: user.uid,
    name: user.name ?? null,
    email: reply ? user.email : null,
    version: __BUILD__.commit ? `${__BUILD__.date} · ${__BUILD__.commit}` : __BUILD__.date,
    device: deviceOf(),
    at: new Date().toISOString(),
    done: false,
  })
}

export async function setFeedbackDone(id: string, done: boolean) {
  const { db, fs } = await fb()
  await fs.updateDoc(fs.doc(db, 'feedback', id), { done })
}

export async function deleteFeedback(id: string) {
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'feedback', id))
}
