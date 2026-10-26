import { useEffect, useRef } from 'react'
import { fb } from './firebase'

/**
 * Keeps a local list (already persisted in localStorage) in sync with users/{uid}/{name} in Firestore.
 * - first snapshot after login: merges remote and local (local wins only if `newer` says so)
 * - later snapshots: remote is the source of truth (it already includes our pending writes)
 * - local changes: diffed against the last known remote state and written in batches
 */
export function useCollectionSync<T extends { id: string }>(
  uid: string | null,
  name: string,
  items: T[],
  setItems: (fn: (prev: T[]) => T[]) => void,
  newer?: (local: T, remote: T) => boolean,
) {
  const synced = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    synced.current = null
    if (!uid) return
    let unsub = () => {}
    let cancelled = false
    let first = true
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(fs.collection(db, 'users', uid, name), (snap) => {
        const remote = snap.docs.map((d) => d.data() as T)
        synced.current = new Map(remote.map((r) => [r.id, JSON.stringify(r)]))
        const isFirst = first
        first = false
        setItems((local) => {
          if (!isFirst) return remote
          const byId = new Map(remote.map((r) => [r.id, r]))
          for (const l of local) {
            const r = byId.get(l.id)
            if (!r || newer?.(l, r)) byId.set(l.id, l)
          }
          return [...byId.values()]
        })
      })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [uid, name]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const known = synced.current
    if (!uid || !known) return
    const writes: { id: string; data?: T }[] = []
    const ids = new Set<string>()
    for (const it of items) {
      ids.add(it.id)
      const json = JSON.stringify(it)
      if (known.get(it.id) !== json) {
        writes.push({ id: it.id, data: JSON.parse(json) }) // JSON round-trip drops undefined (rejected by Firestore)
        known.set(it.id, json)
      }
    }
    for (const id of [...known.keys()])
      if (!ids.has(id)) {
        writes.push({ id })
        known.delete(id)
      }
    if (!writes.length) return
    fb().then(async ({ db, fs }) => {
      for (let i = 0; i < writes.length; i += 400) {
        const batch = fs.writeBatch(db)
        for (const w of writes.slice(i, i + 400)) {
          const ref = fs.doc(db, 'users', uid, name, w.id)
          if (w.data) batch.set(ref, w.data)
          else batch.delete(ref)
        }
        await batch.commit().catch((e) => console.error('sync', name, e))
      }
    })
  }, [items, uid, name])
}

/** Syncs one small settings object stored as a field of users/{uid}. */
export function useDocFieldSync<T>(uid: string | null, field: string, value: T, setValue: (v: T) => void) {
  const known = useRef<string | null>(null)
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    known.current = null
    if (!uid) return
    let unsub = () => {}
    let cancelled = false
    fb().then(({ db, fs }) => {
      if (cancelled) return
      unsub = fs.onSnapshot(fs.doc(db, 'users', uid), (snap) => {
        const remote = snap.get(field) as T | undefined
        if (remote === undefined) {
          // nothing saved yet for this account: upload the local value
          known.current = JSON.stringify(latest.current)
          fs.setDoc(fs.doc(db, 'users', uid), { [field]: JSON.parse(known.current) }, { merge: true }).catch(() => {})
          return
        }
        known.current = JSON.stringify(remote)
        setValue(remote)
      })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [uid, field]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!uid || known.current === null) return
    const json = JSON.stringify(value)
    if (json === known.current) return
    known.current = json
    fb().then(({ db, fs }) =>
      fs.setDoc(fs.doc(db, 'users', uid), { [field]: JSON.parse(json) }, { merge: true }).catch((e) => console.error('sync', field, e)),
    )
  }, [value, uid, field])
}
