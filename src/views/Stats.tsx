import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import type { Deck } from '../lib/decks'
import { type Match, type Record3, fmtRecord, groupBy, record, resultLabel } from '../lib/matches'
import { useLongPress } from '../lib/longPress'
import { commanderNames } from './Decks'
import { type MetaDeck, findMetaDeck, normName, shortName, winrate } from '../lib/meta'
import { Icon, Sheet, pct, wrClass } from '../components/ui'
import { RecordMatch } from '../components/RecordMatch'
import { useDialog } from '../components/Dialog'
import { useStoredState } from '../lib/storage'
import { useWide } from '../lib/wide'

type Filter = 'all' | Match['kind']
type Period = 'all' | '30' | '90' | 'year'
type FormatFilter = 'all' | 'bo1' | 'bo3'
const TREND_WINDOW = 10
const MIN_FOR_TREND = 5

export function ResultDots({ matches, n = 10 }: { matches: Match[]; n?: number }) {
  const last = [...matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
  return (
    <span className="res-dots">
      {last.map((m) => (
        <span key={m.id} className={`res-dot res-${m.result}`} title={m.result} />
      ))}
    </span>
  )
}

function HistoryRow({ m, deckName, onLongPress, more }: { m: Match; deckName: string; onLongPress: () => void; more?: boolean }) {
  const { t, lang } = useI18n()
  const press = useLongPress(() => {}, onLongPress)
  return (
    <li className="stat-row history" {...press}>
      <span className={`res-badge res-${m.result}`}>{resultLabel(m)}</span>
      <span className="grow hist-main">
        <span className="ellipsis">
          {deckName} <span className="muted">vs</span> {m.opponent || '—'}
          {m.opponentName && <span className="muted"> ({m.opponentName})</span>}
        </span>
        <span className="muted small">
          {new Date(m.date).toLocaleDateString(lang)} · {m.format === 'bo3' ? 'Bo3' : 'Bo1'} ·{' '}
          {m.start ? `${m.start === 'play' ? 'OTP' : 'OTD'} · ` : ''}
          {t(m.kind === 'tournament' ? 'match.tournament' : 'match.casual')}
          {m.durationMin ? ` · ${m.durationMin}′` : ''}
          {m.notes ? ` · ${m.notes}` : ''}
        </span>
      </span>
      {/* a desktop has no press-and-hold: the actions get their own button */}
      {more && (
        <button
          className="icon-btn more-btn"
          onClick={(e) => {
            e.stopPropagation()
            onLongPress()
          }}
          aria-label={t('stats.matchActions')}
        >
          <Icon name="more" size={18} />
        </button>
      )}
    </li>
  )
}

/** Winrate over the last TREND_WINDOW matches, after each match: does the form go up or down. */
function TrendChart({ matches }: { matches: Match[] }) {
  const { t, lang } = useI18n()
  const [sel, setSel] = useState<number | null>(null)
  const chrono = [...matches].sort((a, b) => a.date.localeCompare(b.date))
  const pts = chrono.map((m, i) => {
    const win = chrono.slice(Math.max(0, i + 1 - TREND_WINDOW), i + 1)
    return { m, i, wr: record(win).wr, n: win.length }
  })
  const W = 320
  const H = 120
  const pad = { l: 30, r: 8, t: 8, b: 10 }
  const n = pts.length
  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * (W - pad.l - pad.r) : 0)
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b)
  const path = pts.map((d) => `${d.i ? 'L' : 'M'}${x(d.i).toFixed(1)},${y(d.wr).toFixed(1)}`).join('')
  const s = sel !== null ? pts[sel] : null
  // tapping anywhere picks the nearest match
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))
    setSel(Math.min(n - 1, Math.max(0, i)))
  }
  return (
    <section className="card">
      <div className="card-title">
        {t('stats.trend')}
        <span className="muted small">{t('stats.trendWindow', { n: TREND_WINDOW })}</span>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('stats.trend')} onPointerDown={pick}>
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0.5 ? 'grid mid' : 'grid'} />
              <text x={pad.l - 4} y={y(v) + 3} className="axis" textAnchor="end">
                {v * 100}%
              </text>
            </g>
          ))}
          <path d={path} className="line" />
          {s && (
            <>
              <line x1={x(s.i)} x2={x(s.i)} y1={pad.t} y2={H - pad.b} className="cross" />
              <circle cx={x(s.i)} cy={y(s.wr)} r={5} className="dot" />
            </>
          )}
          <circle cx={x(n - 1)} cy={y(pts[n - 1].wr)} r={4} className="dot" />
        </svg>
        <div className="chart-tip small">
          {s ? (
            <>
              <b>{pct(s.wr, 0)}</b> {t('stats.trendOver', { n: s.n })} · {new Date(s.m.date).toLocaleDateString(lang, { day: 'numeric', month: 'short' })} ·{' '}
              {s.m.deckName} vs {s.m.opponent || '—'} ({resultLabel(s.m)})
            </>
          ) : (
            <span className="muted">{t('stats.trendHint')}</span>
          )}
        </div>
      </div>
    </section>
  )
}

