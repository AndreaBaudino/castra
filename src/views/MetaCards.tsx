import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { Icon, Pips, pct } from '../components/ui'
import { cardStats, useDecklists } from '../lib/decklists'
import { type MetaDataset, type MetaFilter, normName, shortName } from '../lib/meta'
import { symbolUrl } from '../lib/scryfall'
import { useStoredState } from '../lib/storage'
import { CardsInfoButton } from './MetaInfo'

// The circuit's most played cards, from the tournaments' deck lists (docs/liste-mazzi.md): the Circuit's "Cards" tab.

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
const MIN_OPTIONS = [0, 10, 20, 40]

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
  const [colors, setColors] = useState('') // WUBRG order; C alone: colorless cards
  const [lands, setLands] = useStoredState('cc.meta.cardLands', false)
  const [min, setMin] = useStoredState('cc.meta.cardMin', 20)
  const stats = useMemo(() => (dl ? cardStats(dataset, filter, dl) : null), [dataset, filter, dl])
  const list = useMemo(() => {
    const nq = normName(q)
    return (stats?.cards ?? []).filter(
      (c) =>
        c.of >= min &&
        (lands || !c.land) &&
        (!nq || normName(c.name).includes(nq)) &&
        (colors === 'C' ? !c.colors : [...colors].every((x) => c.colors.includes(x))),
    )
  }, [stats, q, colors, lands, min])

  if (dl === undefined) return <div className="notice">{t('cardsMeta.loading')}</div>
  if (!dl || !stats) return <div className="notice warn">{t('cardsMeta.error')}</div>
  if (dataset.year !== dl.year) return <div className="notice">{t('cardsMeta.otherYear', { y: dl.year })}</div>

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
          // colorless and the colors exclude each other
          const next = c === 'C' ? (on ? '' : 'C') : COLORS.filter((x) => x !== 'C' && (x === c ? !on : colors.includes(x))).join('')
          return (
            <button key={c} className={on ? 'on' : ''} aria-pressed={on} aria-label={t(`meta.color.${c}`)} onClick={() => setColors(next)}>
              <img src={symbolUrl(c)} alt="" />
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
                  <span className="ellipsis">{shortName(c.name)}</span>
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
      {min > 0 && list.length > 0 && <p className="muted small center">{t('cardsMeta.minNote', { n: min })}</p>}
    </>
  )
}
