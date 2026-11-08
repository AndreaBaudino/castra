import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { type CardInfo, type Deck, deckCover } from '../lib/decks'
import { fetchArts, searchCards } from '../lib/scryfall'
import { Icon } from './ui'

// the phone's keyboard always opens upright at the bottom: the top player types on these keys, turned with the sheet
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

/** A card's art behind a player's life total, with the card's name for the game menu. */
export interface CardArt {
  name: string
  art: string
}

/** Picks the art behind a player's panel: one of the player's decks, any card, or none (the player's colour). */
export function ArtSheet({
  mine,
  up,
  value,
  decks,
  onPick,
  onClose,
}: {
  mine: boolean // the bottom player's, kept for the next games
  up?: boolean // turned towards the top player, who opened it from their panel
  value?: CardArt
  decks: Deck[]
  onPick: (a: CardArt | undefined) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CardInfo[]>([])
  const [arts, setArts] = useState<CardInfo[]>([])
  const [keys, setKeys] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    const id = setTimeout(() => {
      searchCards(q, ctrl.signal)
        .then((r) => setResults(r.filter((c) => c.art).slice(0, 12)))
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [q])

  // the other illustrations of the chosen card (none for a deck's name)
  useEffect(() => {
    const ctrl = new AbortController()
    setArts([])
    if (value) fetchArts(value.name, ctrl.signal).then((r) => setArts(r.filter((c) => c.art))).catch(() => {})
    return () => ctrl.abort()
  }, [value?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // the decks are the phone owner's: no use for the opponent
  const covers = !mine ? [] : decks.flatMap((d) => {
    const art = deckCover(d)
    return art ? [{ name: d.name, art }] : []
  })
  const grid = (list: CardArt[]) => (
    <div className="art-grid">
      {list.map((c) => (
        <button
          key={c.art}
          className={`art-pick ${value?.art === c.art ? 'on' : ''}`}
          style={{ backgroundImage: `url("${c.art}")` }}
          onClick={() => onPick(c)}
          aria-label={c.name}
        >
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  )
  const asArt = (cs: CardInfo[]) => cs.map((c) => ({ name: c.name, art: c.art! }))

  return (
    <div className="roll-overlay dim" onClick={onClose}>
      <div className={`reset-card ${up ? 'up' : ''}`} onClick={(e) => e.stopPropagation()}>
        <strong>{t(mine ? 'life.artMine' : 'life.artOpp')}</strong>
        <p className="muted small no-margin">{t(mine ? 'life.artMineHint' : 'life.artOppHint')}</p>
        <div className="chips">
          <button className={`chip ${value ? '' : 'on'}`} onClick={() => onPick(undefined)}>
            {t('life.artColor')}
          </button>
          {value && <span className="chip on ellipsis">{value.name}</span>}
        </div>
        {arts.length > 1 && (
          <>
            <div className="menu-section">{t('life.artPrints')}</div>
            {grid(asArt(arts))}
          </>
        )}
        {covers.length > 0 && (
          <>
            <div className="menu-section">{t('life.artDecks')}</div>
            {grid(covers)}
          </>
        )}
        <div className="search">
          <Icon name="search" size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('player.coverSearch')}
            readOnly={up}
            onClick={() => up && setKeys(true)}
          />
        </div>
        {up && keys && (
          <div className="keypad">
            {ROWS.map((r) => (
              <div key={r}>
                {[...r].map((k) => (
                  <button key={k} onClick={() => setQ(q + k.toLowerCase())}>
                    {k}
                  </button>
                ))}
              </div>
            ))}
            <div>
              <button className="wide" onClick={() => setQ(q + ' ')} aria-label={t('life.keySpace')} />
              <button onClick={() => setQ(q.slice(0, -1))} aria-label={t('life.keyDel')}>
                <Icon name="back" size={18} />
              </button>
            </div>
          </div>
        )}
        {results.length > 0 && grid(asArt(results))}
        <button className="btn ghost" onClick={onClose}>
          {t('life.close')}
        </button>
      </div>
    </div>
  )
}
