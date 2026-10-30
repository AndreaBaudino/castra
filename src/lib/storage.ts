import { useEffect, useState } from 'react'

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

// copies of downloaded data, the largest values stored: they make room for the user's own data when storage is full
const isCache = (key: string) => key === 'cc.meta.data' || key.startsWith('cc.circuit.v2')

export function writeStored<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    if (isCache(key)) return // downloaded again next time
    try {
      for (const k of Object.keys(localStorage)) if (isCache(k)) localStorage.removeItem(k)
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // still full, or unavailable: the app keeps working in memory
    }
  }
}

/** useState persisted in localStorage. */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStored(key, initial))
  useEffect(() => {
    writeStored(key, value)
  }, [key, value])
  return [value, setValue] as const
}
