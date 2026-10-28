import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { ALL, type MetaDataset, type MetaDeck, type MetaFilter, type TournamentKind, aggregate, normName, shortName, winrate } from '../lib/meta'
import { Icon, Pips, pct, wrClass } from '../components/ui'
import type { Circuit } from '../lib/circuit'
import { useStoredState } from '../lib/storage'
import { CircuitPanel, type CircuitPrefs, LiveStatus } from './Circuit'

type Status = 'idle' | 'loading' | 'error'

export const META_MODE_KEY = 'cc.metaMode'
/** The meta filter (season, kind of tournament, league): shared by the list and the commander pages. */
export const META_FILTER_KEY = 'cc.meta.filter'

type Sort = 'share' | 'wr' | 'games'
export const MIN_OPTIONS = [0, 10, 20, 40]
const MIN_PLAYERS = [0, 8, 12, 16, 24, 32]
const KINDS: TournamentKind[] = ['league', 'l1', 'l2', 'online']

export function metaSummary(decks: MetaDeck[], minGames: number) {
  const mostPlayed = [...decks].sort((a, b) => b.entries - a.entries)[0]
  const best = decks.filter((d) => d.games >= minGames).sort((a, b) => winrate(b) - winrate(a))[0]
  return { mostPlayed, best }
}

