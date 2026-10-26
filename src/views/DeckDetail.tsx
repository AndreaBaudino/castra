import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import {
  type Deck,
  type DeckCard,
  type Group,
  GROUP_ORDER,
  checkDeck,
  exportDecklist,
  groupOf,
  isValid,
  sortColors,
} from '../lib/decks'
import { type MetaDeck, findMetaDeck, winrate } from '../lib/meta'
import { type Match, fmtRecord, record } from '../lib/matches'
import { autocomplete, fetchNamed } from '../lib/scryfall'
import { Icon, Pips, Sheet, pct, wrClass } from '../components/ui'
import { commanderNames } from './Decks'

const GROUP_KEY: Record<Group, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  commander: 'deck.commander',
  creatures: 'deck.creatures',
  planeswalkers: 'deck.planeswalkers',
  instants: 'deck.instants',
  sorceries: 'deck.sorceries',
  artifacts: 'deck.artifacts',
  enchantments: 'deck.enchantments',
  battles: 'deck.battles',
  lands: 'deck.lands',
  other: 'deck.other',
  sideboard: 'deck.sideboard',
}

function ManaCost({ cost }: { cost: string }) {
  const symbols = cost.match(/\{[^}]+\}/g) ?? []
  return (
    <span className="mana">
      {symbols.slice(0, 7).map((s, i) => {
        const v = s.slice(1, -1).replace('/', '')
        const cls = /^[WUBRGC]$/.test(v) ? `pip-${v}` : 'pip-N'
        return (
          <span key={i} className={`mana-sym ${cls}`}>
            {/^[WUBRGC]$/.test(v) ? '' : v.length > 2 ? '•' : v}
          </span>
        )
      })}
    </span>
  )
}

