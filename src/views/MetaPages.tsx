import { useMemo, useState } from 'react'
import { type T, useI18n } from '../i18n'
import {
  type MetaDataset,
  type MetaEntry,
  type MetaFilter,
  type MetaTournament,
  ALL,
  aggregate,
  entriesOf,
  findMetaDeck,
  recordOf,
  shortName,
  wilson,
  winrate,
} from '../lib/meta'
import type { Deck } from '../lib/decks'
import { useStoredState } from '../lib/storage'
import { Icon, Pips, pct, wrClass } from '../components/ui'
import { META_FILTER_KEY, MetaFilters } from './Meta'
import { type CircuitPrefs, PotyTag, SubPageShell, VerifiedTick, placeLabel } from './Circuit'
import type { Circuit, CircuitEvent } from '../lib/circuit'
import { commanderNames } from './Decks'

// Pages built on the tournament data: a commander's page, and the shared bits (tournament labels, records)
// the player, event and league pages use.

export const isEvent = (x: MetaTournament) => x.kind === 'l1' || x.kind === 'l2'

/** "Albisola · LV2", "Savona S2 · tappa 7", "Lega Online · tappa 3" */
export function tournamentLabel(x: MetaTournament, t: T) {
  if (isEvent(x)) return `${x.name} · ${x.kind.toUpperCase().replace('L', 'LV')}`
  const league = x.kind === 'online' ? x.league : `${x.league} ${x.season.toUpperCase()}`
  return `${league} · ${t('meta.stage', { n: x.stage ?? '?' })}`
}

