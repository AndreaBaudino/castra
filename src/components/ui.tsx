import { type ReactNode, useEffect, useRef } from 'react'

export function Pips({ colors, size = 12 }: { colors: string | string[]; size?: number }) {
  const list = typeof colors === 'string' ? colors.split('') : colors
  if (!list.length) return <span className="pip pip-C" style={{ width: size, height: size }} />
  return (
    <span className="pips">
      {list.map((c, i) => (
        <span key={i} className={`pip pip-${c}`} style={{ width: size, height: size }} />
      ))}
    </span>
  )
}

const paths: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  meta: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  // crossed swords: one sword, then its mirror image
  game: (
    <>
      {[undefined, 'matrix(-1 0 0 1 24 0)'].map((tr, i) => (
        <g key={i} transform={tr}>
          <path d="M2.5 2.5l3 .9 10.9 10.9-2 2L3.4 5.5z" fill="currentColor" />
          <path d="M12.9 18.7q-.1-.7.5-1.1l4.2-4.2q.4-.6 1.1-.5M15.9 15.9l3.4 3.4" />
          <circle cx="20.2" cy="20.2" r=".9" />
        </g>
      ))}
    </>
  ),
  decks: (
    <>
      <rect x="6" y="3" width="13" height="17" rx="2" />
      <path d="M3 7v12a2 2 0 0 0 2 2h10" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  back: <path d="M15 18l-6-6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="15" r="1" fill="currentColor" />
      <circle cx="15" cy="9" r="1" fill="currentColor" />
      <circle cx="9" cy="15" r="1" fill="currentColor" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  crown: <path d="M3 18h18M4 8l4 4 4-7 4 7 4-4-2 10H6z" />,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.3-1-1.6-1-2.6 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="11" cy="7" r="1" />
      <circle cx="16" cy="8.5" r="1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  logout: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11" />,
  pie: <path d="M12 3a9 9 0 1 0 9 9h-9zM15 2.5A9 9 0 0 1 21.5 9H15z" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4" />,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  stats: <path d="M3 3v18h18M7 15l4-4 3 3 6-6" />,
}

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  )
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`

/** Winrate color: below 45% red, 45–55 neutral, above 55 green. */
export const wrClass = (v: number) => (v >= 0.55 ? 'wr-good' : v <= 0.45 ? 'wr-bad' : 'wr-mid')

// An open overlay owns one history entry, so the phone's back button closes it instead of leaving the page.
// Two layers: sheets, and dialogs that can open on top of a sheet. Each layer is counted module-wide, so a
// sheet replaced by another in the same render (or StrictMode's double effect) keeps the same entry.
type Layer = 'sheet' | 'dialog'
const open: Record<Layer, number> = { sheet: 0, dialog: 0 }
let popping = false

// drop the entries of layers that closed from inside (x, backdrop, an action), one step at a time
function settle() {
  if (popping) return
  const st = history.state
  if ((st?.dialog && !open.dialog) || (st?.sheet && !open.sheet)) {
    popping = true
    history.back()
  }
}
addEventListener('popstate', () => {
  popping = false
  setTimeout(settle)
})

export function useBackCloses(isOpen: boolean, onClose: () => void, layer: Layer = 'sheet') {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!isOpen) return
    open[layer]++
    if (!history.state?.[layer]) history.pushState({ ...history.state, [layer]: true }, '')
    // closed by the back button: our entry is gone (a dialog popping off a sheet leaves the sheet's)
    const onPop = () => {
      if (!history.state?.[layer]) close.current()
    }
    addEventListener('popstate', onPop)
    return () => {
      open[layer]--
      removeEventListener('popstate', onPop)
      setTimeout(settle)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useBackCloses(open, onClose)
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="sheet-head">
          <strong>{title}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
