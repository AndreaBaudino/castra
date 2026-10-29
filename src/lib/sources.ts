import { useEffect, useState } from 'react'
import type { AppUser } from './auth'
import { cloudEnabled, fb } from './firebase'
import { META_DATA_URL } from '../config'

// The tournament sheets read by the nightly meta update (.github/workflows/meta.yml), kept by the admins at
// sources/{drive id}. Until that collection is filled the update reads scripts/meta/sources.json instead: the admin
// area imports it once. Each tournament goes in the year of its date (events) or of its `year` (leagues).

export type SourceKind = 'l1' | 'l2' | 'league' | 'online'
export const SOURCE_KINDS: SourceKind[] = ['l1', 'l2', 'league', 'online']
export const isEvent = (k: SourceKind) => k === 'l1' || k === 'l2'

export interface Source {
  drive: string // the file id in the sheet's link
  kind: SourceKind
  // events (l1, l2): one tournament per file, from its "Classifica" tab
  name?: string
  date?: string // ISO day: the tournament's year and season
  circuit?: string // the event's title in the circuit sheet, to link the two
  // leagues (league, online): one tournament per numbered tab, the stages
  year?: number
  season?: 's1' | 's2'
  league?: string // as in the circuit sheet
  venue?: string // where the stages are played, when it isn't the league's name
}

export const sourceYear = (s: Source) => (isEvent(s.kind) ? Number(s.date?.slice(0, 4)) : s.year) || null
/** Events up to May are the first season, as in scripts/build-meta.mjs. */
export const sourceSeason = (s: Source) => (isEvent(s.kind) ? (s.date && +s.date.slice(5, 7) <= 5 ? 's1' : 's2') : s.season)
export const sourceLabel = (s: Source) => (isEvent(s.kind) ? s.name : s.venue ? `${s.league} (${s.venue})` : s.league) ?? s.drive

/** The file id in a Google Sheets or Drive link, or the id itself. */
export function driveIdOf(text: string) {
  const s = text.trim()
  const m = s.match(/\/d\/([-\w]{20,})/) ?? s.match(/[?&]id=([-\w]{20,})/) ?? s.match(/^([-\w]{20,})$/)
  return m?.[1] ?? null
}

export function useSources(enabled: boolean) {
  const [sources, setSources] = useState<Source[]>([])
  const [loaded, setLoaded] = useState(false) // confirmed by the server, not just the offline cache
  useEffect(() => {
    if (!cloudEnabled || !enabled) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(
        fs.collection(db, 'sources'),
        { includeMetadataChanges: true },
        (snap) => {
          setSources(snap.docs.map((d) => d.data() as Source))
          if (!snap.metadata.fromCache) setLoaded(true)
        },
        () => {},
      )
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [enabled])
  return { sources, loaded }
}

// only the fields of its kind, with nothing empty: the rules accept no others
function clean(s: Source): Source {
  const keep: (keyof Source)[] = isEvent(s.kind) ? ['drive', 'kind', 'name', 'date', 'circuit'] : ['drive', 'kind', 'year', 'season', 'league', 'venue']
  const out: Record<string, unknown> = {}
  for (const k of keep) {
    const v = typeof s[k] === 'string' ? (s[k] as string).trim() : s[k]
    if (v !== undefined && v !== '') out[k] = v
  }
  return out as unknown as Source
}

/** Saves a sheet; `previous` is its drive id before the edit, when the link changed. */
export async function saveSource(admin: AppUser, s: Source, previous?: string) {
  const { db, fs } = await fb()
  const batch = fs.writeBatch(db)
  if (previous && previous !== s.drive) batch.delete(fs.doc(db, 'sources', previous))
  batch.set(fs.doc(db, 'sources', s.drive), { ...clean(s), at: new Date().toISOString(), by: admin.uid })
  await batch.commit()
}

export async function deleteSource(drive: string) {
  const { db, fs } = await fb()
  await fs.deleteDoc(fs.doc(db, 'sources', drive))
}

const REPO_SOURCES_URL = 'https://raw.githubusercontent.com/AndreaBaudino/castra/main/scripts/meta/sources.json'

/** Copies the list in the repository (scripts/meta/sources.json) to Firestore, where the admins keep it from now on. */
export async function importRepoSources(admin: AppUser) {
  const res = await fetch(REPO_SOURCES_URL, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const list = (await res.json()).tournaments as Source[]
  const { db, fs } = await fb()
  const at = new Date().toISOString()
  for (let i = 0; i < list.length; i += 400) {
    const batch = fs.writeBatch(db)
    for (const s of list.slice(i, i + 400)) batch.set(fs.doc(db, 'sources', s.drive), { ...clean(s), at, by: admin.uid })
    await batch.commit()
  }
  return list.length
}

/** How the last nightly update went: status.json, written by scripts/meta-status.mjs next to meta.json. */
export interface MetaStatus {
  at: string
  ok: boolean
  error: string | null
  origin: 'firestore' | 'file' | null
  sources: number | null
  failed: { drive: string; error: string }[]
  read: Record<string, number> // tournaments read from each sheet: 0 = no results yet
  years: { year: number; t: number; e: number; c: number }[]
  warnings: string[]
}

const STATUS_URL = META_DATA_URL.replace(/[^/]+$/, 'status.json')

export function useMetaStatus() {
  const [status, setStatus] = useState<MetaStatus | null | 'none' | 'error'>(null) // none: not published yet
  useEffect(() => {
    let cancelled = false
    fetch(STATUS_URL, { cache: 'no-cache' })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) return setStatus('none')
        if (!res.ok) throw new Error()
        setStatus((await res.json()) as MetaStatus)
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [])
  return status
}
