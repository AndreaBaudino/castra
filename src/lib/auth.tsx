import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { cloudEnabled, fb } from './firebase'

export interface AppUser {
  uid: string
  email: string | null
  name: string | null
  photo: string | null
}

interface AuthApi {
  user: AppUser | null
  ready: boolean
  signInGoogle: () => Promise<void>
  signInEmail: (email: string, pw: string) => Promise<void>
  signUpEmail: (email: string, pw: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthApi>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [ready, setReady] = useState(!cloudEnabled)

  useEffect(() => {
    if (!cloudEnabled) return
    let unsub = () => {}
    fb().then(({ auth, authMod }) => {
      unsub = authMod.onAuthStateChanged(auth, (u) => {
        setUser(u && { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL })
        setReady(true)
      })
    })
    return () => unsub()
  }, [])

  const api: AuthApi = {
    user,
    ready,
    async signInGoogle() {
      const { auth, authMod } = await fb()
      const provider = new authMod.GoogleAuthProvider()
      try {
        await authMod.signInWithPopup(auth, provider)
      } catch (e) {
        // installed PWAs (notably iOS) may not support popups: fall back to a full-page redirect
        const code = (e as { code?: string }).code
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')
          await authMod.signInWithRedirect(auth, provider)
        else throw e
      }
    },
    async signInEmail(email, pw) {
      const { auth, authMod } = await fb()
      await authMod.signInWithEmailAndPassword(auth, email, pw)
    },
    async signUpEmail(email, pw) {
      const { auth, authMod } = await fb()
      await authMod.createUserWithEmailAndPassword(auth, email, pw)
    },
    async resetPassword(email) {
      const { auth, authMod } = await fb()
      await authMod.sendPasswordResetEmail(auth, email)
    },
    async signOut() {
      const { auth, authMod } = await fb()
      await authMod.signOut(auth)
    },
  }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

/** Maps Firebase error codes to i18n keys. */
export function authErrorKey(e: unknown) {
  const code = (e as { code?: string }).code ?? ''
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code)) return 'auth.err.credentials'
  if (code === 'auth/email-already-in-use') return 'auth.err.inUse'
  if (code === 'auth/weak-password') return 'auth.err.weak'
  if (code === 'auth/invalid-email') return 'auth.err.email'
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null
  if (code === 'auth/network-request-failed') return 'auth.err.network'
  return 'auth.err.generic'
}
