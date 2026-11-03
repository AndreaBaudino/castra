import { useMemo } from 'react'
import type { AppUser } from './auth'
import { fb, useLiveCollection, useLiveDoc } from './firebase'
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
export const useOrganizer = (uid: string | null) => useLiveDoc<Organizer>(uid && `organizers/${uid}`)

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