function AddCard({ onAdd }: { onAdd: (name: string) => void }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState<string[]>([])
  useEffect(() => {
    const ctrl = new AbortController()
    const id = setTimeout(() => autocomplete(q, ctrl.signal).then(setOpts).catch(() => {}), 220)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [q])
  return (
    <div className="add-card">
      <div className="search">
        <Icon name="plus" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('deck.addCard')} />
      </div>
      {opts.length > 0 && q && (
        <ul className="ac-list">
          {opts.map((o) => (
            <li key={o}>
              <button
                onClick={() => {
                  onAdd(o)
                  setQ('')
                  setOpts([])
                }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DeckDetail({
  deck,
  metaDecks,
  matches,
  onChange,
  onDelete,
  onBack,
}: {
  deck: Deck
  metaDecks: MetaDeck[]
  matches: Match[]
  onChange: (d: Deck) => void
  onDelete: () => void
  onBack: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<DeckCard | null>(null)
  const [toast, setToast] = useState('')
  const check = useMemo(() => checkDeck(deck), [deck])
  const meta = findMetaDeck(metaDecks, commanderNames(deck))
  const art = check.commanders[0]?.info?.art
  const mine = record(matches.filter((m) => m.deckId === deck.id))

  const groups = useMemo(() => {
    const g = new Map<Group, DeckCard[]>()
    for (const c of deck.cards) {
      const k = groupOf(c)
      g.set(k, [...(g.get(k) ?? []), c])
    }
    for (const list of g.values()) list.sort((a, b) => (a.info?.cmc ?? 0) - (b.info?.cmc ?? 0) || a.name.localeCompare(b.name))
    return GROUP_ORDER.filter((k) => g.has(k)).map((k) => [k, g.get(k)!] as const)
  }, [deck.cards])

  const curve = useMemo(() => {
    const buckets = Array(8).fill(0) as number[]
    for (const c of deck.cards) {
      if (c.section !== 'main' || groupOf(c) === 'lands') continue
      buckets[Math.min(7, Math.floor(c.info?.cmc ?? 0))] += c.qty
    }
    return buckets
  }, [deck.cards])
  const maxCurve = Math.max(...curve, 1)

  const save = (patch: Partial<Deck>) => onChange({ ...deck, ...patch, updatedAt: new Date().toISOString() })
  const setCards = (fn: (cs: DeckCard[]) => DeckCard[]) => save({ cards: fn(deck.cards) })
  const same = (a: DeckCard, b: DeckCard) => a.name === b.name && a.section === b.section

  const changeQty = (c: DeckCard, d: number) =>
    setCards((cs) => cs.map((x) => (same(x, c) ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0))
  const moveTo = (c: DeckCard, section: DeckCard['section']) => {
    setCards((cs) => cs.map((x) => (same(x, c) ? { ...x, section } : x)))
    setSelected(null)
  }
  const remove = (c: DeckCard) => {
    setCards((cs) => cs.filter((x) => !same(x, c)))
    setSelected(null)
  }
  const add = async (name: string) => {
    const existing = deck.cards.find((c) => c.name === name && c.section === 'main')
    if (existing) return changeQty(existing, 1)
    const info = await fetchNamed(name)
    setCards((cs) => [...cs, { name, qty: 1, section: 'main', info }])
  }

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1600)
  }

  return (
    <div className="page deck-page">
      <div className="deck-hero" style={art ? { backgroundImage: `url(${art})` } : undefined}>
        <div className="deck-hero-shade" />
        <div className="deck-hero-top">
          <button className="icon-btn on-image" onClick={onBack} aria-label={t('deck.back')}>
            <Icon name="back" />
          </button>
          <button className="icon-btn on-image" onClick={() => setEditing((e) => !e)}>
            {editing ? <span className="small strong">{t('deck.done')}</span> : <Icon name="edit" />}
          </button>
        </div>
        <div className="deck-hero-body">
          <h1 className="ellipsis">{deck.name}</h1>
          <div className="sub-line">
            <Pips colors={sortColors(check.identity)} size={12} />
            <span className="small">{commanderNames(deck).join(' + ') || '—'}</span>
          </div>
        </div>
      </div>

      {editing && (
        <section className="card form">
          <label>
            <span>{t('deck.rename')}</span>
            <input value={deck.name} onChange={(e) => save({ name: e.target.value })} />
          </label>
          <label>
            <span>{t('decks.tags')}</span>
            <input
              defaultValue={deck.tags.join(', ')}
              onBlur={(e) =>
                save({
                  tags: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            <span>{t('deck.notes')}</span>
            <textarea rows={3} value={deck.notes} onChange={(e) => save({ notes: e.target.value })} />
          </label>
          <AddCard onAdd={add} />
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(t('deck.deleteConfirm'))) onDelete()
            }}
          >
            <Icon name="trash" size={16} /> {t('deck.delete')}
          </button>
        </section>
      )}

      <section className="card">
        <div className={`check ${isValid(check) ? 'ok' : 'bad'}`}>
          <Icon name="shield" size={16} />
          <div>
            {isValid(check) ? (
              t('deck.check.ok')
            ) : (
              <>
                {check.count !== 100 && <div>{t('deck.check.count', { n: check.count })}</div>}
                {!check.commanders.length && <div>{t('deck.check.noCommander')}</div>}
                {check.duplicates.length > 0 && <div>{t('deck.check.singleton', { cards: check.duplicates.join(', ') })}</div>}
                {check.offIdentity.length > 0 && <div>{t('deck.check.identity', { cards: check.offIdentity.join(', ') })}</div>}
              </>
            )}
          </div>
        </div>
        {meta && (
          <div className="kv">
            <span>{t('deck.metaWr')}</span>
            <b className={wrClass(winrate(meta))}>
              {pct(winrate(meta))} <span className="muted small">({meta.games})</span>
            </b>
          </div>
        )}
        {mine.games > 0 && (
          <div className="kv">
            <span>{t('stats.mine')}</span>
            <b className={wrClass(mine.wr)}>
              {pct(mine.wr)} <span className="muted small">({fmtRecord(mine)})</span>
            </b>
          </div>
        )}
        <div className="curve-title muted small">{t('deck.curve')}</div>
        <div className="curve">
          {curve.map((v, i) => (
            <div key={i} className="curve-col">
              <span className="curve-v">{v || ''}</span>
              <span className="curve-bar" style={{ height: `${(v / maxCurve) * 100}%` }} />
              <span className="curve-x">{i === 7 ? '7+' : i}</span>
            </div>
          ))}
        </div>
        {deck.notes && !editing && <p className="summary-text">{deck.notes}</p>}
        <button
          className="btn ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(exportDecklist(deck))
              flash(t('deck.copied'))
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          <Icon name="copy" size={16} /> {t('deck.export')}
        </button>
      </section>

      {groups.map(([g, cards]) => (
        <section key={g} className="group">
          <div className="group-title">
            {t(GROUP_KEY[g])} <span className="muted">{cards.reduce((s, c) => s + c.qty, 0)}</span>
          </div>
          <ul className="card-list">
            {cards.map((c) => (
              <li key={c.section + c.name} className="card-row">
                <button className="card-row-main" onClick={() => setSelected(c)}>
                  <span className="qty">{c.qty}</span>
                  <span className={`ellipsis ${c.info ? '' : 'warn-text'}`}>{c.name}</span>
                  {c.info && <ManaCost cost={c.info.manaCost} />}
                </button>
                {editing && (
                  <span className="qty-ctrl">
                    <button onClick={() => changeQty(c, -1)} aria-label="-">
                      <Icon name="minus" size={14} />
                    </button>
                    <button onClick={() => changeQty(c, 1)} aria-label="+">
                      <Icon name="plus" size={14} />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <div className="card-preview">
            {selected.info?.image && <img src={selected.info.image} alt={selected.name} loading="lazy" />}
            <div className="muted small">{selected.info?.typeLine}</div>
            <div className="btn-row">
              {selected.section !== 'commander' ? (
                <button className="btn ghost" onClick={() => moveTo(selected, 'commander')}>
                  <Icon name="crown" size={16} /> {t('deck.setCommander')}
                </button>
              ) : (
                <button className="btn ghost" onClick={() => moveTo(selected, 'main')}>
                  {t('deck.unsetCommander')}
                </button>
              )}
              {selected.section === 'side' ? (
                <button className="btn ghost" onClick={() => moveTo(selected, 'main')}>
                  <Icon name="swap" size={16} /> {t('deck.toMain')}
                </button>
              ) : (
                <button className="btn ghost" onClick={() => moveTo(selected, 'side')}>
                  <Icon name="swap" size={16} /> {t('deck.toSideboard')}
                </button>
              )}
              <button className="btn danger" onClick={() => remove(selected)}>
                <Icon name="trash" size={16} /> {t('deck.remove')}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