function RecordCells({ rec }: { rec: Record3 }) {
  return (
    <>
      <span className="muted small rec">{fmtRecord(rec)}</span>
      <span className={`wr small-wr ${wrClass(rec.wr)}`}>{pct(rec.wr, 0)}</span>
    </>
  )
}

export default function Stats({
  matches,
  setMatches,
  decks,
  metaDecks,
  players,
  openPlayer,
  openCommander,
}: {
  matches: Match[]
  setMatches: (fn: (m: Match[]) => Match[]) => void
  decks: Deck[]
  metaDecks: MetaDeck[]
  players?: { key: string; name: string }[]
  openPlayer: (key: string) => void
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const wide = useWide()
  const [filter, setFilter] = useStoredState<Filter>('cc.stats.kind', 'all')
  const [period, setPeriod] = useStoredState<Period>('cc.stats.period', 'all')
  const [format, setFormat] = useStoredState<FormatFilter>('cc.stats.format', 'all')
  const [openMatchup, setOpenMatchup] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [actions, setActions] = useState<Match | null>(null) // long-pressed match
  const [editing, setEditing] = useState<Match | null>(null)
  const shown = useMemo(() => {
    const now = new Date()
    const from =
      period === 'all' ? '' : period === 'year' ? new Date(now.getFullYear(), 0, 1).toISOString() : new Date(now.getTime() - Number(period) * 86_400_000).toISOString()
    return matches
      .filter((m) => filter === 'all' || m.kind === filter)
      .filter((m) => format === 'all' || (m.format ?? 'bo1') === format)
      .filter((m) => m.date >= from)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [matches, filter, period, format])
  const rec = record(shown)
  const deckName = (m: Match) => decks.find((d) => d.id === m.deckId)?.name ?? m.deckName
  // group by the current deck name when the deck still exists, so renames don't split the stats
  const byDeck = groupBy(shown, deckName)
  const byOpp = groupBy(shown, (m) => m.opponent)
  const byPlayer = groupBy(
    shown.filter((m) => m.opponentName),
    (m) => players?.find((p) => p.key === m.opponentPlayer)?.name ?? m.opponentName!,
  )
  const onPlay = record(shown.filter((m) => m.start === 'play'))
  const onDraw = record(shown.filter((m) => m.start === 'draw'))
  // a deck of mine by its commanders, an opponent by the name typed for it
  const metaOf = (name: string) => {
    const deck = decks.find((d) => d.name === name)
    const cmds = deck ? commanderNames(deck) : []
    return (cmds.length ? findMetaDeck(metaDecks, cmds) : undefined) ?? metaDecks.find((d) => normName(d.name) === normName(name)) ?? findMetaDeck(metaDecks, [name])
  }
  const filtered = filter !== 'all' || period !== 'all' || format !== 'all'

  return (
    <div className="page stats-page">
      <header className="page-head">
        <div className="head-left">
          <h1>{t('stats.title')}</h1>
        </div>
        <button className="btn small primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> {t('stats.add')}
        </button>
      </header>

      {/* one row on a desktop */}
      <div className="stats-filters">
        <div className="seg wide">
          {(['all', 'tournament', 'casual'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {t(f === 'all' ? 'stats.all' : f === 'tournament' ? 'match.tournament' : 'match.casual')}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <select className="select-pill" value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label={t('stats.period')}>
            {(['all', '30', '90', 'year'] as Period[]).map((p) => (
              <option key={p} value={p}>
                {t(`stats.period.${p}`)}
              </option>
            ))}
          </select>
          <select className="select-pill" value={format} onChange={(e) => setFormat(e.target.value as FormatFilter)} aria-label={t('account.format')}>
            <option value="all">Bo1 + Bo3</option>
            <option value="bo1">Bo1</option>
            <option value="bo3">Bo3</option>
          </select>
        </div>
      </div>

      {!shown.length ? (
        <div className="empty-state">
          <Icon name="stats" size={40} />
          <p>{t(filtered && matches.length ? 'stats.emptyFiltered' : 'stats.empty')}</p>
        </div>
      ) : (
        <>
          <section className="card stats-summary">
            <div className="stats3">
              <div>
                <div className="stat-num">{rec.games}</div>
                <div className="stat-label">{t('stats.games')}</div>
              </div>
              <div>
                <div className="stat-num">{fmtRecord(rec)}</div>
                <div className="stat-label">{t('stats.record')}</div>
              </div>
              <div>
                <div className={`stat-num ${wrClass(rec.wr)}`}>{pct(rec.wr, 0)}</div>
                <div className="stat-label">{t('stats.wr')}</div>
              </div>
            </div>
            <div className="kv">
              <span>{t('stats.last')}</span>
              <ResultDots matches={shown} />
            </div>
            {onPlay.games + onDraw.games > 0 && (
              <div className="play-draw">
                {(
                  [
                    ['OTP', onPlay],
                    ['OTD', onDraw],
                  ] as const
                ).map(([label, r]) => (
                  <div key={label}>
                    <span className="muted small">{t(label === 'OTP' ? 'stats.onPlay' : 'stats.onDraw')}</span>
                    <b className={r.games ? wrClass(r.wr) : ''}>{r.games ? pct(r.wr, 0) : '—'}</b>
                    <span className="muted small">{r.games ? fmtRecord(r) : t('stats.noData')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {shown.length >= MIN_FOR_TREND && <TrendChart matches={shown} />}

          {/* on a desktop: the history on the left, the groups beside it */}
          <div className="stats-cols">
            <div className="stats-side">
              <section className="group">
                <div className="group-title">{t('stats.byDeck')}</div>
                <ul className="card-list">
                  {byDeck.map((g) => {
                    const m = metaOf(g.name)
                    return (
                      <li key={g.name} className="stat-row">
                        <span className="ellipsis grow">{g.name}</span>
                        {m && <span className="muted small">{t('stats.vsMeta', { wr: pct(winrate(m), 0) })}</span>}
                        <RecordCells rec={g.rec} />
                      </li>
                    )
                  })}
                </ul>
              </section>

              <section className="group">
                <div className="group-title">{t('stats.byOpponent')}</div>
                <ul className="card-list">
                  {byOpp.map((g) => {
                    const open = openMatchup === g.name
                    const mine = groupBy(g.list, deckName)
                    const m = metaOf(g.name)
                    return (
                      <li key={g.name} className={`matchup ${open ? 'open' : ''}`}>
                        <button className="stat-row" onClick={() => setOpenMatchup(open ? null : g.name)} aria-expanded={open}>
                          <span className="ellipsis grow">{g.name}</span>
                          <RecordCells rec={g.rec} />
                          <span className="chev">
                            <Icon name="chevron" size={14} />
                          </span>
                        </button>
                        {open && (
                          <ul className="matchup-decks">
                            {m && (
                              <li className="stat-row sub clickable" onClick={() => openCommander(m.name)}>
                                <span className="ellipsis grow">
                                  <span className="muted">{t('stats.inMeta')}</span> {shortName(m.name)}
                                </span>
                                <span className="muted small">{pct(m.share)}</span>
                                <b className={`wr small-wr ${wrClass(winrate(m))}`}>{pct(winrate(m), 0)}</b>
                                <Icon name="chevron" size={14} />
                              </li>
                            )}
                            {mine.map((d) => (
                              <li key={d.name} className="stat-row sub">
                                <span className="ellipsis grow">
                                  <span className="muted">{t('stats.with')}</span> {d.name}
                                </span>
                                <RecordCells rec={d.rec} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>

              {byPlayer.length > 0 && (
                <section className="group">
                  <div className="group-title">{t('stats.byPlayer')}</div>
                  <ul className="card-list">
                    {byPlayer.map((g) => {
                      const key = g.list.find((m) => m.opponentPlayer)?.opponentPlayer
                      const row = (
                        <>
                          <span className="ellipsis grow">{g.name}</span>
                          <RecordCells rec={g.rec} />
                          {key && (
                            <span className="chev">
                              <Icon name="chevron" size={14} />
                            </span>
                          )}
                        </>
                      )
                      return (
                        <li key={g.name}>
                          {key ? (
                            <button className="stat-row" onClick={() => openPlayer(key)}>
                              {row}
                            </button>
                          ) : (
                            <div className="stat-row">{row}</div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
            </div>

            <section className="group">
              <div className="group-title">{t('stats.history')}</div>
              <ul className="card-list">
                {shown.map((m) => (
                  <HistoryRow key={m.id} m={m} deckName={deckName(m)} onLongPress={() => setActions(m)} more={wide} />
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {shown.length > 0 && <p className="muted small center">{t(wide ? 'stats.rightClickHint' : 'stats.longPressHint')}</p>}

      <Sheet open={!!actions} onClose={() => setActions(null)} title={t('stats.matchActions')}>
        <div className="form">
          <button
            className="btn"
            onClick={() => {
              setEditing(actions)
              setActions(null)
            }}
          >
            <Icon name="edit" size={16} /> {t('stats.editMatch')}
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!actions || !(await dialog.confirm(t('stats.deleteConfirm'), { ok: t('stats.deleteMatch'), danger: true }))) return
              setMatches((ms) => ms.filter((x) => x.id !== actions.id))
              setActions(null)
            }}
          >
            <Icon name="trash" size={16} /> {t('stats.deleteMatch')}
          </button>
        </div>
      </Sheet>

      <RecordMatch
        open={adding || !!editing}
        editing={editing ?? undefined}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        decks={decks}
        metaNames={metaDecks.map((d) => d.name)}
        players={players}
        onSave={(m) => {
          setMatches((ms) => (editing ? ms.map((x) => (x.id === m.id ? m : x)) : [m, ...ms]))
          setAdding(false)
          setEditing(null)
        }}
      />
    </div>
  )
}
