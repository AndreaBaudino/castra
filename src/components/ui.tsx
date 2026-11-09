import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { symbolUrl } from '../lib/scryfall'

export function Pips({ colors, size = 12 }: { colors: string | string[]; size?: number }) {
  const list = typeof colors === 'string' ? colors.split('') : colors
  // mana symbols have inner detail: a few px more than the old flat dots keeps them readable
  const px = size + 4
  return (
    <span className="pips">
      {(list.length ? list : ['C']).map((c, i) => (
        <img key={i} src={symbolUrl(c)} alt="" width={px} height={px} />
      ))}
    </span>
  )
}

// crossed swords, points up: the front sword cuts a thin gap through the one behind it
const SWORD = (
  <>
    <rect x="10.9" y="-0.4" width="2.2" height="4.6" rx=".4" />
    <rect x="7.4" y="4" width="9.2" height="2.3" rx=".5" />
    <path d="M10.4 6.2H13.6V21.4L12.7 24.2 10.4 22.3Z" />
  </>
)
const swordAt = (deg: number) => `translate(12 12) rotate(${deg}) scale(1.08 -1.08) translate(-12 -12)`

function Swords() {
  const gap = useId()
  return (
    <g fill="currentColor" stroke="none">
      <mask id={gap} maskUnits="userSpaceOnUse" x="-4" y="-4" width="32" height="32">
        <rect x="-4" y="-4" width="32" height="32" fill="#fff" />
        <g transform={swordAt(-45)} fill="#000" stroke="#000" strokeWidth="2.8" strokeLinejoin="round">
          {SWORD}
        </g>
      </mask>
      <g mask={`url(#${gap})`}>
        <g transform={swordAt(45)}>{SWORD}</g>
      </g>
      <g transform={swordAt(-45)}>{SWORD}</g>
    </g>
  )
}

// filled counter icons with lines cut through them (a mask, so the panel's colour shows in the cuts)
function Cut({ shape, cuts, width = 1.6 }: { shape: string; cuts: string; width?: number }) {
  const id = useId()
  return (
    <g fill="currentColor" stroke="none">
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <path d={cuts} fill="none" stroke="#000" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <path d={shape} mask={`url(#${id})`} />
    </g>
  )
}

