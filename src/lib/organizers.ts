import { useEffect, useMemo, useState } from 'react'
import type { AppUser } from './auth'
import { cloudEnabled, fb, useLiveCollection } from './firebase'
import { type Source, isEvent } from './sources'

// Tournament organizers (TO): verified circuit players an admin promoted, at organizers/{uid}. A TO runs the stages of
// its leagues and the level 1 and 2 tournaments of those leagues (the sheet's zone) or assigned to it by hand. Only
// admins write them; the rules check that the account holds a verified claim on the player (firestore.rules).

export interface Organizer {
  player: string // circuit player key
  name: string
  leagues: string[] // as in the circuit sheet
  at: string
  by: string // the admin's uid
}

/** Every organizer by uid: only admins can read them all. */
export function useOrganizers() {
  const { docs, loaded } = useLiveCollection<Organizer>('organizers')
  return { organizers: useMemo(() => new Map(docs), [docs]), loaded }
}

/** The account's own TO role: null when it isn't a TO (or not signed in). */
export function useOrganizer(uid: string | null) {
  const [o, setO] = useState<Organizer | null>(null)
  useEffect(() => {
    setO(null)
    if (!cloudEnabled || !uid) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(fs.doc(db, 'organizers', uid), (snap) => setO((snap.data() as Organizer) ?? null), () => setO(null))
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [uid])
  return o
}

/** Whether the TO runs the tournaments of this sheet. */
export const canRun = (uid: string, o: Organizer, s: Source) =>
  isEvent(s.kind)
    ? !!s.tos?.includes(uid) || (!!s.zone && o.leagues.includes(s.zone))
    : s.kind === 'league' && !!s.league && o.leagues.includes(s.league)

export async function saveOrganizer(admin: AppUser, uid: string, o: Pick<Organizer, 'player' | 'name' | 'leagues'>) {
  const { db, fs } = await fb()
  await fs.setDoc(fs.doc(db, 'organizers', uid), { ...o, at: new Date().toISOString(), by: admin.uid })
}

export async function removeOrganizer(uid: string) {
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'organizers', uid))
}
