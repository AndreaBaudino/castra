import { useEffect, useState } from 'react'
import { FIREBASE_CONFIG } from '../config'

export const cloudEnabled = !!FIREBASE_CONFIG

// Firebase is loaded lazily so the app stays light (and fully offline) when cloud features are off.
async function load() {
  const [app, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
  const fbApp = app.initializeApp(FIREBASE_CONFIG!)
  const db = fs.initializeFirestore(fbApp, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  })
  return { auth: auth.getAuth(fbApp), db, authMod: auth, fs }
}

let loading: ReturnType<typeof load> | null = null
export const fb = () => (loading ??= load())

/** A Firestore document kept up to date: null while loading, when missing or unreadable. */
export function useLiveDoc<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    setData(null)
    if (!cloudEnabled || !path) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(fs.doc(db, path), (snap) => setData((snap.data() as T) ?? null), () => setData(null))
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [path])
  return data
}

/**
 * A Firestore collection kept up to date, as [id, data] pairs; `loaded` once the server confirmed it. `where` keeps
 * only the documents whose field compares so with the value, or (a list) that match any of the conditions: a change
 * to the other documents isn't sent, nor paid for.
 */
type Cond = [string, '==' | '>=' | 'array-contains', string | boolean]
export function useLiveCollection<T>(name: string | null, where?: Cond | Cond[]) {
  const [docs, setDocs] = useState<[string, T][]>([])
  const [loaded, setLoaded] = useState(false) // confirmed by the server, not just the offline cache
  useEffect(() => {
    if (!cloudEnabled || !name) return // null: nothing to listen to (e.g. not an admin)
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      const col = fs.collection(db, name)
      const conds = (where && (Array.isArray(where[0]) ? where : [where])) as Cond[] | undefined
      unsub = fs.onSnapshot(
        !conds
          ? col
          : conds.length > 1
            ? fs.query(col, fs.or(...conds.map((c) => fs.where(...c))))
            : fs.query(col, fs.where(...conds[0])),
        { includeMetadataChanges: true },
        (snap) => {
          setDocs(snap.docs.map((d) => [d.id, d.data() as T]))
          if (!snap.metadata.fromCache) setLoaded(true)
        },
        () => {}, // rules not deployed yet, or offline: nothing shown
      )
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [name, JSON.stringify(where)]) // eslint-disable-line react-hooks/exhaustive-deps
  return { docs, loaded }
}