/** Season chips and the kind / league pickers, above the list and on a commander's page. */
export function MetaFilters({
  dataset,
  filter,
  setFilter,
  leagues = true,
}: {
  dataset: MetaDataset
  filter: MetaFilter
  setFilter: (f: MetaFilter) => void
  leagues?: boolean
}) {
  const { t } = useI18n()
  // the in-person leagues: the online league is a kind of tournament of its own
  const names = useMemo(
    () =>
      [
        ...new Set(
          dataset.tournaments.filter((x) => x.kind === 'league' && x.league && (!filter.season || x.season === filter.season)).map((x) => x.league!),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [dataset, filter.season],
  )
  // a filter saved when the online league was also in the league picker
  const onlineLeague = !!filter.league && dataset.tournaments.some((x) => x.kind === 'online' && x.league === filter.league)
  useEffect(() => {
    if (onlineLeague) setFilter({ ...filter, kind: 'online', league: '' })
  }, [onlineLeague, filter, setFilter])
  return (
    <div className="filters wrap">
      <div className="seg">
        {(['', 's1', 's2'] as const).map((s) => (
          <button key={s} className={filter.season === s ? 'on' : ''} onClick={() => setFilter({ ...filter, season: s })}>
            {s ? s.toUpperCase() : dataset.year}
          </button>
        ))}
      </div>
      <select
        className="select-pill"
        value={filter.kind}
        onChange={(e) => setFilter({ ...filter, kind: e.target.value as MetaFilter['kind'], league: '' })}
        aria-label={t('meta.kind')}
      >
        <option value="">{t('meta.allKinds')}</option>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`meta.kind.${k}`)}
          </option>
        ))}
      </select>
      <select
        className="select-pill"
        value={filter.minPlayers ?? 0}
        onChange={(e) => setFilter({ ...filter, minPlayers: +e.target.value })}
        aria-label={t('meta.minPlayers')}
      >
        {MIN_PLAYERS.map((n) => (
          <option key={n} value={n}>
            {n ? t('meta.minPlayersN', { n }) : t('meta.anySize')}
          </option>
        ))}
      </select>
      {leagues && (filter.kind === '' || filter.kind === 'league') && (
        <select
          className="select-pill"
          value={names.includes(filter.league) ? filter.league : ''}
          onChange={(e) => setFilter({ ...filter, league: e.target.value })}
          aria-label={t('circuit.league')}
        >
          <option value="">{t('circuit.allLeagues')}</option>
          {names.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export default function Meta({
  banner,
  dataset,
  status,
  onRefresh,
  circuit,
  circuitStatus,
  onCircuitRefresh,
  prefs,
  openPlayer,
  openEvent,
  openLeague,
  openCommander,
}: {
  banner?: React.ReactNode
  dataset: MetaDataset | null
  status: Status
  onRefresh: () => void
  circuit: Circuit | null
  circuitStatus: Status
  onCircuitRefresh: () => void
  prefs: CircuitPrefs
  openPlayer: (key: string) => void
  openEvent: (id: string) => void
  openLeague: (season: string, name: string) => void
  openCommander: (name: string) => void
}) {
  const { t, lang } = useI18n()
  const [mode, setMode] = useStoredState<'decks' | 'circuit'>(META_MODE_KEY, 'decks')
  const [filter, setFilter] = useStoredState<MetaFilter>(META_FILTER_KEY, ALL)
  const [q, setQ] = useState('')
  const [sort, setSort] = useStoredState<Sort>('cc.meta.sort', 'share')
  const [minGames, setMinGames] = useStoredState('cc.meta.minGames', 20)

  const meta = useMemo(() => (dataset ? aggregate(dataset, filter) : null), [dataset, filter])
  const summary = useMemo(() => metaSummary(meta?.decks ?? [], minGames), [meta, minGames])
  // decks matching the search, before the min games threshold: tells "nothing found" from "all below the threshold"
  const found = useMemo(() => {
    const nq = normName(q)
    return (meta?.decks ?? []).filter((d) => !nq || normName(d.name).includes(nq))
  }, [meta, q])
  const list = useMemo(() => {
    return found
      .filter((d) => d.games >= minGames)
      .sort((a, b) =>
        sort === 'wr'
          ? winrate(b) - winrate(a) || b.games - a.games
          : sort === 'games'
            ? b.games - a.games
            : b.entries - a.entries || winrate(b) - winrate(a),
      )
  }, [found, sort, minGames])
  const maxShare = Math.max(...list.map((d) => d.share), 0.01)
  const refreshing = mode === 'decks' ? status : circuitStatus

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t('meta.title')}</h1>
        <button className="icon-btn" onClick={mode === 'decks' ? onRefresh : onCircuitRefresh} disabled={refreshing === 'loading'} aria-label={t('meta.refresh')}>
          <span className={refreshing === 'loading' ? 'spin' : ''}>
            <Icon name="refresh" />
          </span>
        </button>
      </header>

      <div className="mode-tabs" role="tablist">
        {(['decks', 'circuit'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            <Icon name={m === 'decks' ? 'pie' : 'trophy'} size={20} />
            {t(m === 'decks' ? 'circuit.modeDecks' : 'circuit.modeCircuit')}
          </button>
        ))}
      </div>

      {mode === 'circuit' ? (
        <>
          <LiveStatus circuit={circuit} status={circuitStatus} />
          {banner}
          {circuit && (
            <CircuitPanel
              circuit={circuit}
              dataset={dataset}
              prefs={prefs}
              openPlayer={openPlayer}
              openEvent={openEvent}
              openLeague={openLeague}
              openCommander={openCommander}
            />
          )}
        </>
      ) : !dataset || !meta ? (
        <div className={`notice ${status === 'error' ? 'warn' : ''}`}>{t(status === 'error' ? 'meta.error' : 'meta.loading')}</div>
      ) : (
        <>
          {status === 'error' && <div className="notice warn">{t('meta.offline')}</div>}
          <MetaFilters dataset={dataset} filter={filter} setFilter={setFilter} />

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
                <div className="stat-label">{t('meta.commanders')}</div>
              </div>
              <div>
                <div className="stat-num">{meta.entries}</div>
                <div className="stat-label">{t('meta.entries')}</div>
              </div>
              <div>
                <div className="stat-num">{meta.tournaments}</div>
                <div className="stat-label">{t('meta.tournaments')}</div>
              </div>
            </div>
            {summary.mostPlayed && (
              <p className="summary-text">
                {t('meta.mostPlayedText', { mp: shortName(summary.mostPlayed.name), mps: pct(summary.mostPlayed.share) })}
                {summary.best && ` ${t('meta.bestText', { min: minGames, best: shortName(summary.best.name), bwr: pct(winrate(summary.best)) })}`}
              </p>
            )}
          </section>

          <div className="search">
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('meta.search')} />
          </div>

          <div className="filters">
            <div className="seg">
              {(['share', 'wr', 'games'] as Sort[]).map((s) => (
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
              return (
                <li key={d.id} className="meta-row" onClick={() => openCommander(d.name)}>
                  <div className="meta-main">
                    <span className="rank">{i + 1}</span>
                    <div className="meta-name">
                      <div className="name-line">
                        <span className="ellipsis">{shortName(d.name)}</span>
                      </div>
                      <div className="sub-line">
                        <Pips colors={d.colors} size={10} />
                        <span className="muted small">
                          {sort === 'games' ? t('meta.nGames', { n: d.games }) : t('meta.nEntries', { n: d.entries })} ·{' '}
                          {t('meta.nPlayers', { n: d.players })}
                        </span>
                      </div>
                      <div className="share-bar">
                        <span style={{ width: `${(d.share / maxShare) * 100}%` }} />
                      </div>
                    </div>
                    <div className="meta-val">
                      {sort === 'wr' ? (
                        <>
                          <b className={`wr ${wrClass(wr)}`}>{pct(wr)}</b>
                          <span className="muted">{pct(d.share)}</span>
                        </>
                      ) : (
                        <>
                          <b>{pct(d.share)}</b>
                          <span className={`wr ${wrClass(wr)}`}>{d.games ? `WR ${pct(wr)}` : '—'}</span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
            {!list.length && !found.length && <li className="empty">{t('meta.noResults')}</li>}
            {!list.length && found.length > 0 && (
              <li className="empty">
                <p>{t('meta.noneAboveMin', { min: minGames, max: Math.max(...found.map((d) => d.games)) })}</p>
                <button className="btn" onClick={() => setMinGames(0)}>
                  {t('meta.showAll')}
                </button>
              </li>
            )}
          </ol>
          {minGames > 0 && list.length > 0 && <p className="muted small center">{t('meta.minNote', { n: minGames })}</p>}
        </>
      )}
    </div>
  )
}
