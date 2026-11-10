import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { Icon, Pips, pct } from '../components/ui'
import { cardStats, cardUse, colorMatch, type CommanderUse, deckOfList, deckVsMeta, hasLists, playerCards, type TypicalCard, typicalList, useDecklists } from '../lib/decklists'
import { type MetaDataset, type MetaEntry, type MetaFilter, isFiltered, nickName, normName, shortName } from '../lib/meta'
import type { Deck } from '../lib/decks'
import { fetchCollection, requestKey, symbolUrl } from '../lib/scryfall'
import { useStoredState } from '../lib/storage'
import { CardsInfoButton, DeckMetaInfoButton, PlayerCardsInfoButton, TypicalInfoButton } from './MetaInfo'

// The circuit's most played cards, from the tournaments' deck lists (docs/liste-mazzi.md): the Circuit's "Cards" tab.

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C', 'M'] as const
const MIN_OPTIONS = [0, 10, 20, 40]
const SHOW = 5

// multicolored, as Arena draws it: a gold disc with a ring, flat like the mana symbols (a fixed symbol, like their images)
const MultiIcon = () => (
  <svg viewBox="0 0 26 26" aria-hidden="true">
    <circle cx="13" cy="13" r="13" fill="#E3C46B" />
    <circle cx="13" cy="13" r="7" fill="none" stroke="#3B2A0A" strokeWidth="2.6" />
  </svg>
)

