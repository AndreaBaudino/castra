import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type Deck, type DeckCard, GROUP_ORDER, type Group, groupOf } from '../lib/decks'
import { COLORS, CURVE_MAX, colorsOf, curveOf, onCurve, summaryOf } from '../lib/analysis'
import { pct } from './ui'

// The deck page's analysis: summary numbers, a mana curve split into permanents and spells (tap a bar for its
// cards and the chance of casting one on curve), and coloured symbols against the lands that make them.

const fmt = (n: number, lang: string) => n.toLocaleString(lang, { maximumFractionDigits: 2 })

export function DeckAnalysis({
  deck,
  identity,
  groupLabel,
  onOpen,
}: {
  deck: Deck
  /** the commanders' colours: other colours are left out of the colour analysis */
  identity: string[]
  groupLabel: (g: Group) => string
  onOpen: (c: DeckCard) => void
}) {
  const { t, lang } = useI18n()
  const [sel, setSel] = useState<number | null>(null)
  const bars = useMemo(() => curveOf(deck), [deck])
  const sum = useMemo(() => summaryOf(deck), [deck])
  const colors = useMemo(() => colorsOf(deck), [deck])
  const max = Math.max(...bars.map((b) => b.count), 1)
  const bar = sel !== null ? bars[sel] : null
  const odds = bar && bar.count ? onCurve(deck, bar) : null
  const qty = (cs: DeckCard[]) => cs.reduce((s, c) => s + c.qty, 0)
  // the commanders' colours, plus colourless when the deck asks for it or makes it
  const shown = colors.stats.filter((c) =>
    c.color === 'C' ? c.symbols || c.lands : identity.length ? identity.includes(c.color) : c.symbols > 0,
  )

  // the selected bar's cards, by type
  const groups = useMemo(() => {
    if (!bar) return []
    const g = new Map<Group, DeckCard[]>()
    for (const c of [...bar.permanents, ...bar.spells]) g.set(groupOf(c), [...(g.get(groupOf(c)) ?? []), c])
    return GROUP_ORDER.filter((k) => g.has(k)).map((k) => [k, g.get(k)!.sort((a, b) => a.name.localeCompare(b.name))] as const)
  }, [bar])

  return (
    <>
      <p className="muted small no-margin">
        {t('analysis.summary', {
          avg: fmt(sum.avgNoLands, lang),
          avgAll: fmt(sum.avg, lang),
          med: fmt(sum.medianNoLands, lang),
          lands: sum.lands,
          total: sum.total,
        })}
      </p>

      <div className="curve-head">
        <span className="curve-title muted small">{t('deck.curve')}</span>
        <span className="legend small">
          <span className="key perm" /> {t('analysis.permanents')}
          <span className="key spell" /> {t('analysis.spells')}
        </span>
      </div>
      <div className={`curve ${bar ? 'has-sel' : ''}`} role="group" aria-label={t('deck.curve')}>
        {bars.map((b) => (
          <button
            key={b.mv}
            className={`curve-col ${sel === b.mv ? 'sel' : ''}`}
            onClick={() => setSel(sel === b.mv ? null : b.mv)}
            disabled={!b.count}
            aria-pressed={sel === b.mv}
            aria-label={t('analysis.barLabel', { n: b.count, mv: b.mv })}
          >
            <span className="curve-v">{b.count || ''}</span>
            <span className="curve-stack" style={{ height: `${(b.count / max) * 100}%` }}>
              {b.spells.length > 0 && <span className="seg-spell" style={{ flexGrow: qty(b.spells) }} />}
              {b.permanents.length > 0 && <span className="seg-perm" style={{ flexGrow: qty(b.permanents) }} />}
            </span>
            <span className="curve-x">{b.mv === CURVE_MAX ? `${CURVE_MAX}+` : b.mv}</span>
          </button>
        ))}
      </div>

      {!bar ? (
        <p className="muted small center no-margin">{t('analysis.tapHint')}</p>
      ) : (
        <div className="curve-detail">
          <div className="small">
            <b>{t('analysis.costN', { mv: bar.mv === CURVE_MAX ? `${CURVE_MAX}+` : bar.mv })}</b> ·{' '}
            {t(qty(bar.permanents) === 1 ? 'analysis.perm1' : 'analysis.perms', { n: qty(bar.permanents) })},{' '}
            {t(qty(bar.spells) === 1 ? 'analysis.spell1' : 'analysis.spellsN', { n: qty(bar.spells) })}
          </div>
          {odds && (
            <table className="odds small">
              <thead>
                <tr>
                  <th />
                  <th>OTP</th>
                  <th>OTD</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('analysis.oneBy', { turn: odds.turn })}</td>
                  <td>{pct(odds.play.card, 0)}</td>
                  <td>{pct(odds.draw.card, 0)}</td>
                </tr>
                {bar.mv > 0 && (
                  <tr>
                    <td>{t(bar.mv === 1 ? 'analysis.land1' : 'analysis.landsBy', { n: bar.mv, turn: odds.turn })}</td>
                    <td>{pct(odds.play.lands, 0)}</td>
                    <td>{pct(odds.draw.lands, 0)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {groups.map(([g, cards]) => (
            <div key={g} className="curve-group">
              <div className="muted small">
                {groupLabel(g)} ({qty(cards)})
              </div>
              {cards.map((c) => (
                <button key={`${c.name}|${c.section}`} className="curve-card" onClick={() => onOpen(c)}>
                  <span className="qty">{c.qty}</span>
                  <span className="ellipsis">{c.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {shown.length > 0 && (
        <>
          <div className="curve-title muted small">{t('analysis.colors')}</div>
          <div className="color-stats">
            {COLORS.filter((k) => shown.some((s) => s.color === k)).map((k) => {
              const s = colors.stats.find((x) => x.color === k)!
              return (
                <div key={k} className="color-stat">
                  <span className={`pip pip-${k}`} style={{ width: 18, height: 18 }} />
                  <div className="color-bars">
                    <div className="color-line">
                      <span className="muted small">{t('analysis.symbols')}</span>
                      <span className="meter">
                        <span className={`fill pip-${k}`} style={{ width: `${s.symbolShare * 100}%` }} />
                      </span>
                      <b className="small">{pct(s.symbolShare, 0)}</b>
                    </div>
                    <div className="color-line">
                      <span className="muted small">{t('analysis.lands')}</span>
                      <span className="meter">
                        <span className={`fill pip-${k}`} style={{ width: `${s.landShare * 100}%` }} />
                      </span>
                      <b className="small">{pct(s.landShare, 0)}</b>
                    </div>
                    <div className="muted small">
                      {t('analysis.sources', { l: s.lands, n: colors.landCount })}
                      {s.others > 0 && ` · ${t('analysis.otherSources', { n: s.others })}`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="muted small no-margin">{colors.unknown ? t('analysis.loadingSources') : t('analysis.colorsNote')}</p>
        </>
      )}
    </>
  )
}
