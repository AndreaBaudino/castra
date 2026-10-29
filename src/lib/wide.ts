import { useSyncExternalStore } from 'react'

// The desktop layout (side menu, a list and its detail side by side) starts at this width: the same as in index.css
const query = typeof matchMedia === 'function' ? matchMedia('(min-width: 1024px)') : null

const subscribe = (cb: () => void) => {
  query?.addEventListener('change', cb)
  return () => query?.removeEventListener('change', cb)
}

export const useWide = () => useSyncExternalStore(subscribe, () => !!query?.matches)
