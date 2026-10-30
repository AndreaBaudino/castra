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

/** A Firestore collection kept up to date, as [id, data] pairs; `loaded` once the server confirmed it. */
export function useLiveCollection<T>(name: string) {
  const [docs, setDocs] = useState<[string, T][]>([])
  const [loaded, setLoaded] = useState(false) // confirmed by the server, not just the offline cache
  useEffect(() => {
    if (!cloudEnabled) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(
        fs.collection(db, name),
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
  }, [name])
  return { docs, loaded }
}
