import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type MetaData, type MetaDeck, normName, wilson, winrate } from '../lib/meta'
import { Icon, Pips, pct, wrClass } from '../components/ui'
import type { Circuit } from '../lib/circuit'
import { useStoredState } from '../lib/storage'
import { CircuitPanel, type CircuitPrefs, LiveStatus } from './Circuit'

type Status = 'idle' | 'loading' | 'error'

export const META_MODE_KEY = 'cc.metaMode'

type Sort = 'wr' | 'games' | 'share'
const MIN_OPTIONS = [0, 10, 25, 50]

export function metaSummary(decks: MetaDeck[], minGames: number) {
  const games = decks.reduce((s, d) => s + d.games, 0)
  const wins = decks.reduce((s, d) => s + d.wins, 0)
  const mostPlayed = [...decks].sort((a, b) => b.games - a.games)[0]
  const best = decks.filter((d) => d.games >= minGames).sort((a, b) => winrate(b) - winrate(a))[0]
  return { games, avgWr: games ? wins / games : 0, mostPlayed, best }
}

export default function Meta({
  meta,
  status,
  onRefresh,
  circuit,
  circuitStatus,
  onCircuitRefresh,
  prefs,
  openPlayer,
  openEvent,
}: {
  meta: MetaData
  status: Status
  onRefresh: () => void
  circuit: Circuit | null
  circuitStatus: Status
  onCircuitRefresh: () => void
  prefs: CircuitPrefs
  openPlayer: (key: string) => void
  openEvent: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const [mode, setMode] = useStoredState<'decks' | 'circuit'>(META_MODE_KEY, 'decks')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('wr')
  const [minGames, setMinGames] = useState(10)
  const [open, setOpen] = useState<string | null>(null)

  const summary = useMemo(() => metaSummary(meta.decks, minGames), [meta.decks, minGames])
  const list = useMemo(() => {
    const nq = normName(q)
    return meta.decks
      .filter((d) => d.games >= minGames && (!nq || normName(d.name).includes(nq)))
      .sort((a, b) =>
        sort === 'wr' ? winrate(b) - winrate(a) || b.games - a.games : sort === 'games' ? b.games - a.games : b.share - a.share,
      )
  }, [meta.decks, q, sort, minGames])
  const maxShare = Math.max(...meta.decks.map((d) => d.share), 0.01)

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t('meta.title')}</h1>
        {mode === 'decks' ? (
          <button className="icon-btn" onClick={onRefresh} disabled={meta.demo || status === 'loading'} aria-label={t('meta.refresh')}>
            <span className={status === 'loading' ? 'spin' : ''}>
              <Icon name="refresh" />
            </span>
          </button>
        ) : (
          <button className="icon-btn" onClick={onCircuitRefresh} disabled={circuitStatus === 'loading'} aria-label={t('meta.refresh')}>
            <span className={circuitStatus === 'loading' ? 'spin' : ''}>
              <Icon name="refresh" />
            </span>
          </button>
        )}
      </header>

      <div className="seg wide mode-seg">
        {(['decks', 'circuit'] as const).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {t(m === 'decks' ? 'circuit.modeDecks' : 'circuit.modeCircuit')}
          </button>
        ))}
      </div>

      {mode === 'circuit' ? (
        <>
          <LiveStatus circuit={circuit} status={circuitStatus} />
          {circuit && <CircuitPanel circuit={circuit} prefs={prefs} openPlayer={openPlayer} openEvent={openEvent} />}
        </>
      ) : (
        <>
          {meta.demo && <div className="notice">{t('meta.demo')}</div>}
          {status === 'error' && <div className="notice warn">{meta.decks.length ? t('meta.offline') : t('meta.error')}</div>}

          <section className="card">
            <div className="card-title">
              {t('meta.summary')}
              <span className="muted small">
                {t('meta.updated')} {new Date(meta.updatedAt).toLocaleDateString(lang)}
              </span>
            </div>
            <div className="stats3">
              <div>
                <div className="stat-num">{meta.decks.length}</div>
                <div className="stat-label">{t('meta.decks')}</div>
              </div>
              <div>
                <div className="stat-num">{summary.games}</div>
                <div className="stat-label">{t('meta.games')}</div>
              </div>
              <div>
                <div className="stat-num">{pct(summary.avgWr, 0)}</div>
                <div className="stat-label">{t('meta.avgWr')}</div>
              </div>
            </div>
            {meta.summary.length > 0
              ? meta.summary.map((p, i) => (
                  <p key={i} className="summary-text">
                    {p}
                  </p>
                ))
              : summary.mostPlayed &&
                summary.best && (
                  <p className="summary-text">
                    {t('meta.summaryText', {
                      n: meta.decks.length,
                      g: summary.games,
                      mp: summary.mostPlayed.name,
                      mps: (summary.mostPlayed.share * 100).toFixed(1),
                      min: minGames,
                      best: summary.best.name,
                      bwr: (winrate(summary.best) * 100).toFixed(1),
                    })}
                  </p>
                )}
          </section>

          <div className="search">
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('meta.search')} />
          </div>

          <div className="filters">
            <div className="seg">
              {(['wr', 'games', 'share'] as Sort[]).map((s) => (
                <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
                  {t(s === 'wr' ? 'meta.sortWr' : s === 'games' ? 'meta.sortGames' : 'meta.sortShare')}
                </button>
              ))}
            </div>
            <label className="min-games">
              <span className="muted small">{t('meta.minGames')}</span>
              <select value={minGames} onChange={(e) => setMinGames(+e.target.value)}>
                {MIN_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ol className="meta-list">
            {list.map((d, i) => {
              const wr = winrate(d)
              const [lo, hi] = wilson(d.wins, d.games)
              const isOpen = open === d.name
              return (
                <li key={d.name} className={`meta-row ${isOpen ? 'open' : ''}`} onClick={() => setOpen(isOpen ? null : d.name)}>
                  <div className="meta-main">
                    <span className="rank">{i + 1}</span>
                    <div className="meta-name">
                      <div className="name-line">
                        <span className="ellipsis">{d.name}</span>
                      </div>
                      <div className="sub-line">
                        <Pips colors={d.colors} size={10} />
                        <span className="muted small">
                          {d.games} {t('meta.games').toLowerCase()} · {pct(d.share)}
                        </span>
                      </div>
                      <div className="share-bar">
                        <span style={{ width: `${(d.share / maxShare) * 100}%` }} />
                      </div>
                    </div>
                    <span className={`wr ${wrClass(wr)}`}>{pct(wr)}</span>
                  </div>
                  {isOpen && (
                    <div className="meta-detail">
                      <div className="kv">
                        <span>{t('meta.wins')}</span>
                        <b>{d.wins}</b>
                      </div>
                      <div className="kv">
                        <span>{t('meta.losses')}</span>
                        <b>{d.losses}</b>
                      </div>
                      {d.draws > 0 && (
                        <div className="kv">
                          <span>{t('meta.draws')}</span>
                          <b>{d.draws}</b>
                        </div>
                      )}
                      <div className="kv">
                        <span>{t('meta.share')}</span>
                        <b>{pct(d.share)}</b>
                      </div>
                      <div className="kv">
                        <span>{t('meta.ci')}</span>
                        <b>
                          {pct(lo, 0)} – {pct(hi, 0)}
                        </b>
                      </div>
                      <div className="ci-bar" aria-hidden>
                        <span className="ci-range" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
                        <span className="ci-mid" />
                        <span className="ci-dot" style={{ left: `${wr * 100}%` }} />
                      </div>
                      {d.games < 30 && <div className="muted small">{t('meta.lowSample')}</div>}
                    </div>
                  )}
                </li>
              )
            })}
            {!list.length && <li className="empty">{t('meta.noResults')}</li>}
          </ol>
        </>
      )}
    </div>
  )
}
