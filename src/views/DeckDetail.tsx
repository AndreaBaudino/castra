import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import {
  type CardInfo,
  type Deck,
  type DeckCard,
  type DeckChange,
  type DeckCheck,
  type DeckView,
  type Group,
  type Visibility,
  GROUP_ORDER,
  cardKey,
  checkDeck,
  deckCover,
  exportDecklist,
  groupOf,
  isValid,
  sortColors,
  logChange,
  loadShared,
  newId,
  parseDecklist,
} from '../lib/decks'
import { loadPrivate, ranking, tournamentTitle, useTournament } from '../lib/tournaments'
import { placeLabel } from './Circuit'
import { type MetaDataset, type MetaDeck, findMetaDeck, nickName, winrate } from '../lib/meta'
import { type Match, fmtRecord, record } from '../lib/matches'
import { fetchCollection, fetchPrints, requestKey, searchCards, symbolUrl } from '../lib/scryfall'
import { Icon, Pips, Sheet, pct, wrClass } from '../components/ui'
import { commanderNames } from './Decks'
import { useDialog } from '../components/Dialog'
import { isBanned, useBanlist } from '../lib/banlist'
import { SampleHand } from '../components/SampleHand'
import { DeckAnalysis } from '../components/DeckAnalysis'
import { summaryOf } from '../lib/analysis'
import { CardDetails } from './Cards'
import { useAuth } from '../lib/auth'
import { DeckVsMeta } from './MetaCards'

type TKey = Parameters<ReturnType<typeof useI18n>['t']>[0]

const GROUP_KEY: Record<Group, TKey> = {
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

const VIEW_KEY: Record<DeckView, TKey> = { list: 'deck.view.list', pile: 'deck.view.pile', grid: 'deck.view.grid' }
const VISIBILITIES: Visibility[] = ['private', 'unlisted', 'public']

/** Who made the deck: the account's name, and its picture and circuit page when it claimed a player. */
export interface Author {
  name: string
  photo?: string | null
  open?: () => void
}

function ManaCost({ cost }: { cost: string }) {
  return (
    <span className="mana">
      {(cost.match(/\{[^}]+\}/g) ?? []).slice(0, 7).map((sym, i) => (
        <img key={i} src={symbolUrl(sym)} alt={sym} width={16} height={16} />
      ))}
    </span>
  )
}

/** Card image, or a framed placeholder with the name when Scryfall had no match. */
function CardImage({ card, onClick }: { card: DeckCard; onClick: () => void }) {
  return (
    <button className="card-img" onClick={onClick} aria-label={card.name}>
      {card.info?.image ? (
        <img src={card.info.image} alt={card.name} loading="lazy" />
      ) : (
        <span className="card-ph">{card.name}</span>
      )}
      {card.qty > 1 && <span className="qty-badge">×{card.qty}</span>}
    </button>
  )
}

function AddCardsSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (c: CardInfo) => void }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CardInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!open) {
      setQ('')
      setResults([])
      setAdded({})
    }
  }, [open])

  useEffect(() => {
    const ctrl = new AbortController()
    const id = setTimeout(() => {
      setLoading(true)
      searchCards(q, ctrl.signal)
        .then(setResults)
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 300)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [q])

  return (
    <Sheet open={open} onClose={onClose} title={t('deck.addCards')}>
      <div className="search sticky-search">
        <Icon name="search" size={18} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('deck.searchCards')} />
      </div>
      {loading && <div className="muted small center pad">…</div>}
      {!loading && q.trim().length >= 2 && !results.length && <div className="muted small center pad">{t('meta.noResults')}</div>}
      <div className="result-grid">
        {results.map((c) => (
          <button
            key={c.id}
            className="result"
            onClick={() => {
              onAdd(c)
              setAdded((a) => ({ ...a, [c.id]: (a[c.id] ?? 0) + 1 }))
            }}
          >
            {c.image ? <img src={c.image} alt={c.name} loading="lazy" /> : <span className="card-ph">{c.name}</span>}
            {added[c.id] ? <span className="qty-badge added">+{added[c.id]}</span> : <span className="add-badge">+</span>}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function PrintsPicker({ name, current, onPick }: { name: string; current?: string; onPick: (c: CardInfo) => void }) {
  const { t } = useI18n()
  const [prints, setPrints] = useState<CardInfo[] | null>(null)
  useEffect(() => {
    fetchPrints(name)
      .then(setPrints)
      .catch(() => setPrints([]))
  }, [name])
  if (!prints) return <div className="muted small center pad">{t('deck.loadingPrints')}</div>
  return (
    <div className="result-grid prints">
      {prints.map((p) => (
        <button key={p.id} className={`result ${p.id === current ? 'on' : ''}`} onClick={() => onPick(p)}>
          {p.image ? <img src={p.image} alt={p.setName} loading="lazy" /> : <span className="card-ph">{p.setName}</span>}
          <span className="print-label">
            {p.set?.toUpperCase()} · {p.cn}
          </span>
        </button>
      ))}
    </div>
  )
}

/** The cards that went in and out, one line per day: closed until needed, like the stats. */
function DeckHistory({ history }: { history: DeckChange[] }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  const names = (cards: [string, number][]) => cards.map(([n, d]) => (Math.abs(d) > 1 ? `${Math.abs(d)} ${n}` : n)).join(', ')
  return (
    <section className={`card collapsible ${open ? 'open' : ''}`}>
      <button className="collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="card-title">{t('deck.history')}</span>
        {!open && <span className="muted small ellipsis collapse-sum">{t('deck.historyLast', { d: day(history[0].at) })}</span>}
        <span className="chev">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open &&
        history.map((h) => {
          const all = Object.entries(h.cards).sort((a, b) => a[0].localeCompare(b[0]))
          const [ins, outs] = [all.filter(([, d]) => d > 0), all.filter(([, d]) => d < 0)]
          return (
            <div key={h.at} className="deck-change">
              <div className="muted small">{day(h.at)}</div>
              {ins.length > 0 && (
                <div>
                  <b className="good-text">{t('deck.in')}</b> {names(ins)}
                </div>
              )}
              {outs.length > 0 && (
                <div>
                  <b className="bad-text">{t('deck.out')}</b> {names(outs)}
                </div>
              )}
            </div>
          )
        })}
    </section>
  )
}

export default function DeckDetail({
  deck,
  metaDecks,
  matches,
  onChange,
  onDelete,
  onDuplicate,
  onBack,
  openCommander,
  openCard,
  dataset,
  author,
  readOnly,
  extra,
}: {
  deck: Deck
  metaDecks: MetaDeck[]
  dataset?: MetaDataset | null
  openCard?: (name: string) => void
  matches: Match[]
  onChange: (d: Deck) => void // someone else's deck: only on this screen (the view, the cards' missing data)
  onDelete: () => void
  onDuplicate: () => void
  onBack: () => void
  openCommander: (name: string) => void
  author?: Author
  readOnly?: boolean // someone else's deck, opened from its link
  extra?: ReactNode // under the cover: what a tournament's list adds
}) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  const { user } = useAuth()
  const [editing, setEditing] = useState(!readOnly && !deck.cards.length) // a deck made from scratch opens ready to fill
  const [sharing, setSharing] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [choosingPrint, setChoosingPrint] = useState(false)
  const [reading, setReading] = useState(false) // the card's Oracle text, errata and rulings, in place of its actions
  const [adding, setAdding] = useState(false)
  const [choosingCover, setChoosingCover] = useState(false)
  const [hand, setHand] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  useEffect(() => setStatsOpen(false), [deck.id])
  const [toast, setToast] = useState('')
  const banlist = useBanlist()
  const check = useMemo(() => checkDeck(deck), [deck, banlist]) // eslint-disable-line react-hooks/exhaustive-deps
  const meta = findMetaDeck(metaDecks, commanderNames(deck))
  const art = deckCover(deck)
  const mine = record(matches.filter((m) => m.deckId === deck.id))
  const statsLine = useMemo(() => {
    const s = summaryOf(deck)
    return [
      t('deck.statsAvg', { n: s.avgNoLands.toLocaleString(lang, { maximumFractionDigits: 2 }) }),
      t('deck.statsLands', { n: s.lands }),
      ...(mine.games ? [t('deck.statsWr', { wr: pct(mine.wr, 0) })] : []),
    ].join(' · ')
  }, [deck, lang, mine.games, mine.wr]) // eslint-disable-line react-hooks/exhaustive-deps
  const view = deck.view ?? 'list'
  const selected = selectedKey ? deck.cards.find((c) => cardKey(c) === selectedKey) : undefined

  const groups = useMemo(() => {
    const g = new Map<Group, DeckCard[]>()
    for (const c of deck.cards) {
      const k = groupOf(c)
      g.set(k, [...(g.get(k) ?? []), c])
    }
    for (const list of g.values()) list.sort((a, b) => (a.info?.cmc ?? 0) - (b.info?.cmc ?? 0) || a.name.localeCompare(b.name))
    return GROUP_ORDER.filter((k) => g.has(k)).map((k) => [k, g.get(k)!] as const)
  }, [deck.cards])


  const save = (patch: Partial<Deck>) =>
    onChange({
      ...deck,
      ...patch,
      ...(patch.cards && { history: logChange(deck.history, deck.cards, patch.cards) }),
      updatedAt: new Date().toISOString(),
    })
  const setCards = (fn: (cs: DeckCard[]) => DeckCard[]) => save({ cards: fn(deck.cards) })
  const same = (a: DeckCard, b: DeckCard) => cardKey(a) === cardKey(b)

  // cards fetched before the analysis existed lack the mana they produce: fetch it once, quietly
  const latest = useRef(deck)
  latest.current = deck
  useEffect(() => {
    const req = (c: DeckCard) => ({ name: c.name, set: c.info?.set, cn: c.info?.cn })
    const missing = deck.cards.filter((c) => c.info && c.info.produced === undefined)
    if (!missing.length) return
    let cancelled = false
    fetchCollection(missing.map(req))
      .then(({ found }) => {
        if (cancelled) return
        const d = latest.current
        onChange({
          ...d,
          cards: d.cards.map((c) =>
            c.info && c.info.produced === undefined ? { ...c, info: { ...c.info, produced: found.get(requestKey(req(c)))?.produced ?? [] } } : c,
          ),
        })
      })
      .catch(() => {}) // offline: try again next time
    return () => {
      cancelled = true
    }
  }, [deck.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1600)
  }

  const changeQty = (c: DeckCard, d: number) =>
    setCards((cs) => cs.map((x) => (same(x, c) ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0))
  const moveTo = (c: DeckCard, section: DeckCard['section']) => {
    if (deck.cards.some((x) => x.section === section && x.name === c.name)) return
    setCards((cs) => cs.map((x) => (same(x, c) ? { ...x, section } : x)))
    setSelectedKey(cardKey({ name: c.name, section }))
  }
  const remove = (c: DeckCard) => {
    setCards((cs) => cs.filter((x) => !same(x, c)))
    setSelectedKey(null)
  }
  const add = (info: CardInfo) => {
    const existing = deck.cards.find((c) => c.name === info.name && c.section === 'main')
    if (existing) changeQty(existing, 1)
    else setCards((cs) => [...cs, { name: info.name, qty: 1, section: 'main', set: info.set, cn: info.cn, info }])
    flash(`${t('deck.added')}: ${info.name}`)
  }
  const setPrint = (c: DeckCard, info: CardInfo) => {
    setCards((cs) => cs.map((x) => (x.name === c.name ? { ...x, info, set: info.set, cn: info.cn } : x)))
    setChoosingPrint(false)
  }
  const open = (c: DeckCard) => {
    setChoosingPrint(false)
    setReading(false)
    setSelectedKey(cardKey(c))
  }

  const coverCandidates = useMemo(() => {
    const seen = new Set<string>()
    return deck.cards.filter((c) => c.info?.art && !seen.has(c.name) && seen.add(c.name))
  }, [deck.cards])

  return (
    <div className="page deck-page">
      <div className="deck-hero" style={art ? { backgroundImage: `url(${art})` } : undefined}>
        <div className="deck-hero-shade" />
        <div className="deck-hero-top">
          <button className="icon-btn on-image" onClick={onBack} aria-label={t('deck.back')}>
            <Icon name="back" />
          </button>
          {!readOnly && (
            <div className="hero-actions">
              <button className="icon-btn on-image" onClick={() => setSharing(true)} aria-label={t('deck.share')}>
                <Icon name="share" />
              </button>
              <button className="icon-btn on-image" onClick={() => setChoosingCover(true)} aria-label={t('deck.chooseCover')}>
                <Icon name="image" />
              </button>
              <button className="icon-btn on-image" onClick={() => setEditing((e) => !e)}>
                {editing ? <span className="small strong">{t('deck.done')}</span> : <Icon name="edit" />}
              </button>
            </div>
          )}
        </div>
        <div className="deck-hero-body">
          {author && (
            <button className="deck-author" disabled={!author.open} onClick={author.open}>
              {author.photo ? <img src={author.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{author.name.charAt(0).toUpperCase()}</span>}
              <span className="ellipsis">{author.name}</span>
              {!readOnly && <span className="tag">{t(`deck.vis.${deck.visibility ?? 'private'}`)}</span>}
            </button>
          )}
          <h1 className="ellipsis">{deck.name}</h1>
          <div className="sub-line">
            <Pips colors={sortColors(check.identity)} size={12} />
            <span className="small">{commanderNames(deck).join(' + ') || '—'}</span>
          </div>
        </div>
      </div>

      {extra}

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
          <button className="btn" onClick={onDuplicate}>
            <Icon name="copy" size={16} /> {t('deck.duplicate')}
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (await dialog.confirm(t('deck.deleteConfirm'), { ok: t('deck.delete'), danger: true })) onDelete()
            }}
          >
            <Icon name="trash" size={16} /> {t('deck.delete')}
          </button>
        </section>
      )}

      <section className="card">
        <CheckBox check={check} />
        {deck.notes && !editing && <p className="summary-text">{deck.notes}</p>}
        <div className="btn-pair">
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
          <button className="btn ghost" onClick={() => setHand(true)}>
            <Icon name="cards" size={16} /> {t('hand.title')}
          </button>
        </div>
      </section>
      <SampleHand open={hand} onClose={() => setHand(false)} deck={deck} />

      {/* closed every time a deck is opened: open it when needed */}
      <section className={`card collapsible ${statsOpen ? 'open' : ''}`}>
        <button className="collapse-head" onClick={() => setStatsOpen(!statsOpen)} aria-expanded={statsOpen}>
          <span className="card-title">{t('deck.stats')}</span>
          {!statsOpen && <span className="muted small ellipsis collapse-sum">{statsLine}</span>}
          <span className="chev">
            <Icon name="chevron" size={16} />
          </span>
        </button>
        {statsOpen && (
          <>
            {meta && (
              <button className="kv clickable" onClick={() => openCommander(meta.name)}>
                <span>{t('deck.metaWr')}</span>
                <b className={wrClass(winrate(meta))}>
                  {pct(winrate(meta))} <span className="muted small">{t('deck.metaShare', { s: pct(meta.share), n: meta.entries })}</span>{' '}
                  <Icon name="chevron" size={14} />
                </b>
              </button>
            )}
            {mine.games > 0 && (
              <div className="kv">
                <span>{t('stats.mine')}</span>
                <b className={wrClass(mine.wr)}>
                  {pct(mine.wr)} <span className="muted small">({fmtRecord(mine)})</span>
                </b>
              </div>
            )}
            <DeckAnalysis deck={deck} identity={check.identity} groupLabel={(g) => t(GROUP_KEY[g])} onOpen={open} />
          </>
        )}
      </section>

      {deck.history?.length ? <DeckHistory history={deck.history} /> : null}

      <div className="deck-toolbar">
        <div className="seg">
          {(['list', 'pile', 'grid'] as DeckView[]).map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => save({ view: v })}>
              {t(VIEW_KEY[v])}
            </button>
          ))}
        </div>
        {editing && (
          <button className="btn small primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> {t('deck.addCard')}
          </button>
        )}
      </div>

      {view === 'pile' ? (
        <div className="piles">
          {groups.map(([g, cards]) => (
            <section key={g} className="pile-col">
              <div className="group-title">
                {t(GROUP_KEY[g])} <span className="muted">{cards.reduce((s, c) => s + c.qty, 0)}</span>
              </div>
              <div className="pile">
                {cards.map((c) => (
                  <CardImage key={cardKey(c)} card={c} onClick={() => open(c)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        // two columns of lists on a desktop
        <div className={`deck-groups ${view}`}>
          {groups.map(([g, cards]) => (
            <section key={g} className="group">
              <div className="group-title">
                {t(GROUP_KEY[g])} <span className="muted">{cards.reduce((s, c) => s + c.qty, 0)}</span>
              </div>
              {view === 'grid' ? (
                <div className="card-grid">
                  {cards.map((c) => (
                    <CardImage key={cardKey(c)} card={c} onClick={() => open(c)} />
                  ))}
                </div>
              ) : (
                <ul className="card-list">
                  {cards.map((c) => (
                    <li key={cardKey(c)} className="card-row">
                      <button className="card-row-main" onClick={() => open(c)}>
                        <span className="qty">{c.qty}</span>
                        <span className={`ellipsis ${c.info ? '' : 'warn-text'}`}>{c.name}</span>
                        {isBanned(c.name) && <span className="tag ban-tag">BAN</span>}
                        {(c.info?.set ?? c.set) && <span className="set-code">{(c.info?.set ?? c.set)!.toUpperCase()}</span>}
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
              )}
            </section>
          ))}
        </div>
      )}

      {meta && dataset && !readOnly && (
        <DeckVsMeta dataset={dataset} deck={deck} cmd={meta.id} openCommander={openCommander} openCard={openCard} />
      )}

      <Sheet open={!!selected} onClose={() => setSelectedKey(null)} title={selected?.name}>
        {selected &&
          (choosingPrint ? (
            <>
              <button className="btn ghost full" onClick={() => setChoosingPrint(false)}>
                <Icon name="back" size={16} /> {t('deck.back')}
              </button>
              <PrintsPicker name={selected.name} current={selected.info?.id} onPick={(p) => setPrint(selected, p)} />
            </>
          ) : reading ? (
            <>
              <button className="btn ghost full" onClick={() => setReading(false)}>
                <Icon name="back" size={16} /> {t('cards.backToCard')}
              </button>
              <CardDetails name={selected.name} />
            </>
          ) : (
            <div className="card-preview">
              {selected.info?.image && <img src={selected.info.image} alt={selected.name} loading="lazy" />}
              <div className="muted small">{selected.info?.typeLine}</div>
              <button className="edition-row" disabled={readOnly} onClick={() => setChoosingPrint(true)}>
                <span className="muted small">{t('deck.edition')}</span>
                <span className="grow ellipsis">
                  {selected.info?.setName ?? selected.set?.toUpperCase() ?? '—'}
                  {(selected.info?.set ?? selected.set) && (
                    <span className="muted">
                      {' '}
                      ({(selected.info?.set ?? selected.set)!.toUpperCase()}
                      {(selected.info?.cn ?? selected.cn) ? ` #${selected.info?.cn ?? selected.cn}` : ''})
                    </span>
                  )}
                </span>
                {!readOnly && <span className="link">{t('deck.change')}</span>}
              </button>
              {!readOnly && <div className="qty-line">
                <span>{t('deck.qty')}</span>
                <span className="stepper-ctrl">
                  <button onClick={() => (selected.qty > 1 ? changeQty(selected, -1) : remove(selected))} aria-label="-">
                    −
                  </button>
                  <b>{selected.qty}</b>
                  <button onClick={() => changeQty(selected, 1)} aria-label="+">
                    +
                  </button>
                </span>
              </div>}
              <div className="btn-row">
                <button className="btn ghost" onClick={() => setReading(true)}>
                  <Icon name="search" size={16} /> {t('cards.textAndRulings')}
                </button>
                {readOnly ? null : selected.section !== 'commander' ? (
                  <button className="btn ghost" onClick={() => moveTo(selected, 'commander')}>
                    <Icon name="crown" size={16} /> {t('deck.setCommander')}
                  </button>
                ) : (
                  <button className="btn ghost" onClick={() => moveTo(selected, 'main')}>
                    {t('deck.unsetCommander')}
                  </button>
                )}
                {readOnly ? null : selected.section === 'side' ? (
                  <button className="btn ghost" onClick={() => moveTo(selected, 'main')}>
                    <Icon name="swap" size={16} /> {t('deck.toMain')}
                  </button>
                ) : (
                  <button className="btn ghost" onClick={() => moveTo(selected, 'side')}>
                    <Icon name="swap" size={16} /> {t('deck.toSideboard')}
                  </button>
                )}
                {!readOnly && selected.info?.art && (
                  <button
                    className="btn ghost"
                    disabled={deck.cover === selected.name}
                    onClick={() => {
                      save({ cover: selected.name })
                      flash(t('deck.coverSet'))
                    }}
                  >
                    <Icon name="image" size={16} /> {deck.cover === selected.name ? t('deck.isCover') : t('deck.setCover')}
                  </button>
                )}
                {!readOnly && (
                  <button className="btn danger" onClick={() => remove(selected)}>
                    <Icon name="trash" size={16} /> {t('deck.remove')}
                  </button>
                )}
              </div>
            </div>
          ))}
      </Sheet>

      <AddCardsSheet open={adding} onClose={() => setAdding(false)} onAdd={add} />

      <Sheet open={choosingCover} onClose={() => setChoosingCover(false)} title={t('deck.chooseCover')}>
        <p className="muted small no-margin">{t('deck.coverHint')}</p>
        <div className="cover-grid">
          {coverCandidates.map((c) => (
            <button
              key={c.name}
              className={`cover-opt ${(deck.cover ?? check.commanders[0]?.name) === c.name ? 'on' : ''}`}
              onClick={() => {
                save({ cover: c.name })
                setChoosingCover(false)
              }}
            >
              <img src={c.info!.art} alt="" loading="lazy" />
              <span className="ellipsis">{c.name}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sharing} onClose={() => setSharing(false)} title={t('deck.share')}>
        {/* a deck shared before signing in would never reach the cloud */}
        {!user ? (
          <p className="muted small no-margin">{t('deck.shareLogin')}</p>
        ) : (
          <div className="form">
            <div className="seg">
              {VISIBILITIES.map((v) => (
                <button key={v} className={(deck.visibility ?? 'private') === v ? 'on' : ''} onClick={() => save({ visibility: v, author: user.name ?? undefined })}>
                  {t(`deck.vis.${v}`)}
                </button>
              ))}
            </div>
            <p className="muted small no-margin">{t(`deck.vis.${deck.visibility ?? 'private'}.hint`)}</p>
            {(deck.visibility ?? 'private') !== 'private' && (
              <button
                className="btn primary"
                onClick={async () => {
                  const url = `${location.origin}${location.pathname}#decks/${user.uid}~${deck.id}`
                  if (navigator.share) return navigator.share({ title: deck.name, url }).catch(() => {}) // closed: nothing to do
                  try {
                    await navigator.clipboard.writeText(url)
                    flash(t('share.copied'))
                  } catch {
                    /* clipboard blocked */
                  }
                }}
              >
                <Icon name="share" size={16} /> {t('deck.shareLink')}
              </button>
            )}
          </div>
        )}
      </Sheet>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

/** Someone else's deck opened from its link: read only, or "private" when its owner didn't share it. */
export function SharedDeck({
  uid,
  id,
  authorOf,
  ...rest
}: {
  uid: string
  id: string
  authorOf: (uid: string, name?: string) => Author | undefined
  metaDecks: MetaDeck[]
  onBack: () => void
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  const [deck, setDeck] = useState<Deck | null | 'private' | undefined>()
  useEffect(() => {
    loadShared(uid, id).then(setDeck, (e) => setDeck(e?.code === 'permission-denied' ? 'private' : null))
  }, [uid, id])
  if (typeof deck !== 'object' || !deck)
    return (
      <div className="page">
        <header className="page-head">
          <button className="icon-btn" onClick={rest.onBack} aria-label={t('deck.back')}>
            <Icon name="back" />
          </button>
        </header>
        {deck !== undefined && (
          <div className="empty-state">
            <Icon name={deck ? 'shield' : 'decks'} size={40} />
            <p>{t(deck ? 'deck.private' : 'deck.missing')}</p>
          </div>
        )}
      </div>
    )
  return (
    <DeckDetail
      {...rest}
      deck={deck}
      matches={[]}
      onChange={setDeck}
      onDelete={() => {}}
      onDuplicate={() => {}}
      author={authorOf(uid, deck.author)}
      readOnly
    />
  )
}

/** What the deck check found: the deck page, and registering for a tournament. */
export function CheckBox({ check }: { check: DeckCheck }) {
  const { t } = useI18n()
  return (
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
            {check.bans.banned.length > 0 && <div>{t('deck.check.banned', { cards: check.bans.banned.join(', ') })}</div>}
            {check.bans.asCommander.length > 0 && <div>{t('deck.check.bannedCommander', { cards: check.bans.asCommander.join(', ') })}</div>}
            {check.bans.asPartner.length > 0 && <div>{t('deck.check.bannedPartner', { cards: check.bans.asPartner.join(', ') })}</div>}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * A player's list at a tournament run in the app, photographed when round 1 started (docs/liste-mazzi.md, 8): read
 * only, with the deck page's views. The player and the TOs see it during the tournament, everyone once it's over.
 */
export function TournamentPhoto({
  id,
  player,
  authorOf,
  onCreate,
  ...rest
}: {
  id: string
  player: string
  authorOf: (key: string, name: string) => Author
  onCreate: (d: Deck) => void
  metaDecks: MetaDeck[]
  onBack: () => void
  openCommander: (name: string) => void
  openCard: (name: string) => void
}) {
  const { t, lang } = useI18n()
  const { t: tour, players, matches } = useTournament(id)
  const [deck, setDeck] = useState<Deck | null | 'private' | undefined>()
  useEffect(() => {
    loadPrivate(id, player).then(
      async (p) => {
        if (!p.cards) return setDeck(null)
        const cards = parseDecklist(p.cards)
        try {
          const { found } = await fetchCollection(cards)
          for (const c of cards) c.info = found.get(requestKey(c))
        } catch {
          /* offline: the names only */
        }
        setDeck({ id: `${id}@${player}`, name: p.name ?? '', tags: [], notes: '', cards, createdAt: p.at ?? '', updatedAt: p.at ?? '' })
      },
      (e) => setDeck(e?.code === 'permission-denied' ? 'private' : null),
    )
  }, [id, player])
  const name = players.find(([k]) => k === player)?.[1].name ?? player
  if (typeof deck !== 'object' || !deck)
    return (
      <div className="page">
        <header className="page-head">
          <button className="icon-btn" onClick={rest.onBack} aria-label={t('deck.back')}>
            <Icon name="back" />
          </button>
        </header>
        {deck !== undefined && (
          <div className="empty-state">
            <Icon name={deck ? 'shield' : 'decks'} size={40} />
            <p>{t(deck ? 'photo.hidden' : 'deck.missing')}</p>
          </div>
        )}
      </div>
    )
  const rows = tour?.status === 'done' ? ranking(tour, players, matches) : []
  const at = rows.findIndex((r) => r.id === player)
  const r = rows[at]
  const copy = () => {
    const now = new Date().toISOString()
    const cmd = commanderNames(deck).join(' / ')
    onCreate({ ...deck, id: newId(), name: t('meta.dupName', { c: nickName(cmd), p: name }), history: [], createdAt: now, updatedAt: now })
  }
  return (
    <DeckDetail
      {...rest}
      deck={deck}
      matches={[]}
      onChange={setDeck}
      onDelete={() => {}}
      onDuplicate={() => {}}
      author={authorOf(player, name)}
      readOnly
      extra={
        <section className="card form">
          <div>
            <div className="card-title">{t('photo.title')}</div>
            {tour && (
              <p className="no-margin">
                <b>{tournamentTitle(tour, t)}</b>
                <span className="muted small">
                  {' · '}
                  {new Date(`${tour.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })}
                  {r && ` · ${r.wins}-${r.losses}${r.draws ? `-${r.draws}` : ''}, ${placeLabel(at + 1, lang)}`}
                </span>
              </p>
            )}
          </div>
          <button className="btn" onClick={copy}>
            <Icon name="copy" size={16} /> {t('meta.duplicate')}
          </button>
        </section>
      }
    />
  )
}
