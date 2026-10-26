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
