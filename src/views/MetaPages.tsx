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
import type { Circuit, CircuitEvent, Player } from '../lib/circuit'
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
    // one list per player, the most recent: popular commanders have dozens
    const seen = new Set<string>()
    const lists = rows
      .filter((e) => e.list)
      .sort((a, b) => (tour(b).date ?? '').localeCompare(tour(a).date ?? ''))
      .filter((e) => {
        const k = e.key ?? e.list!
        return !seen.has(k) && !!seen.add(k)
      })
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
  const hasLeague = x.kind === 'league' && !!circuit

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
          {t('meta.leaguePage', { l: `${x.league} ${x.season.toUpperCase()}` })}
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

// ---------- player ----------

/** A player's record over every tournament of the meta, overall and with each commander. */
export function PlayerDecks({
  dataset,
  entries,
  openCommander,
}: {
  dataset: MetaDataset
  entries: MetaEntry[]
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  const rec = recordOf(entries)
  const by = new Map<number, MetaEntry[]>()
  entries.forEach((e) => e.cmd >= 0 && by.set(e.cmd, [...(by.get(e.cmd) ?? []), e]))
  const cmds = [...by]
    .map(([id, list]) => ({ c: dataset.commanders[id], n: list.length, rec: recordOf(list) }))
    .sort((a, b) => b.n - a.n || winrate(b.rec) - winrate(a.rec))
  return (
    <section className="card">
      <div className="card-title">
        {t('meta.playerDecks')}
        <span className="muted small">{t('meta.nTournaments', { n: entries.length })}</span>
      </div>
      <div className="stats3">
        <div>
          <div className={`stat-num ${rec.games ? wrClass(winrate(rec)) : ''}`}>{rec.games ? pct(winrate(rec), 0) : '—'}</div>
          <div className="stat-label">Winrate</div>
        </div>
        <div>
          <div className="stat-num">{rec.games ? fmtRec(rec) : '—'}</div>
          <div className="stat-label">{t('meta.wld')}</div>
        </div>
        <div>
          <div className="stat-num">{cmds.length}</div>
          <div className="stat-label">{t('meta.commanders')}</div>
        </div>
      </div>
      {cmds.length > 0 && (
        <ul className="mini-list">
          {cmds.map(({ c, n, rec: r }) => (
            <li key={c.id} className="clickable" onClick={() => openCommander(c.name)}>
              <Pips colors={c.colors} size={9} />
              <span className="ellipsis grow">
                {shortName(c.name)} <span className="muted small">· {t('meta.nTournaments', { n })}</span>
              </span>
              {r.games > 0 && (
                <>
                  <span className="rec-inline">{fmtRec(r)}</span>
                  <b className={`wr small-wr ${wrClass(winrate(r))}`}>{pct(winrate(r), 0)}</b>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <span className="muted small">{t('meta.byeNote')}</span>
    </section>
  )
}

const SHOW_HISTORY = 10
const isoOf = (e: CircuitEvent) => (e.year && e.month ? `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day ?? 1).padStart(2, '0')}` : '')

/**
 * Every tournament of a player, newest first: events and league stages with deck and record, plus the circuit
 * events that have no sheet in the meta (only their points).
 */
export function PlayerHistory({
  dataset,
  entries,
  circuit,
  player,
  openTournament,
  openEvent,
}: {
  dataset: MetaDataset | null
  entries: MetaEntry[]
  circuit: Circuit | null
  player?: Player
  openTournament: (id: string) => void
  openEvent: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const [all, setAll] = useState(false)
  const items = useMemo(() => {
    const evByName = new Map(circuit?.events.map((e) => [e.name, e]))
    const linked = new Set<string>()
    const list = entries.map((e) => {
      const x = dataset!.tournaments[e.t]
      const ev = x.circuit ? evByName.get(x.circuit.replace(/\s+/g, ' ').trim()) : undefined
      if (ev) linked.add(ev.id)
      return { date: x.date ?? '', e, x, pe: ev && player?.events.find((pe) => pe.eventId === ev.id) }
    })
    const rest = (player?.events ?? [])
      .filter((pe) => !linked.has(pe.eventId))
      .map((pe) => ({ pe, ev: circuit!.events.find((e) => e.id === pe.eventId)! }))
      .map(({ pe, ev }) => ({ date: isoOf(ev), pe, ev }))
    return [...list, ...rest].sort((a, b) => b.date.localeCompare(a.date))
  }, [dataset, entries, circuit, player])
  if (!items.length) return null

  return (
    <section className="group">
      <div className="group-title">{t('meta.played')}</div>
      <ul className="card-list">
        {(all ? items : items.slice(0, SHOW_HISTORY)).map((it, i) => {
          const pts = it.pe && (it.pe.poty ? <PotyTag invited /> : <b className="pts-inline">+{it.pe.points}</b>)
          if ('e' in it) {
            const c = it.e.cmd >= 0 ? dataset!.commanders[it.e.cmd] : null
            return (
              <li key={i} className="event-row" onClick={() => openTournament(it.x.id)}>
                <PlaceBadge place={it.e.place} event={isEvent(it.x)} />
                <div className="event-main">
                  <span className="ellipsis">{tournamentLabel(it.x, t)}</span>
                  <span className="muted small cmd-link">
                    <span>{dateLabel(it.x, lang, t)} ·</span>
                    <span className="ellipsis">{c ? shortName(c.name) : t('meta.noCommander')}</span>
                    {it.e.w != null && <span className="rec-tail">· {fmtRec(recordOf([it.e]))}</span>}
                  </span>
                </div>
                {pts}
              </li>
            )
          }
          return (
            <li key={i} className="event-row" onClick={() => openEvent(it.ev.id)}>
              <span className={`place-badge ${it.pe.place ? (it.pe.place <= 4 ? 'top4' : 'top8') : ''}`}>
                {it.pe.place ? placeLabel(it.pe.place, lang) : '—'}
              </span>
              <div className="event-main">
                <span className="ellipsis">{it.ev.name}</span>
                <span className="muted small">{t('circuit.nPlayers', { n: it.ev.players })}</span>
              </div>
              {pts}
            </li>
          )
        })}
        {items.length > SHOW_HISTORY && (
          <li className="event-row more" onClick={() => setAll(!all)}>
            {all ? t('meta.showLess') : t('meta.allTournaments', { n: items.length })}
          </li>
        )}
      </ul>
    </section>
  )
}

// ---------- league ----------

/** A league's stages, newest first, with the winner and their deck. */
export function LeagueStages({
  dataset,
  season,
  league,
  openTournament,
}: {
  dataset: MetaDataset
  season: string
  league: string
  openTournament: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const stages = dataset.tournaments.filter((x) => x.season === season && x.league === league).sort((a, b) => (b.stage ?? 0) - (a.stage ?? 0))
  if (!stages.length) return <div className="notice">{t('meta.noStages')}</div>
  return (
    <ul className="card-list">
      {stages.map((x) => {
        const win = dataset.entries.find((e) => e.t === x.index && e.place === 1)
        const c = win && win.cmd >= 0 ? dataset.commanders[win.cmd] : null
        return (
          <li key={x.id} className="event-row" onClick={() => openTournament(x.id)}>
            <span className="place-badge">{x.stage}</span>
            <div className="event-main">
              <span className="ellipsis">
                {dateLabel(x, lang, t)} · {t('circuit.nPlayers', { n: x.players })}
              </span>
              {win && (
                <span className="muted small ellipsis">
                  {t('meta.winner', { p: win.player ?? '—' })}
                  {c && ` · ${shortName(c.name)}`}
                </span>
              )}
            </div>
            <Icon name="chevron" size={16} />
          </li>
        )
      })}
    </ul>
  )
}

/** The commanders most played in a league, with their share and winrate there. */
export function LeagueMeta({
  dataset,
  season,
  league,
  openCommander,
}: {
  dataset: MetaDataset
  season: string
  league: string
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  const meta = aggregate(dataset, { season: season as MetaFilter['season'], kind: '', league })
  if (!meta.decks.length) return <div className="notice">{t('meta.noStages')}</div>
  const max = meta.decks[0].share
  return (
    <>
      <p className="muted small">{t('meta.leagueMetaNote', { e: meta.entries, n: meta.tournaments })}</p>
      <ol className="meta-list">
        {meta.decks.map((d, i) => (
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
                    {t('meta.nEntries', { n: d.entries })} · {t('meta.nPlayers', { n: d.players })}
                  </span>
                </div>
                <div className="share-bar">
                  <span style={{ width: `${(d.share / max) * 100}%` }} />
                </div>
              </div>
              <div className="meta-val">
                <b>{pct(d.share)}</b>
                <span className={`wr ${wrClass(winrate(d))}`}>{d.games ? `WR ${pct(winrate(d))}` : '—'}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

// ---------- deck records (the circuit's Records view) ----------

const MIN_GAMES_RECORD = 40

export function DeckRecords({ dataset, openCommander }: { dataset: MetaDataset; openCommander: (name: string) => void }) {
  const { t } = useI18n()
  const recs = useMemo(() => {
    const meta = aggregate(dataset, ALL)
    const count = (pick: (e: MetaEntry) => boolean) => {
      const n = new Map<number, number>()
      dataset.entries.forEach((e) => e.cmd >= 0 && pick(e) && n.set(e.cmd, (n.get(e.cmd) ?? 0) + 1))
      return meta.decks.map((d) => ({ d, v: n.get(d.id) ?? 0 })).filter((x) => x.v > 0)
    }
    return [
      { id: 'wins', list: count((e) => e.place === 1), fmt: String },
      { id: 'top8', list: count((e) => isEvent(dataset.tournaments[e.t]) && e.place <= 8), fmt: String },
      { id: 'wr', list: meta.decks.filter((d) => d.wins + d.losses >= MIN_GAMES_RECORD).map((d) => ({ d, v: winrate(d) })), fmt: (v: number) => pct(v) },
      { id: 'players', list: meta.decks.map((d) => ({ d, v: d.players })), fmt: String },
    ] as const
  }, [dataset])
  return (
    <>
      {recs.map((r) => {
        const ranked = [...r.list].sort((a, b) => b.v - a.v || b.d.entries - a.d.entries).slice(0, 5)
        return (
          <section key={r.id} className="card record">
            <div className="card-title">{t(`meta.rec.${r.id}`)}</div>
            {r.id === 'wr' && <p className="muted small no-margin">{t('meta.rec.wrMin', { n: MIN_GAMES_RECORD })}</p>}
            <ol className="mini-list">
              {ranked.map(({ d, v }, i) => (
                <li key={d.id} onClick={() => openCommander(d.name)}>
                  <span className="rank">{i + 1}</span>
                  <span className="ellipsis grow">{shortName(d.name)}</span>
                  <Pips colors={d.colors} size={9} />
                  <b className="pts-inline">{r.fmt(v)}</b>
                </li>
              ))}
            </ol>
          </section>
        )
      })}
    </>
  )
}

/** The Moxfield lists a player submitted, one row per list (the same list is often used at several tournaments). */
export function PlayerLists({ dataset, entries }: { dataset: MetaDataset; entries: MetaEntry[] }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const lists = useMemo(() => {
    const by = new Map<string, MetaEntry[]>()
    entries.forEach((e) => e.list && by.set(e.list, [...(by.get(e.list) ?? []), e]))
    const date = (e: MetaEntry) => dataset.tournaments[e.t].date ?? ''
    return [...by]
      .map(([url, list]) => ({ url, list: list.sort((a, b) => date(b).localeCompare(date(a))) }))
      .sort((a, b) => date(b.list[0]).localeCompare(date(a.list[0])))
  }, [dataset, entries])
  if (!lists.length) return null
  return (
    <section className="group">
      <button className="btn" onClick={() => setOpen(!open)}>
        {t('meta.lists', { n: lists.length })}
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <ul className="card-list">
          {lists.map(({ url, list }) => {
            const last = list[0]
            const x = dataset.tournaments[last.t]
            const c = last.cmd >= 0 ? dataset.commanders[last.cmd] : null
            return (
              <li key={url}>
                <a className="event-row" href={url} target="_blank" rel="noreferrer">
                  <div className="event-main">
                    <span className="ellipsis">
                      {c && <Pips colors={c.colors} size={9} />} {c ? shortName(c.name) : t('meta.noCommander')}
                    </span>
                    <span className="muted small ellipsis">
                      {list.length > 1 ? `${t('meta.usedAt', { n: list.length })} ` : ''}
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
  )
}