export default function MetaCards({
  dataset,
  filter,
  openCard,
  current,
}: {
  dataset: MetaDataset
  filter: MetaFilter
  openCard: (name: string) => void
  current?: string
}) {
  const { t } = useI18n()
  const dl = useDecklists()
  const [q, setQ] = useState('')
  const [colors, setColors] = useState('') // WUBRG order, M last for multicolored; C alone: colorless cards
  const [lands, setLands] = useStoredState('cc.meta.cardLands', false)
  const [min, setMin] = useStoredState('cc.meta.cardMin', 20)
  const stats = useMemo(() => (dl ? cardStats(dataset, filter, dl) : null), [dataset, filter, dl])
  const [list, belowMin] = useMemo(() => {
    const nq = normName(q)
    const found = (stats?.cards ?? []).filter(
      (c) =>
        (lands || !c.land) &&
        (!nq || normName(c.name).includes(nq)) &&
        colorMatch(c.colors, colors),
    )
    const kept = found.filter((c) => c.of >= min)
    // few lists in the filters (a small league): rather all the cards than none
    return kept.length || !isFiltered(filter) ? [kept, false] : [found, found.length > 0 && min > 0]
  }, [stats, q, colors, lands, min, filter])

  if (dl === undefined) return <div className="notice">{t('cardsMeta.loading')}</div>
  if (!dl || !stats) return <div className="notice warn">{t('cardsMeta.error')}</div>
  if (!hasLists(dataset, dl)) return <div className="notice">{t('cardsMeta.otherYear', { y: (dl.years ?? [dl.year]).join(', ') })}</div>

  return (
    <>
      <section className="card">
        <div className="card-title">
          <span className="title-live">
            {t('cardsMeta.title')}
            <CardsInfoButton />
          </span>
        </div>
        <div className="stats3">
          <div>
            <div className="stat-num">{stats.entries}</div>
            <div className="stat-label">{t('cardsMeta.entries')}</div>
          </div>
          <div>
            <div className="stat-num">{stats.total ? pct(stats.entries / stats.total, 0) : '—'}</div>
            <div className="stat-label">{t('cardsMeta.coverage')}</div>
          </div>
          <div>
            <div className="stat-num">{stats.lists}</div>
            <div className="stat-label">{t('cardsMeta.lists')}</div>
          </div>
        </div>
        <p className="summary-text">{t('cardsMeta.note', { n: stats.total })}</p>
      </section>

      <div className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cardsMeta.search')} />
      </div>

      <div className="color-pick">
        <span className="muted small">{t('meta.colors')}</span>
        {COLORS.map((c) => {
          const on = colors.includes(c)
          // colorless excludes the colors and multicolored
          const next = c === 'C' ? (on ? '' : 'C') : COLORS.filter((x) => x !== 'C' && (x === c ? !on : colors.includes(x))).join('')
          return (
            <button key={c} className={on ? 'on' : ''} aria-pressed={on} aria-label={t(`meta.color.${c}`)} onClick={() => setColors(next)}>
              {c === 'M' ? <MultiIcon /> : <img src={symbolUrl(c)} alt="" />}
            </button>
          )
        })}
      </div>

      <div className="filters">
        <div className="seg">
          {[true, false].map((v) => (
            <button key={String(v)} className={lands === v ? 'on' : ''} onClick={() => setLands(v)}>
              {t(v ? 'cardsMeta.all' : 'cardsMeta.noLands')}
            </button>
          ))}
        </div>
        <label className="min-games">
          <span className="muted small">{t('cardsMeta.min')}</span>
          <select value={min} onChange={(e) => setMin(+e.target.value)}>
            {MIN_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="meta-list">
        {list.slice(0, 200).map((c, i) => (
          <li key={c.id} className={c.name === current ? 'meta-row on' : 'meta-row'} onClick={() => openCard(c.name)}>
            <div className="meta-main">
              <span className="rank">{i + 1}</span>
              <div className="meta-name">
                <div className="name-line">
                  <span className="ellipsis">{c.name}</span>
                </div>
                <div className="sub-line">
                  <Pips colors={c.colors} size={10} />
                  <span className="muted small">{t('cardsMeta.decks', { n: c.decks, of: c.of })}</span>
                </div>
                <div className="share-bar">
                  <span style={{ width: `${c.share * 100}%` }} />
                </div>
              </div>
              <div className="meta-val">
                <b>{pct(c.share, 0)}</b>
                <span className="muted">{t('cardsMeta.nLists', { n: c.lists })}</span>
              </div>
            </div>
          </li>
        ))}
        {!list.length && <li className="empty">{t(stats.entries ? 'cardsMeta.noResults' : 'cardsMeta.none')}</li>}
      </ol>
      {list.length > 200 && <p className="muted small center">{t('cardsMeta.capped', { n: list.length })}</p>}
      {min > 0 && list.length > 0 && (
        <p className="muted small center">{t(belowMin ? 'cardsMeta.belowMin' : 'cardsMeta.minNote', { n: min })}</p>
      )}
    </>
  )
}

/** A card's "In the circuit" section, in its page: with the Circuit's filters. */
export function CircuitUse({
  dataset,
  filter,
  name,
  colors,
  openCommander,
}: {
  dataset: MetaDataset
  filter: MetaFilter
  name: string
  colors: string
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  const dl = useDecklists()
  const [all, setAll] = useState(false)
  const use = useMemo(() => (dl ? cardUse(dataset, filter, dl, name, colors) : null), [dataset, filter, dl, name, colors])
  if (!dl || !use) return null
  const scope = [
    dataset.year,
    filter.season.toUpperCase(),
    filter.kind ? t(`meta.kind.${filter.kind}`) : t('meta.allKinds'),
    filter.league,
    filter.minPlayers || filter.maxPlayers ? `${t('meta.players')} ${filter.minPlayers || '…'}–${filter.maxPlayers || '…'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  type Part = { decks: number; of: number }
  const parts = {
    top: (
      [
        ['cardsMeta.top8', use.top8],
        ['cardsMeta.out8', use.out8],
        ['cardsMeta.winners', use.winners],
      ] as const
    ).filter(([, p]) => p.of > 0),
    seasons: [
      ['cardsMeta.s1', use.s1],
      ['cardsMeta.s2', use.s2],
    ] as const,
  }
  const share = (k: (typeof parts.top)[number][0] | 'cardsMeta.s1' | 'cardsMeta.s2', p: Part) => (
    <div key={k} className="kv">
      <span>{t(k)}</span>
      <b>
        {pct(p.decks / p.of, 0)} <span className="muted small">{t('cardsMeta.part', { n: p.decks, of: p.of })}</span>
      </b>
    </div>
  )
  const row = (c: CommanderUse) => (
    <li key={c.name} className="event-row" onClick={() => openCommander(c.name)}>
      <div className="event-main">
        <span className="ellipsis">
          <Pips colors={c.colors} size={12} /> {shortName(c.name)}
        </span>
        <span className="muted small">
          {c.decks
            ? `${t('cardsMeta.cmdPlays', { n: c.decks, of: c.of })} · ${t('meta.nPlayers', { n: c.players })}`
            : t('cardsMeta.cmdEntries', { n: c.of })}
        </span>
      </div>
      <b className={c.decks ? '' : 'muted'}>{pct(c.decks / c.of, 0)}</b>
    </li>
  )
  return (
    <>
      <section className="card">
        <div className="card-title">
          <span className="title-live">
            {t('cardsMeta.inCircuit')}
            <CardsInfoButton />
          </span>
        </div>
        <span className="muted small">{t('cardsMeta.scope', { s: scope })}</span>
        {!hasLists(dataset, dl) ? (
          <p className="no-margin">{t('cardsMeta.otherYear', { y: (dl.years ?? [dl.year]).join(', ') })}</p>
        ) : !use.of ? (
          <p className="no-margin">{t('cardsMeta.none')}</p>
        ) : !use.decks ? (
          <>
            <p className="no-margin">{t('cardsMeta.nobody')}</p>
            <p className="muted small no-margin">{t('cardsMeta.nobodyOf', { n: use.of })}</p>
          </>
        ) : (
          <div className="stats3">
            <div>
              <div className="stat-num">{pct(use.share, 0)}</div>
              <div className="stat-label">{t('cardsMeta.share')}</div>
            </div>
            <div>
              <div className="stat-num">{use.decks}</div>
              <div className="stat-label">{t('cardsMeta.entriesOf', { n: use.of })}</div>
            </div>
            <div>
              <div className="stat-num">{use.lists}</div>
              <div className="stat-label">{t('cardsMeta.lists')}</div>
            </div>
          </div>
        )}
        {use.decks > 0 && (
          <>
            {parts.top.map(([k, p]) => share(k, p))}
            {!filter.season && use.s1.of > 0 && use.s2.of > 0 && parts.seasons.map(([k, p]) => share(k, p))}
          </>
        )}
      </section>

      {use.decks > 0 && (
        <section className="group">
          <div className="group-title">{t('cardsMeta.whoPlays')}</div>
          <ul className="card-list">
            {(all ? use.playing : use.playing.slice(0, SHOW)).map(row)}
            {use.playing.length > SHOW && (
              <li className="event-row more" onClick={() => setAll(!all)}>
                {all ? t('meta.showLess') : t('cardsMeta.allCommanders', { n: use.playing.length })}
              </li>
            )}
          </ul>
          {!use.skipping.length && <p className="muted small group-note">{t('cardsMeta.everyone')}</p>}
        </section>
      )}

      {use.decks > 0 && use.skipping.length > 0 && (
        <section className="group">
          <div className="group-title">{t('cardsMeta.whoSkips')}</div>
          <ul className="card-list">{use.skipping.slice(0, 3).map(row)}</ul>
        </section>
      )}
    </>
  )
}

/** A commander's typical list, in its page: with the page's filters. Nothing without lists;
 * with a single one, who brought it (and its cards, with filters). A card opens its page. */
export function TypicalList({
  dataset,
  filter,
  cmd,
  openCard,
}: {
  dataset: MetaDataset
  filter: MetaFilter
  cmd: number
  openCard: (name: string) => void
}) {
  const { t, lang } = useI18n()
  const dl = useDecklists()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [pick, setPick] = useState('must')
  const x = useMemo(() => (dl ? typicalList(dataset, filter, dl, cmd) : null), [dataset, filter, dl, cmd])
  if (!x?.entries) return dl && <p className="muted no-margin">{t('typical.none')}</p>
  const groups = ([['must', x.must], ['often', x.often], ['tech', x.choices], ['picked', x.picked]] as const).filter(
    ([, list]) => list.length,
  )
  const shown = groups.find(([k]) => k === pick)?.[0] ?? groups[0]?.[0]
  const num = (n: number) => n.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const title = (
    <div className="card-title">
      <span className="title-live">
        {t('typical.title')}
        <TypicalInfoButton />
      </span>
    </div>
  )
  // a single list: only who brought it, unless the filters left just one (a small league)
  if (x.lists < 2 && !isFiltered(filter))
    return (
      <section className="card">
        {title}
        <p className="no-margin">{t('typical.single')}</p>
        <p className="muted small no-margin">{t('typical.singleBy', { p: x.players.join(', '), n: x.entries })}</p>
      </section>
    )
  const group = (key: 'must' | 'often' | 'tech' | 'picked' | 'list', note: string, list: TypicalCard[], lands = false) =>
    list.length > 0 && (
      <section className="group">
        <div className="group-title">
          {t(`typical.${key}`)} · {t(lands ? 'typical.nLands' : 'typical.nCards', { n: list.length })}
        </div>
        <p className="muted small group-note">{note}</p>
        <ul className="card-list">
          {(open[key] ? list : list.slice(0, SHOW)).map((c) => (
            <li key={c.id} className="event-row" onClick={() => openCard(c.name)}>
              {key === 'list' ? (
                <span className="ellipsis grow">{c.name}</span>
              ) : (
                <>
                  <div className="event-main">
                    <span className="ellipsis">{c.name}</span>
                    <span className="muted small">
                      {t(lands ? 'typical.of' : 'typical.row', { n: c.decks, of: x.entries })} ·{' '}
                      {t('cardsMeta.nLists', { n: c.lists })}
                      {c.rest != null && ` · ${t('typical.rest', { p: pct(c.rest, 0) })}`}
                    </span>
                  </div>
                  <b>{pct(c.share, 0)}</b>
                </>
              )}
            </li>
          ))}
          {list.length > SHOW && (
            <li className="event-row more" onClick={() => setOpen({ ...open, [key]: !open[key] })}>
              {open[key] ? t('meta.showLess') : t(lands ? 'typical.allLands' : 'typical.allCards', { n: list.length })}
            </li>
          )}
        </ul>
      </section>
    )
  return (
    <>
      <section className="card">
        {title}
        <div className="kv">
          <span>{t('typical.entries')}</span>
          <b>{t('typical.of', { n: x.entries, of: x.total })}</b>
        </div>
        <div className="kv">
          <span>{t('typical.lists')}</span>
          <b>{x.lists}</b>
        </div>
        <div className="kv">
          <span>{t('typical.lands')}</span>
          <b>
            {num(x.lands + x.modal)}{' '}
            {x.lists > 1 && <span className="muted">({t('typical.range', { lo: x.lo, hi: x.hi })})</span>}
          </b>
        </div>
        {x.modal > 0 && (
          <>
            <span className="muted small">{t('typical.split', { l: num(x.lands), m: num(x.modal) })}</span>
            <span className="muted small">{t('typical.modalNote')}</span>
          </>
        )}
        {x.lists === 1 && (
          <p className="notice no-margin">
            {t('typical.singleHere')} {t('typical.singleBy', { p: x.players.join(', '), n: x.entries })}
          </p>
        )}
      </section>
      {x.lists === 1 ? (
        // one list: every card is at 100%, so just its cards
        group('list', t('typical.listNote'), x.must)
      ) : (
        <>
          {/* one group at a time: all four together were half of the commander's page */}
          <div className="chips">
            {groups.map(([k, list]) => (
              <button key={k} className={`chip ${k === shown ? 'on' : ''}`} onClick={() => setPick(k)}>
                {t(`typical.${k}`)} <span className="muted">{list.length}</span>
              </button>
            ))}
          </div>
          {shown === 'must' && group('must', t('typical.mustNote'), x.must)}
          {shown === 'often' && group('often', t('typical.oftenNote'), x.often)}
          {shown === 'tech' && group('tech', t(x.tech > 0.2 ? 'typical.techNote30' : 'typical.techNote'), x.choices)}
          {shown === 'picked' && group('picked', t('typical.pickedNote'), x.picked, true)}
        </>
      )}
    </>
  )
}

/** A player's favourite cards, in their page: the whole year. Only with 2+ lists. */
export function PlayerCards({
  dataset,
  playerKey,
  openCard,
}: {
  dataset: MetaDataset
  playerKey: string
  openCard: (name: string) => void
}) {
  const { t } = useI18n()
  const dl = useDecklists()
  const [all, setAll] = useState(false)
  const x = useMemo(() => (dl ? playerCards(dataset, dl, playerKey) : null), [dataset, dl, playerKey])
  if (!x || x.lists < 2) return null
  return (
    <>
      <section className="card">
        <div className="card-title">
          <span className="title-live">
            {t('playerCards.title')}
            <PlayerCardsInfoButton />
          </span>
        </div>
        <div className="kv">
          <span>{t('typical.entries')}</span>
          <b>{t('typical.of', { n: x.entries, of: x.total })}</b>
        </div>
        <div className="kv">
          <span>{t('typical.lists')}</span>
          <b>{x.lists}</b>
        </div>
        <div className="kv">
          <span>{t('playerCards.commanders')}</span>
          <b>{x.commanders}</b>
        </div>
        {!x.cards.length && <span className="muted small">{t('playerCards.none')}</span>}
      </section>
      {x.cards.length > 0 && (
        <section className="group">
          <div className="group-title">
            {t('playerCards.fav')} · {t('typical.nCards', { n: x.cards.length })}
          </div>
          <p className="muted small group-note">{t('playerCards.favNote')}</p>
          <ul className="card-list">
            {(all ? x.cards : x.cards.slice(0, SHOW)).map((c) => (
              <li key={c.id} className="event-row" onClick={() => openCard(c.name)}>
                <div className="event-main">
                  <span className="ellipsis">{c.name}</span>
                  <span className="muted small">{t('playerCards.row', { n: c.decks, of: c.of })}</span>
                </div>
                <div className="meta-val">
                  <b>{pct(c.share, 0)}</b>
                  <span className="muted">{t('playerCards.rest', { p: pct(c.rest, 0) })}</span>
                </div>
              </li>
            ))}
            {x.cards.length > SHOW && (
              <li className="event-row more" onClick={() => setAll(!all)}>
                {all ? t('meta.showLess') : t('typical.allCards', { n: x.cards.length })}
              </li>
            )}
          </ul>
        </section>
      )}
    </>
  )
}

/** One of the user's decks against its commander's most played cards, in the deck's page.
 * Nothing when the commander has fewer than 2 lists. */
export function DeckVsMeta({
  dataset,
  deck,
  cmd,
  openCommander,
  openCard,
}: {
  dataset: MetaDataset
  deck: Deck
  cmd: number
  openCommander: (name: string) => void
  openCard?: (name: string) => void
}) {
  const { t, lang } = useI18n()
  const dl = useDecklists()
  const [open, setOpen] = useState(false)
  const x = useMemo(() => (dl ? deckVsMeta(dataset, dl, cmd, deck) : null), [dataset, dl, cmd, deck])
  if (!x) return null
  const c = dataset.commanders[cmd]
  const nick = nickName(c.name)
  const row = (name: string, decks: number, share: number) => (
    <li key={name} className="event-row" onClick={() => openCard?.(name)}>
      <div className="event-main">
        <span className="ellipsis">{name}</span>
        <span className="muted small">{decks ? t('typical.row', { n: decks, of: x.entries }) : t('deckMeta.nowhere')}</span>
      </div>
      <b>{pct(share, 0)}</b>
    </li>
  )
  return (
    <>
      <section className="card">
        <div className="card-title">
          <span className="title-live">
            {t('deckMeta.title')}
            <DeckMetaInfoButton />
          </span>
        </div>
        <span className="muted small">{t('deckMeta.vs', { c: nick, n: x.entries, l: x.lists })}</span>
        <div className="kv">
          <span>{t('deckMeta.top')}</span>
          <b>{t('typical.of', { n: x.have, of: x.of })}</b>
        </div>
        <div className="kv">
          <span>{t('deckMeta.lands')}</span>
          <b>
            {x.lands}{' '}
            <span className="muted small">
              ({t('deckMeta.landsCircuit', { n: x.avgLands.toLocaleString(lang, { maximumFractionDigits: 1 }) })})
            </span>
          </b>
        </div>
        <button className="link" onClick={() => openCommander(c.name)}>
          {t('deckMeta.open', { c: nick })}
        </button>
      </section>
      {x.missing.length > 0 && (
        <section className="group">
          <div className="group-title">
            {t('deckMeta.missing')} · {t('typical.nCards', { n: x.missing.length })}
          </div>
          <p className="muted small group-note">{t('deckMeta.missingNote')}</p>
          <ul className="card-list">
            {(open ? x.missing : x.missing.slice(0, SHOW)).map((m) => row(m.name, m.decks, m.share))}
            {x.missing.length > SHOW && (
              <li className="event-row more" onClick={() => setOpen(!open)}>
                {open ? t('meta.showLess') : t('typical.allCards', { n: x.missing.length })}
              </li>
            )}
          </ul>
        </section>
      )}
      {x.pets.length > 0 && (
        <section className="group">
          <div className="group-title">
            {t('deckMeta.pets')} · {t('typical.nCards', { n: x.pets.length })}
          </div>
          <p className="muted small group-note">{t('deckMeta.petsNote', { c: nick })}</p>
          <ul className="card-list">{x.pets.map((p) => row(p.name, p.decks, p.share))}</ul>
        </section>
      )}
    </>
  )
}

/** "Duplicate deck" next to a Moxfield link of the circuit: a new deck with the archived list (as it was when read),
 * only when the link is the list's own (not one given to the entry by the player's other lists). */
export function DuplicateDeck({
  dataset,
  entry,
  onCreate,
  openDeck,
}: {
  dataset: MetaDataset
  entry: MetaEntry
  onCreate: (d: Deck) => void
  openDeck: (id: string) => void
}) {
  const { t } = useI18n()
  const dl = useDecklists()
  const [made, setMade] = useState<Deck | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!made && !failed) return
    const id = setTimeout(() => (setMade(null), setFailed(false)), 5000)
    return () => clearTimeout(id)
  }, [made, failed])
  if (!dl || entry.deckList == null || entry.deckList >= dl.lists.length || entry.deckListGuessed || !hasLists(dataset, dl)) return null
  const make = async () => {
    const d = deckOfList(dl, entry.deckList!, t('meta.dupName', { c: nickName(dataset.commanders[entry.cmd].name), p: entry.player ?? '' }))
    setBusy(true)
    setFailed(false)
    try {
      // as an imported deck: the cards' data first, the deck's page needs it
      const { found } = await fetchCollection(d.cards)
      for (const c of d.cards) c.info = found.get(requestKey(c))
      onCreate(d)
      setMade(d)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }
  return (
    <>
      <button className="btn small" onClick={make} disabled={busy}>
        {t('meta.duplicate')}
      </button>
      {failed && (
        <div className="toast" role="status">
          {t('meta.dupError')}
        </div>
      )}
      {made && (
        <div className="toast toast-action" role="status">
          <span className="ellipsis">{t('meta.dupDone', { d: made.name })}</span>
          <button className="link" onClick={() => openDeck(made.id)}>
            {t('meta.dupOpen')}
          </button>
        </div>
      )}
    </>
  )
}