const paths: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  meta: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  // the game's counters (LifeCounter)
  cmd: <Cut shape="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" cuts="M12.5 3.5 10 9l3.2 3-2.4 4.8 1.2 3.4" />,
  tax: <path strokeWidth="2.5" d="M3 17l6-6 4 4 8-8M14 7h7v7" />,
  poison: (
    <g fill="currentColor" stroke="none" transform="scale(.012) translate(354 0)">
      <path fillRule="evenodd" d="M74 996a572 485 0 1 0 1144 0a572 485 0 1 0 -1144 0zM330 996a316 255 0 1 0 632 0a316 255 0 1 0 -632 0z" />
      <path d="M553 322 739 162V1678L553 1838z" />
    </g>
  ),
  energy: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  exp: <path d="M6 18l6-5 6 5M6 11l6-5 6 5" />,
  storm: (
    <Cut
      shape="M2 5.5C2 3.6 6.5 2.5 12 2.5s10 1.1 10 3c0 1-.8 1.6-1.6 2.2L14.5 16c-1 1.6-1.3 3.6-.5 5.5-2.5-1-4-3-4.2-5.6L3.6 7.7C2.6 7 2 6.4 2 5.5z"
      cuts="M5.5 5.2c2 .6 4 .8 6.5.8s4.5-.2 6.5-.8M7 10h9M9 13.2h5.5M11 16.3h2.5"
      width={1.5}
    />
  ),
  mana: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  screen: <path d="M3 4h18v13H3zM8 21h8M12 17v4" />,
  qr: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3h-3z" />,
  game: <Swords />,
  decks: (
    <>
      <rect x="6" y="3" width="13" height="17" rx="2" />
      <path d="M3 7v12a2 2 0 0 0 2 2h10" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
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
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />,
  door: <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M3 21h18M14 12h.01" />,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  // the card types, in the deck's bar (DeckDetail)
  creature: <path fill="currentColor" stroke="none" d="M12.5 22C15.3 20.1 18.1 17.5 20.4 14.7C21.6 13.2 23.1 10.9 22.9 10.7C22.9 10.6 21.1 11.7 19.8 12.6C16.5 15.1 13 18.9 11.2 21.9C10.4 23.3 10.4 23.3 12.5 22ZM3.6 20.3C8.6 16.5 14.5 10.8 18.7 5.7C20 4.1 21.9 1.5 21.8 1.5C21.7 1.4 19.9 2.8 18.3 4C12.8 8.4 5.2 16.3 2 20.9C1.2 22.1 1.2 22.1 3.6 20.3ZM2.8 12.3C5.6 10.4 8.4 7.8 10.7 5C11.9 3.5 13.4 1.2 13.3 1C13.2 0.9 11.4 2 10.2 2.9C6.8 5.4 3.3 9.2 1.5 12.3C0.7 13.6 0.7 13.6 2.8 12.3Z" />,
  planeswalker: <path fill="currentColor" stroke="none" d="M12.1 23C12.1 22.9 12.1 22.9 12.1 22.7C12.2 22.1 12.3 21.3 12.4 20.6C13.2 17.3 15 14.7 17.6 13.1C17.9 12.9 18.5 12.6 18.7 12.5L18.9 12.5L18.9 12.4C18.9 12.1 18.7 9.6 18.6 8C18.5 7.3 18.5 6.7 18.5 6.5C18.5 6.3 18.4 6.3 18.3 6.3C18.2 6.3 18.2 6.4 18.1 6.9C18 8.8 17.6 10.3 17.3 10.8L17.2 10.9L17.1 10.9C17 10.9 16.9 10.8 16.7 10.8L16.4 10.7L16.4 10.5C15.9 9.4 15.6 6.9 15.3 4C15.3 3.7 15.3 3.4 15.3 3.4C15.2 3.4 15.1 3.4 15.1 3.4C15 3.4 15 3.7 15 4C14.8 6.2 14.6 7.8 14.4 8.9C14.3 9.7 14.1 10.1 14.1 10.1C14 10.1 13.3 10.1 13.2 10L13.2 10L13.1 9.7C12.6 7.6 12.2 4.4 12.1 1.5L12.1 1L12.1 1C12 1 11.9 1 11.9 1.1C11.9 1.1 11.9 1.2 11.9 1.3C11.9 2.4 11.7 4.8 11.5 6.4C11.3 7.8 10.9 9.9 10.8 10C10.8 10 10 10.1 9.9 10.1C9.8 10.1 9.8 10.1 9.8 9.9C9.4 8.9 9.1 6.6 9 3.9C9 3.6 8.9 3.4 8.9 3.4C8.9 3.4 8.7 3.4 8.7 3.4C8.6 3.4 8.6 3.4 8.6 4.1C8.4 6.7 8.1 9.1 7.7 10.4C7.6 10.5 7.5 10.7 7.5 10.7C7.5 10.7 7.3 10.7 7.1 10.8C6.9 10.9 6.7 10.9 6.7 10.9C6.6 10.9 6.4 10.4 6.3 9.8C6.1 9.1 6 8.2 5.8 7C5.8 6.7 5.8 6.3 5.7 6.3C5.7 6.3 5.6 6.3 5.5 6.3C5.5 6.3 5.4 7 5.3 9.2C5.2 10.8 5.1 12.1 5.1 12.2L5.1 12.5L5.3 12.6C6.7 13.1 8.2 14.3 9.3 15.7C10.7 17.5 11.5 19.6 11.8 22.4C11.9 22.8 11.9 22.9 11.9 23C12 23 12 23 12.1 23Z" />,
  instant: <path fill="currentColor" stroke="none" d="M14 1 4 14h6.5L9 23 20 9.5h-6.8z" />,
  sorcery: <path fill="currentColor" stroke="none" d="M14.3 22.8C15.5 21.7 16.3 19.9 16.1 18.5C16 18 15.9 17.6 15.6 16.8C15.3 15.7 15.3 15.6 15.3 14.9C15.3 14.4 15.3 14.3 15.3 14C15.4 13.8 15.4 13.7 15.1 13.9C14.4 14.3 13.9 15.2 14 16.1L14 16.4L13.8 16.2C13.4 15.7 13.2 14.9 13.5 14.1C13.6 13.5 13.9 13 14.7 12C15 11.6 15.3 11.2 15.4 11.2C15.9 10.5 16 9.7 15.7 9.1C15.6 8.8 15.4 8.6 15.1 8.5C14.8 8.4 14.8 8.4 14.9 8.6C15.2 9 15.1 9.6 14.7 10C14.3 10.4 13.8 10.3 13.5 9.8C13.4 9.6 13.4 9.5 13.4 9.1C13.4 8.6 13.5 8.3 13.9 7.3C14.6 5.9 14.7 5 14.4 3.8C14.1 2.9 13.4 2 12.2 1.2C11.8 0.9 11.7 0.9 12 1.2C12.6 1.8 13 2.8 13.1 3.6C13.4 5.5 12.1 7.9 11.2 7.3C10.7 6.9 10.6 5.9 10.9 5C11 4.8 10.9 4.8 10.7 5C9.5 5.8 9.5 7.5 10.6 9.1C10.7 9.3 10.9 9.6 11.1 9.9C11.8 11 11.7 11.7 10.7 12.9C10.5 13.2 10.4 13.2 10.5 12.9C11.2 11.6 10.3 10 8.8 9.7L8.7 9.7L8.8 9.9C9.2 10.3 9.3 11.1 9 12C9 12.2 8.8 12.6 8.6 12.9C8.1 14.1 8 14.4 7.9 15C7.9 15.7 8.2 16.4 8.7 17C9.1 17.4 9.1 17.4 9.1 17.2C9.1 17 9.1 16.8 9.2 16.4C9.4 15.8 9.4 15.8 9.4 15.2C9.4 14.5 9.4 14.5 9.7 14.8C10 15.1 10 15.2 10 16.5C10 17.5 10 17.6 10.1 17.9C10.3 18.6 10.8 19.4 11.3 19.8C11.6 20 12 20.3 12.1 20.3C12.1 20.3 12.1 20.1 11.9 19.9C11.1 18.2 11 16.3 11.6 14.7C11.7 14.3 11.7 14.3 11.6 14.7C11.6 14.9 11.6 15.1 11.6 15.6C11.7 16.6 11.9 17.3 12.9 19C14.2 21.1 14.3 21.5 14 22.9C13.9 23.1 14 23 14.3 22.8Z" />,
  artifact: <path d="M5 3h14l-2 7a5 5 0 0 1-10 0zM12 15v4M8 21h8" />,
  enchantment: <path d="M5 20h14M8 20a4 4 0 0 1 8 0M6.4 17.9 1.7 16.2M8.6 15.1 4.5 9.4M12 14V4M15.4 15.1l4.1-5.7M17.6 17.9l4.7-1.7" />,
  land: <path d="M2 20 9 7l4 6 3-4 6 11z" />,
  prev2: <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />,
  next2: <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  calendar: <path d="M4 5h16v16H4zM4 10h16M8 3v4M16 3v4" />,
  pin: <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />,
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </>
  ),
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
  flag: <path d="M5 21V4h12l-2 4.5 2 4.5H5" />,
  mail: <path d="M3 6h18v12H3zM3 7l9 6 9-6" />,
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
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  alarm: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.5 2M4 4.5 6.5 2.5M20 4.5l-2.5-2M7 19.5 5.5 21.5M17 19.5l1.5 2" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 3.5v5h5M12 8v4.5l3 2" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="7" width="10" height="14" rx="1.5" transform="rotate(-8 8 14)" />
      <rect x="10" y="4" width="10" height="14" rx="1.5" transform="rotate(8 15 11)" />
    </>
  ),
  pie: <path d="M12 3a9 9 0 1 0 9 9h-9zM15 2.5A9 9 0 0 1 21.5 9H15z" />,
  // a card and how much it's played: the Circuit's Cards tab
  cardStats: (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <path d="M8 17v-3M12 17V9M16 17v-5" />
    </>
  ),
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4" />,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  userCheck: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M2 21a8 8 0 0 1 13-6.2M16 19l2 2 4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
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

/** Shares the page being shown: the phone's share menu, or the link copied where there is none. */
export function ShareButton({ text, onImage }: { text: string; onImage?: boolean }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = location.href
    if (navigator.share) return navigator.share({ title: 'Castra', text, url }).catch(() => {}) // closed: nothing to do
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <>
      <button className={`icon-btn ${onImage ? 'on-image' : ''}`} onClick={share} aria-label={t('share.label')}>
        <Icon name="share" />
      </button>
      {copied && <div className="toast">{t('share.copied')}</div>}
    </>
  )
}

/** A W-L-D record in a stat tile, kept on one line. */
export const RecNum = ({ text }: { text: string }) => (
  <div className="stat-num rec" style={{ '--n': text.length } as React.CSSProperties}>
    {text}
  </div>
)

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
// on a computer, Escape closes the top overlay, as the phone's back button does
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (open.sheet || open.dialog) && (history.state?.sheet || history.state?.dialog)) history.back()
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
