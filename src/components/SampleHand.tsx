import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { Deck, DeckCard } from '../lib/decks'
import { Icon, Sheet } from './ui'

// Sample hand: shuffle the 99, draw 7, mulligan (London: draw 7 again, then put one card on the bottom per
// mulligan) and draw on.

const HAND = 7

function shuffled(deck: Deck): DeckCard[] {
  const lib = deck.cards.filter((c) => c.section === 'main').flatMap((c) => Array<DeckCard>(c.qty).fill(c))
  for (let i = lib.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[lib[i], lib[j]] = [lib[j], lib[i]]
  }
  return lib
}

export function SampleHand({ open, onClose, deck }: { open: boolean; onClose: () => void; deck: Deck }) {
  const { t } = useI18n()
  const [lib, setLib] = useState<DeckCard[]>([])
  const [drawn, setDrawn] = useState(HAND)
  const [mulligans, setMulligans] = useState(0)
  const [zoom, setZoom] = useState<DeckCard | null>(null)

  const deal = (mull: number) => {
    setLib(shuffled(deck))
    setDrawn(HAND)
    setMulligans(mull)
    setZoom(null)
  }
  useEffect(() => {
    if (open) deal(0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const hand = lib.slice(0, drawn)
  const lands = hand.slice(0, HAND).filter((c) => /land/i.test((c.info?.typeLine ?? '').split('//')[0])).length

  return (
    <Sheet open={open} onClose={onClose} title={t('hand.title')}>
      <div className="form">
        {lib.length < HAND ? (
          <p className="muted small no-margin">{t('hand.tooFew')}</p>
        ) : (
          <>
            <div className="hand-info muted small">
              <span>{t('hand.lands', { n: lands })}</span>
              {mulligans > 0 && <span className="warn-text">{mulligans === 1 ? t('hand.bottom1') : t('hand.bottom', { n: mulligans })}</span>}
              {drawn > HAND && <span>{drawn - HAND === 1 ? t('hand.draw1') : t('hand.draws', { n: drawn - HAND })}</span>}
            </div>
            <div className="hand-grid">
              {hand.map((c, i) => (
                <button key={i} className={`card-img ${i >= HAND ? 'drawn' : ''}`} onClick={() => setZoom(c)} aria-label={c.name}>
                  {c.info?.image ? <img src={c.info.image} alt={c.name} /> : <span className="card-ph">{c.name}</span>}
                </button>
              ))}
            </div>
            {zoom?.info?.image && (
              <button className="hand-zoom" onClick={() => setZoom(null)} aria-label={t('life.close')}>
                <img src={zoom.info.image} alt={zoom.name} />
              </button>
            )}
            <div className="btn-pair">
              <button className="btn ghost" onClick={() => deal(mulligans + 1)} disabled={mulligans >= HAND - 1}>
                {t('hand.mulligan')}
              </button>
              <button className="btn ghost" onClick={() => setDrawn((d) => d + 1)} disabled={drawn >= lib.length}>
                <Icon name="plus" size={16} /> {t('hand.draw')}
              </button>
            </div>
            <button className="btn primary" onClick={() => deal(0)}>
              <Icon name="refresh" size={16} /> {t('hand.new')}
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