export const dateLabel = (x: MetaTournament, lang: string, t: T) =>
  x.date ? new Date(`${x.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' }) : t('meta.noDate')

export const fmtRec = (r: { wins: number; losses: number; draws: number }) => `${r.wins}-${r.losses}-${r.draws}`

/** Front face of the first commander: its art for the page header. */
const artUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name.split(' / ')[0].split(' // ')[0])}&format=image&version=art_crop`

/** A place badge: gold for the top 4, light gold for the top 8 of an event (a stage has no top 8, only its winner). */
export function PlaceBadge({ place, event }: { place: number; event: boolean }) {
  const { lang } = useI18n()
  const cls = place <= (event ? 4 : 1) ? 'top4' : event && place <= 8 ? 'top8' : ''
  return <span className={`place-badge ${cls}`}>{placeLabel(place, lang)}</span>
}

// ---------- commander ----------

const SHOW = 5

export function CommanderPage({
  dataset,
  name,
  decks,
  onBack,
  openPlayer,
  openTournament,
  openDeck,
}: {
  dataset: MetaDataset | null
  name: string
  decks: Deck[]
  onBack: () => void
  openPlayer: (key: string) => void
  openTournament: (id: string) => void
  openDeck: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const [filter, setFilter] = useStoredState<MetaFilter>(META_FILTER_KEY, ALL)
  const [allPlayers, setAllPlayers] = useState(false)
  const [allResults, setAllResults] = useState(false)
  const [showLists, setShowLists] = useState(false)
  const cmd = dataset?.commanders.find((c) => c.name === name)

  const view = useMemo(() => {
    if (!dataset || !cmd) return null
    const meta = aggregate(dataset, filter)
    const rank = meta.decks.findIndex((d) => d.id === cmd.id)
    const rows = entriesOf(dataset, filter).filter((e) => e.cmd === cmd.id)
    const tour = (e: MetaEntry) => dataset.tournaments[e.t]
    const byPlayer = new Map<string, MetaEntry[]>()
    rows.forEach((e) => e.key && byPlayer.set(e.key, [...(byPlayer.get(e.key) ?? []), e]))
    const players = [...byPlayer.values()]
      .map((list) => ({ key: list[0].key!, name: list[0].player!, n: list.length, rec: recordOf(list) }))
      .sort((a, b) => b.n - a.n || winrate(b.rec) - winrate(a.rec))
    const results = rows
      .filter((e) => (isEvent(tour(e)) ? e.place <= 8 : e.place === 1))
      .sort((a, b) => +isEvent(tour(b)) - +isEvent(tour(a)) || a.place - b.place || (tour(b).date ?? '').localeCompare(tour(a).date ?? ''))
    const lists = rows.filter((e) => e.list).sort((a, b) => (tour(b).date ?? '').localeCompare(tour(a).date ?? ''))
    const byKind = (['league', 'l1', 'l2', 'online'] as const)
      .map((k) => {
        const list = rows.filter((e) => tour(e).kind === k)
        return { k, n: list.length, rec: recordOf(list) }
      })
      .filter((x) => x.n)
    return {
      deck: rank >= 0 ? meta.decks[rank] : null,
      rank: rank + 1,
      rows,
      players,
      results,
      lists,
      byKind,
      wins: rows.filter((e) => e.place === 1).length,
      top8: rows.filter((e) => isEvent(tour(e)) && e.place <= 8).length,
      months: monthlyShare(dataset, filter, cmd.id),
    }
  }, [dataset, cmd, filter])

  if (!dataset || !cmd || !view) return <SubPageShell title={name} onBack={onBack} />
  const { deck } = view
  const mine = deck ? decks.filter((d) => findMetaDeck([deck], commanderNames(d))) : []
  const [lo, hi] = deck ? wilson(deck.wins, deck.wins + deck.losses) : [0, 0]

  return (
    <div className="page deck-page">
      <div className="deck-hero" style={{ backgroundImage: `url("${artUrl(cmd.name)}")` }}>
        <div className="deck-hero-shade" />
        <div className="deck-hero-top">
          <button className="icon-btn on-image" onClick={onBack} aria-label="back">
            <Icon name="back" />
          </button>
        </div>
        <div className="deck-hero-body">
          <h1 className="sub-title">{cmd.name}</h1>
          <div className="sub-line">
            <Pips colors={cmd.colors} size={12} />
          </div>
        </div>
      </div>

      <MetaFilters dataset={dataset} filter={filter} setFilter={setFilter} />

      {!deck ? (
        <div className="notice">{t('meta.noEntries')}</div>
      ) : (
        <>
          <section className="card">
            <div className="stats3">
              <div>
                <div className="stat-num">{pct(deck.share)}</div>
                <div className="stat-label">{t('meta.shareRank', { r: view.rank })}</div>
              </div>
              <div>
                <div className={`stat-num ${deck.games ? wrClass(winrate(deck)) : ''}`}>{deck.games ? pct(winrate(deck)) : '—'}</div>
                <div className="stat-label">Winrate</div>
              </div>
              <div>
                <div className="stat-num">{deck.entries}</div>
                <div className="stat-label">{t('meta.entries')}</div>
              </div>
            </div>
            <div className="stats3">
              <div>
                <div className="stat-num">{deck.players}</div>
                <div className="stat-label">{t('meta.players')}</div>
              </div>
              <div>
                <div className="stat-num">{view.wins}</div>
                <div className="stat-label">{t('meta.won')}</div>
              </div>
              <div>
                <div className="stat-num">{view.top8}</div>
                <div className="stat-label">{t('meta.top8Events')}</div>
              </div>
            </div>
            {deck.games > 0 && (
              <>
                <div className="kv">
                  <span>{t('meta.wld')}</span>
                  <b>{fmtRec(deck)}</b>
                </div>
                <div className="kv">
                  <span>{t('meta.draws')}</span>
                  <b>{pct(deck.draws / deck.games)}</b>
                </div>
                <div className="kv">
                  <span>{t('meta.ci')}</span>
                  <b>
                    {pct(lo, 0)} – {pct(hi, 0)}
                  </b>
                </div>
                {deck.wins + deck.losses < 30 && <div className="muted small">{t('meta.lowSample')}</div>}
              </>
            )}
          </section>

          {view.byKind.length > 1 && (
            <section className="card">
              <div className="card-title">{t('meta.byKind')}</div>
              {view.byKind.map(({ k, n, rec }) => (
                <div key={k} className="kv">
                  <span>
                    {t(`meta.kind.${k}`)} · {t('meta.nEntries', { n })}
                  </span>
                  <b className={rec.games ? wrClass(winrate(rec)) : ''}>{rec.games ? pct(winrate(rec)) : '—'}</b>
                </div>
              ))}
            </section>
          )}

          {view.months.length > 1 && (
            <section className="card">
              <div className="card-title">{t('meta.byMonth')}</div>
              <ShareChart months={view.months} />
            </section>
          )}

          {mine.length > 0 && (
            <ul className="card-list">
              {mine.map((d) => (
                <li key={d.id} className="event-row" onClick={() => openDeck(d.id)}>
                  <Icon name="decks" size={18} />
                  <span className="ellipsis grow">{t('meta.yourDeck', { d: d.name })}</span>
                  <Icon name="chevron" size={16} />
                </li>
              ))}
            </ul>
          )}

          {view.players.length > 0 && (
            <section className="group">
              <div className="group-title">{t('meta.whoPlays')}</div>
              <ul className="card-list">
                {(allPlayers ? view.players : view.players.slice(0, SHOW)).map((p) => (
                  <li key={p.key} className="event-row" onClick={() => openPlayer(p.key)}>
                    <div className="event-main">
                      <span className="ellipsis">{p.name}</span>
                      <span className="muted small">{t('meta.nTournaments', { n: p.n })}</span>
                    </div>
                    {p.rec.games > 0 && (
                      <>
                        <span className="rec-inline">{fmtRec(p.rec)}</span>
                        <b className={`wr ${wrClass(winrate(p.rec))}`}>{pct(winrate(p.rec), 0)}</b>
                      </>
                    )}
                  </li>
                ))}
                {view.players.length > SHOW && (
                  <li className="event-row more" onClick={() => setAllPlayers(!allPlayers)}>
                    {allPlayers ? t('meta.showLess') : t('meta.allPlayers', { n: view.players.length })}
                  </li>
                )}
              </ul>
            </section>
          )}

          {view.results.length > 0 && (
            <section className="group">
              <div className="group-title">{t('meta.bestResults')}</div>
              <ul className="card-list">
                {(allResults ? view.results : view.results.slice(0, SHOW)).map((e, i) => {
                  const x = dataset.tournaments[e.t]
                  return (
                    <li key={i} className="event-row" onClick={() => openTournament(x.id)}>
                      <PlaceBadge place={e.place} event={isEvent(x)} />
                      <div className="event-main">
                        <span className="ellipsis">{tournamentLabel(x, t)}</span>
                        <span className="muted small">
                          {dateLabel(x, lang, t)} · {t('circuit.nPlayers', { n: x.players })}
                          {e.player && ` · ${e.player}`}
                        </span>
                      </div>
                    </li>
                  )
                })}
                {view.results.length > SHOW && (
                  <li className="event-row more" onClick={() => setAllResults(!allResults)}>
                    {allResults ? t('meta.showLess') : t('meta.allResults', { n: view.results.length })}
                  </li>
                )}
              </ul>
            </section>
          )}

          {view.lists.length > 0 && (
            <section className="group">
              <button className="btn" onClick={() => setShowLists(!showLists)}>
                {t('meta.lists', { n: view.lists.length })}
                <Icon name="chevron" size={16} />
              </button>
              {showLists && (
                <ul className="card-list">
                  {view.lists.map((e, i) => {
                    const x = dataset.tournaments[e.t]
                    return (
                      <li key={i}>
                        <a className="event-row" href={e.list!} target="_blank" rel="noreferrer">
                          <div className="event-main">
                            <span className="ellipsis">{e.player ?? '—'}</span>
                            <span className="muted small">
                              {tournamentLabel(x, t)} · {dateLabel(x, lang, t)}
                            </span>
                          </div>
                          <Icon name="external" size={16} />
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ---------- share by month ----------

interface Month {
  month: string // YYYY-MM
  n: number
  total: number
}

/** The commander's share of the registered decks, month by month (tournaments without a date left out). */
function monthlyShare(ds: MetaDataset, f: MetaFilter, cmd: number): Month[] {
  const by = new Map<string, Month>()
  for (const e of entriesOf(ds, f)) {
    const d = ds.tournaments[e.t].date
    if (!d || e.cmd < 0) continue
    const month = d.slice(0, 7)
    const m = by.get(month) ?? { month, n: 0, total: 0 }
    m.total++
    if (e.cmd === cmd) m.n++
    by.set(month, m)
  }
  return [...by.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function ShareChart({ months }: { months: Month[] }) {
  const { t, lang } = useI18n()
  const [sel, setSel] = useState<number | null>(null)
  const W = 320
  const H = 120
  const pad = { l: 30, r: 8, t: 8, b: 18 }
  const v = (m: Month) => m.n / m.total
  const max = Math.max(...months.map(v), 0.05)
  const x = (i: number) => pad.l + (i / (months.length - 1)) * (W - pad.l - pad.r)
  const y = (s: number) => pad.t + (1 - s / max) * (H - pad.t - pad.b)
  const path = months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v(m)).toFixed(1)}`).join('')
  const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(lang, { month: 'short' })
  const s = sel !== null ? months[sel] : null
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('meta.byMonth')}>
        {[0, max / 2, max].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} className="grid" />
            <text x={pad.l - 4} y={y(g) + 3} className="axis" textAnchor="end">
              {pct(g, 0)}
            </text>
          </g>
        ))}
        <path d={path} className="line" />
        {months.map((m, i) => (
          <g key={m.month} onClick={() => setSel(sel === i ? null : i)}>
            <text x={x(i)} y={H - 4} className="axis" textAnchor="middle">
              {monthName(m.month)}
            </text>
            <circle cx={x(i)} cy={y(v(m))} r={12} className="hit" />
            <circle cx={x(i)} cy={y(v(m))} r={sel === i ? 5.5 : 3.5} className="dot" />
          </g>
        ))}
        {s && <line x1={x(sel!)} x2={x(sel!)} y1={pad.t} y2={H - pad.b} className="cross" />}
      </svg>
      <div className="chart-tip small">
        {s ? (
          <>
            <b>{monthName(s.month)}</b> · {pct(v(s))} · {t('meta.ofEntries', { n: s.n, total: s.total })}
          </>
        ) : (
          <span className="muted">{t('meta.chartHint')}</span>
        )}
      </div>
    </div>
  )
}

// ---------- tournament (an event, or a league stage) ----------

/** The meta tournament of a circuit event, matched on the event's title in the circuit sheet. */
export const tournamentOfEvent = (ds: MetaDataset | null, e: CircuitEvent) =>
  ds?.tournaments.find((x) => x.circuit && x.circuit.replace(/\s+/g, ' ').trim() === e.name)

export function TournamentPage({
  dataset,
  id,
  circuit,
  prefs,
  onBack,
  openPlayer,
  openCommander,
  openLeague,
}: {
  dataset: MetaDataset | null
  id: string
  circuit: Circuit | null
  prefs: CircuitPrefs
  onBack: () => void
  openPlayer: (key: string) => void
  openCommander: (name: string) => void
  openLeague: (season: string, name: string) => void
}) {
  const { t, lang } = useI18n()
  const x = dataset?.tournaments.find((y) => y.id === id)
  const view = useMemo(() => {
    if (!dataset || !x) return null
    const rows = dataset.entries.filter((e) => e.t === x.index)
    const counts = new Map<number, number>()
    rows.forEach((e) => e.cmd >= 0 && counts.set(e.cmd, (counts.get(e.cmd) ?? 0) + 1))
    const withCmd = [...counts.values()].reduce((s, n) => s + n, 0)
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5)
    const incomplete = rows.some((e) => e.w == null || e.cmd < 0)
    const ev = circuit?.events.find((e) => x.circuit && x.circuit.replace(/\s+/g, ' ').trim() === e.name)
    const points = new Map(ev?.results.map((r) => [r.key, r]))
    return { rows, top, withCmd, commanders: counts.size, incomplete, points }
  }, [dataset, x, circuit])
  if (!dataset || !x || !view) return <SubPageShell title="—" onBack={onBack} />
  const event = isEvent(x)
  const hasLeague = x.kind === 'league' && circuit?.leagues.some((l) => l.season === x.season && l.name === x.league)

  const row = (e: MetaEntry, i: number) => {
    const c = e.cmd >= 0 ? dataset.commanders[e.cmd] : null
    const pts = e.key ? view.points.get(e.key) : undefined
    return (
      <li key={i} className={`event-row ${e.key && e.key === prefs.me ? 'me' : ''}`} onClick={() => e.key && openPlayer(e.key)}>
        <PlaceBadge place={e.place} event={event} />
        <div className="event-main">
          <span className="ellipsis">
            {e.player ?? <span className="muted">{t('meta.anonymous')}</span>}
            {e.key && prefs.claims.has(e.key) && <VerifiedTick />}
          </span>
          <span
            className="muted small cmd-link"
            onClick={(ev) => {
              if (!c) return
              ev.stopPropagation()
              openCommander(c.name)
            }}
          >
            {c && <Pips colors={c.colors} size={9} />}
            <span className="ellipsis">{c ? shortName(c.name) : t('meta.noCommander')}</span>
            {e.w != null && <span className="rec-tail">· {fmtRec(recordOf([e]))}</span>}
            {e.bye && <span className="rec-tail">· {t('meta.bye')}</span>}
          </span>
        </div>
        {pts ? pts.poty ? <PotyTag invited /> : <b className="pts-inline">{pts.points}</b> : null}
      </li>
    )
  }

  return (
    <SubPageShell title={tournamentLabel(x, t)} onBack={onBack}>
      <div className="chips static">
        <span className="tag big">{x.date ? new Date(`${x.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) : t('meta.noDate')}</span>
        <span className="tag big">{t('circuit.nPlayers', { n: x.players })}</span>
        {view.incomplete && <span className="tag big warn">{t('meta.incomplete')}</span>}
      </div>

      {hasLeague && (
        <button className="btn" onClick={() => openLeague(x.season, x.league!)}>
          {t('meta.leagueRanking', { l: `${x.league} ${x.season.toUpperCase()}` })}
          <Icon name="chevron" size={16} />
        </button>
      )}

      {view.top.length > 0 && (
        <section className="card">
          <div className="card-title">
            {t('meta.tournamentMeta')}
            <span className="muted small">{t('meta.nCommanders', { n: view.commanders })}</span>
          </div>
          <ul className="mini-list">
            {view.top.map(([id, n]) => {
              const c = dataset.commanders[id]
              return (
                <li key={id} onClick={() => openCommander(c.name)} className="clickable">
                  <span className="ellipsis grow">{shortName(c.name)}</span>
                  <Pips colors={c.colors} size={9} />
                  <b className="pts-inline">
                    {n} · {pct(n / view.withCmd, 0)}
                  </b>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {event ? (
        <>
          <section className="group">
            <div className="group-title">Top 8</div>
            <ul className="card-list">{view.rows.slice(0, 8).map(row)}</ul>
          </section>
          {view.rows.length > 8 && (
            <section className="group">
              <div className="group-title">{t('circuit.participants', { n: view.rows.length - 8 })}</div>
              <ul className="card-list">{view.rows.slice(8).map((e, i) => row(e, i + 8))}</ul>
            </section>
          )}
        </>
      ) : (
        <section className="group">
          <div className="group-title">{t('meta.standings')}</div>
          <ul className="card-list">{view.rows.map(row)}</ul>
        </section>
      )}
    </SubPageShell>
  )
}
