import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type Circuit, type League, type Player, eventDateLabel, potyStatus } from '../lib/circuit'
import { useStoredState } from '../lib/storage'
import { Icon } from '../components/ui'
import { type CircuitPrefs, PotyTag, SubPageShell, VerifiedTick, avg, placeLabel } from './Circuit'

// Leagues, season records and head-to-head: views built on the circuit model.

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const byKeyOf = (c: Circuit) => new Map(c.players.map((p) => [p.key, p]))
const wins = (p: Player) => p.events.filter((e) => e.place === 1).length
const seasonLabel = (s: League['season']) => (s === 's1' ? 'S1' : 'S2')

// ---------- leagues ----------

type LSort = 'players' | 'avg' | 'poty' | 'name'

export function LeagueList({ circuit, openLeague }: { circuit: Circuit; openLeague: (season: string, name: string) => void }) {
  const { t } = useI18n()
  const [season, setSeason] = useStoredState<League['season']>('cc.circuit.season', 's2')
  const [sort, setSort] = useStoredState<LSort>('cc.circuit.lsort', 'players')
  const poty = useMemo(() => potyStatus(circuit), [circuit])
  const byKey = useMemo(() => byKeyOf(circuit), [circuit])

  const rows = circuit.leagues
    .filter((l) => l.season === season)
    .map((l) => ({
      l,
      avg: mean(l.entries.map((e) => e.points)),
      poty: l.entries.filter((e) => byKey.has(e.key) && poty.isIn(byKey.get(e.key)!)).length,
    }))
  const metric = (r: (typeof rows)[number]) => (sort === 'avg' ? r.avg : sort === 'poty' ? r.poty : r.l.players)
  rows.sort((a, b) => (sort === 'name' ? a.l.name.localeCompare(b.l.name) : metric(b) - metric(a)))
  const max = Math.max(...rows.map(metric), 1)

  return (
    <>
      <div className="filters wrap">
        <div className="seg">
          {(['s1', 's2'] as const).map((s) => (
            <button key={s} className={season === s ? 'on' : ''} onClick={() => setSeason(s)}>
              {t('circuit.season', { s: seasonLabel(s) })}
            </button>
          ))}
        </div>
        <select className="select-pill" value={sort} onChange={(e) => setSort(e.target.value as LSort)} aria-label={t('circuit.sortBy')}>
          {(['players', 'avg', 'poty', 'name'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`circuit.lsort.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <ul className="card-list">
        {rows.map(({ l, avg: a, poty: n }) => (
          <li key={l.name} className="event-row league-row" onClick={() => openLeague(l.season, l.name)}>
            <div className="event-main">
              <div className="name-line">
                <span className="ellipsis">{l.name}</span>
              </div>
              <div className="sub-line">
                <span className="muted small">
                  {t('circuit.nPlayers', { n: l.players })} · {t('circuit.nStages', { n: l.stages })} · {t('circuit.avgShort', { n: a.toFixed(1) })}
                </span>
                {n > 0 && <span className="tag poty-zone">{t('circuit.potyZoneCount', { n })}</span>}
              </div>
              <div className="podium small">
                {l.entries.slice(0, 3).map((e, i) => (
                  <span key={e.key}>
                    <b>{i + 1}.</b> {byKey.get(e.key)?.name} <span className="muted">{e.points}</span>
                  </span>
                ))}
              </div>
              {sort !== 'name' && (
                <div className="share-bar" aria-hidden>
                  <span style={{ width: `${(metric({ l, avg: a, poty: n }) / max) * 100}%` }} />
                </div>
              )}
            </div>
            <Icon name="chevron" size={18} />
          </li>
        ))}
      </ul>
    </>
  )
}

export function LeaguePage({
  circuit,
  season,
  name,
  prefs,
  onBack,
  openPlayer,
}: {
  circuit: Circuit
  season: string
  name: string
  prefs: CircuitPrefs
  onBack: () => void
  openPlayer: (key: string) => void
}) {
  const { t } = useI18n()
  const l = circuit.leagues.find((x) => x.season === season && x.name === name)
  const byKey = useMemo(() => byKeyOf(circuit), [circuit])
  const poty = useMemo(() => potyStatus(circuit), [circuit])
  if (!l) return <SubPageShell title="—" onBack={onBack} />
  return (
    <SubPageShell title={`${l.name} · ${seasonLabel(l.season)}`} onBack={onBack}>
      <div className="chips static">
        <span className="tag big">{t('circuit.nPlayers', { n: l.players })}</span>
        <span className="tag big">{t('circuit.nStages', { n: l.stages })}</span>
        <span className="tag big">{t('circuit.avgShort', { n: mean(l.entries.map((e) => e.points)).toFixed(1) })}</span>
      </div>
      <ol className="meta-list">
        {l.entries.map((e) => {
          const p = byKey.get(e.key)
          // played two leagues: only the best one counts in the leaderboard
          const counted = !p || p[l.season]?.league === l.name
          return (
            <li key={e.key} className={`meta-row player-row ${e.key === prefs.me ? 'me' : ''}`} onClick={() => openPlayer(e.key)}>
              <div className="meta-main">
                <span className="rank wide">{e.rank}</span>
                <div className="meta-name">
                  <div className="name-line">
                    <span className="ellipsis">{p?.name}</span>
                    {prefs.claims.has(e.key) && <VerifiedTick />}
                    {prefs.follow.includes(e.key) && (
                      <span className="star-on">
                        <Icon name="star" size={12} />
                      </span>
                    )}
                    {e.key === prefs.me && <span className="tag me-tag">{t('circuit.you')}</span>}
                  </div>
                  <div className="sub-line">
                    {p && <span className="muted small">#{p.rank} {t('circuit.overall')}</span>}
                    {p && poty.isIn(p) && <PotyTag invited={p.potyInvited} />}
                    {!counted && <span className="tag">{t('circuit.notCounted', { l: p![l.season]!.league })}</span>}
                  </div>
                </div>
                <span className="pts">
                  <b>{e.points}</b>
                  <small>{t('circuit.unitPts')}</small>
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </SubPageShell>
  )
}

// ---------- records ----------

interface RecordDef {
  id: 'top8' | 'wins' | 'played' | 'avg' | 'consistency' | 'growth'
  value: (p: Player) => number | undefined // undefined: not ranked
  fmt?: (v: number) => string
}

const MIN_EVENTS = 3
const RECORDS: RecordDef[] = [
  { id: 'top8', value: (p) => p.top8 || undefined },
  { id: 'wins', value: (p) => wins(p) || undefined },
  { id: 'played', value: (p) => p.events.length || undefined },
  { id: 'avg', value: (p) => (p.events.length >= MIN_EVENTS ? avg(p) : undefined), fmt: (v) => v.toFixed(1) },
  { id: 'consistency', value: (p) => (p.events.length >= MIN_EVENTS ? p.top8 / p.events.length : undefined), fmt: (v) => `${Math.round(v * 100)}%` },
  { id: 'growth', value: (p) => (p.s1 && p.s2 ? p.s2.points - p.s1.points : undefined), fmt: (v) => (v > 0 ? `+${v}` : String(v)) },
]

export function Records({ circuit, prefs, openPlayer, openEvent }: { circuit: Circuit; prefs: CircuitPrefs; openPlayer: (k: string) => void; openEvent: (id: string) => void }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const months = useMemo(() => {
    const m = new Map<number, number[]>()
    circuit.events.forEach((e) => e.month && m.set(e.month, [...(m.get(e.month) ?? []), e.players]))
    return [...m].sort((a, b) => a[0] - b[0]).map(([month, ps]) => ({ month, events: ps.length, avg: mean(ps) }))
  }, [circuit])
  const maxMonth = Math.max(...months.map((m) => m.avg), 1)
  const biggest = [...circuit.events].sort((a, b) => b.players - a.players).slice(0, 5)

  return (
    <>
      {RECORDS.map((r) => {
        const ranked = circuit.players
          .map((p) => ({ p, v: r.value(p) }))
          .filter((x): x is { p: Player; v: number } => x.v !== undefined)
          .sort((a, b) => b.v - a.v || (a.p.rank ?? 0) - (b.p.rank ?? 0))
        // ties share the position
        const pos = (v: number) => 1 + ranked.filter((x) => x.v > v).length
        const shown = ranked.slice(0, open === r.id ? 15 : 5)
        const mine = prefs.me ? ranked.find((x) => x.p.key === prefs.me) : undefined
        const fmt = r.fmt ?? String
        return (
          <section key={r.id} className="card record">
            <div className="card-title">
              {t(`circuit.rec.${r.id}`)}
              {ranked.length > 5 && (
                <button className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? t('circuit.less') : t('circuit.more')}
                </button>
              )}
            </div>
            {['avg', 'consistency'].includes(r.id) && <p className="muted small no-margin">{t('circuit.minEvents', { n: MIN_EVENTS })}</p>}
            <ol className="mini-list">
              {shown.map(({ p, v }) => (
                <li key={p.key} className={p.key === prefs.me ? 'me' : ''} onClick={() => openPlayer(p.key)}>
                  <span className="rank">{pos(v)}</span>
                  <span className="ellipsis grow">
                    {p.name}
                    {prefs.claims.has(p.key) && <VerifiedTick />}
                  </span>
                  <b className="pts-inline">{fmt(v)}</b>
                </li>
              ))}
              {mine && !shown.includes(mine) && (
                <li className="me mine-row" onClick={() => openPlayer(mine.p.key)}>
                  <span className="rank">{pos(mine.v)}</span>
                  <span className="ellipsis grow">{t('circuit.you')}</span>
                  <b className="pts-inline">{fmt(mine.v)}</b>
                </li>
              )}
            </ol>
          </section>
        )
      })}

      <section className="card record">
        <div className="card-title">{t('circuit.rec.biggest')}</div>
        <ol className="mini-list">
          {biggest.map((e, i) => (
            <li key={e.id} onClick={() => openEvent(e.id)}>
              <span className="rank">{i + 1}</span>
              <span className="ellipsis grow">{e.name}</span>
              <b className="pts-inline">{e.players}</b>
            </li>
          ))}
        </ol>
      </section>

      <section className="card record">
        <div className="card-title">{t('circuit.rec.byMonth')}</div>
        <ul className="month-bars">
          {months.map((m) => (
            <li key={m.month}>
              <span className="month-name">{new Date(2000, m.month - 1, 1).toLocaleDateString(lang, { month: 'short' })}</span>
              <span className="month-bar">
                <span style={{ width: `${(m.avg / maxMonth) * 100}%` }} />
              </span>
              <span className="month-val small">
                <b>{Math.round(m.avg)}</b> <span className="muted">· {t(m.events === 1 ? 'circuit.oneEvent' : 'circuit.nEvents', { n: m.events })}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small no-margin">{t('circuit.byMonthNote')}</p>
      </section>
    </>
  )
}

// ---------- head to head ----------

/** Inline "compare with…" picker on a player page (no sheet: picking navigates right away). */
export function ComparePicker({ circuit, p, prefs, onPick }: { circuit: Circuit; p: Player; prefs: CircuitPrefs; onPick: (other: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const me = prefs.me && prefs.me !== p.key ? circuit.players.find((x) => x.key === prefs.me) : undefined
  const nq = q.trim().toLowerCase()
  const followed = circuit.players.filter((x) => x.key !== p.key && x.key !== me?.key && prefs.follow.includes(x.key))
  const results = nq ? circuit.players.filter((x) => x.key !== p.key && x.name.toLowerCase().includes(nq)).slice(0, 20) : followed
  if (!open)
    return (
      <button className="btn ghost" onClick={() => setOpen(true)}>
        <Icon name="swap" size={16} /> {t('circuit.compare')}
      </button>
    )
  return (
    <section className="card compare-picker">
      <div className="card-title">
        {t('circuit.compareWith')}
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="close">
          <Icon name="close" size={18} />
        </button>
      </div>
      {me && (
        <button className="btn primary" onClick={() => onPick(me.key)}>
          <Icon name="user" size={16} /> {t('circuit.compareMe')}
        </button>
      )}
      <div className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('circuit.searchPlayer')} />
      </div>
      {!nq && followed.length > 0 && <div className="muted small">{t('circuit.followed')}</div>}
      <ul className="mini-list">
        {results.map((x) => (
          <li key={x.key} onClick={() => onPick(x.key)}>
            <span className="rank">{x.rank}</span>
            <span className="ellipsis grow">
              {x.name}
              {prefs.claims.has(x.key) && <VerifiedTick />}
            </span>
            <span className="muted small">{x.total}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type Side = 'a' | 'b' | 'tie'

export function ComparePage({
  circuit,
  a: ka,
  b: kb,
  prefs,
  onBack,
  openPlayer,
  openEvent,
}: {
  circuit: Circuit
  a: string
  b: string
  prefs: CircuitPrefs
  onBack: () => void
  openPlayer: (k: string) => void
  openEvent: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const byKey = useMemo(() => byKeyOf(circuit), [circuit])
  const a = byKey.get(ka)
  const b = byKey.get(kb)
  if (!a || !b) return <SubPageShell title="—" onBack={onBack} />

  // [label, value a, value b, lower is better]
  const rows: [string, number | undefined, number | undefined, boolean?, ((v: number) => string)?][] = [
    [t('circuit.position'), a.rank, b.rank, true, (v) => `#${v}`],
    [t('circuit.sort.total'), a.total, b.total],
    [t('circuit.sort.s1'), a.s1?.points, b.s1?.points],
    [t('circuit.sort.s2'), a.s2?.points, b.s2?.points],
    [t('circuit.sort.events'), a.eventPoints, b.eventPoints],
    [t('circuit.sort.played'), a.events.length, b.events.length],
    ['Top 8', a.top8, b.top8],
    [t('circuit.rec.wins'), wins(a), wins(b)],
    [t('circuit.best'), a.best, b.best, true, (v) => placeLabel(v, lang)],
    [t('circuit.avgPts'), a.events.length ? avg(a) : undefined, b.events.length ? avg(b) : undefined, false, (v) => v.toFixed(1)],
  ]
  const better = (va?: number, vb?: number, lower?: boolean): Side =>
    va === undefined && vb === undefined ? 'tie' : vb === undefined ? 'a' : va === undefined ? 'b' : va === vb ? 'tie' : (va < vb) === !!lower ? 'a' : 'b'

  // events both played: who finished higher (outside the top 8 the order isn't known: a tie)
  const common = circuit.events
    .map((e) => ({ e, ra: a.events.find((x) => x.eventId === e.id), rb: b.events.find((x) => x.eventId === e.id) }))
    .filter((x) => x.ra && x.rb)
    .map((x) => ({ ...x, win: better(x.ra!.place ?? 99, x.rb!.place ?? 99, true) }))
  const tally = { a: common.filter((c) => c.win === 'a').length, b: common.filter((c) => c.win === 'b').length, tie: common.filter((c) => c.win === 'tie').length }

  return (
    <SubPageShell title={t('circuit.h2h')} onBack={onBack}>
      <div className="h2h-head">
        {[a, b].map((p, i) => (
          <button key={p.key} className={`h2h-player side-${i ? 'b' : 'a'}`} onClick={() => openPlayer(p.key)}>
            <span className="h2h-swatch" />
            <strong className="ellipsis">
              {p.name}
              {prefs.claims.has(p.key) && <VerifiedTick />}
            </strong>
            <span className="muted small">
              #{p.rank} · {p.total} {t('circuit.unitPts')}
            </span>
          </button>
        ))}
      </div>

      <section className="card h2h-table">
        {rows.map(([label, va, vb, lower, fmt]) => {
          const w = better(va, vb, lower)
          const f = (v?: number) => (v === undefined ? '—' : (fmt ?? String)(v))
          return (
            <div key={label} className="h2h-row">
              <b className={w === 'a' ? 'win side-a' : ''}>{f(va)}</b>
              <span className="muted small">{label}</span>
              <b className={w === 'b' ? 'win side-b' : ''}>{f(vb)}</b>
            </div>
          )
        })}
      </section>

      <section className="card">
        <div className="card-title">{t('circuit.chartTitle')}</div>
        <CompareChart circuit={circuit} a={a} b={b} />
      </section>

      <section className="group">
        <div className="group-title">{t('circuit.commonEvents', { n: common.length })}</div>
        {common.length > 0 && (
          <div className="h2h-tally">
            <span className="side-a">{tally.a}</span>
            <span className="muted small">{t('circuit.tally', { n: tally.tie })}</span>
            <span className="side-b">{tally.b}</span>
          </div>
        )}
        <ul className="card-list">
          {common.map(({ e, ra, rb, win }) => (
            <li key={e.id} className="event-row" onClick={() => openEvent(e.id)}>
              <span className={`place-badge ${win === 'a' ? 'win-a' : ''}`}>{ra!.place ? placeLabel(ra!.place, lang) : '—'}</span>
              <div className="event-main">
                <span className="ellipsis">{e.name}</span>
                <span className="muted small">{eventDateLabel(e, lang) || t('circuit.nPlayers', { n: e.players })}</span>
              </div>
              <span className={`place-badge ${win === 'b' ? 'win-b' : ''}`}>{rb!.place ? placeLabel(rb!.place, lang) : '—'}</span>
            </li>
          ))}
          {!common.length && <li className="empty">{t('circuit.noCommon')}</li>}
        </ul>
      </section>
    </SubPageShell>
  )
}

/** Both players' event points piling up over the season; tap anywhere to read an event. */
function CompareChart({ circuit, a, b }: { circuit: Circuit; a: Player; b: Player }) {
  const { t } = useI18n()
  const [sel, setSel] = useState<number | null>(null)
  const W = 320
  const H = 140
  const pad = { l: 26, r: 8, t: 8, b: 16 }
  const n = circuit.events.length
  const series = [a, b].map((p) => {
    let cum = 0
    return circuit.events.map((e) => {
      const pe = p.events.find((x) => x.eventId === e.id)
      cum += pe?.points ?? 0
      return { pe, cum }
    })
  })
  const max = Math.max(10, ...series.map((s) => s[s.length - 1]?.cum ?? 0))
  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * (W - pad.l - pad.r) : 0)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const ticks = [0, Math.round(max / 2), max]
  const pick = (ev: React.MouseEvent<SVGRectElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const fx = ((ev.clientX - r.left) / r.width) * (W - pad.l - pad.r)
    setSel(Math.max(0, Math.min(n - 1, Math.round((fx / (W - pad.l - pad.r)) * (n - 1)))))
  }
  const e = sel !== null ? circuit.events[sel] : null

  return (
    <div className="chart">
      <div className="legend small">
        {[a, b].map((p, i) => (
          <span key={p.key} className={`side-${i ? 'b' : 'a'}`}>
            <span className="h2h-swatch" /> {p.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('circuit.chartTitle')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 4} y={y(v) + 3} className="axis" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {sel !== null && <line x1={x(sel)} x2={x(sel)} y1={pad.t} y2={H - pad.b} className="cross" />}
        {series.map((s, si) => (
          <g key={si} className={`series side-${si ? 'b' : 'a'}`}>
            <path d={s.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.cum).toFixed(1)}`).join('')} className="line" />
            {s.map((d, i) => d.pe && <circle key={i} cx={x(i)} cy={y(d.cum)} r={sel === i ? 5 : 3.5} className="dot" />)}
          </g>
        ))}
        <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} className="hit" onClick={pick} />
      </svg>
      <div className="chart-tip small">
        {e ? (
          <>
            <b>{e.name}</b>
            {series.map((s, si) => (
              <span key={si} className={`side-${si ? 'b' : 'a'}`}>
                {' '}
                · <span className="h2h-swatch" /> {s[sel!].pe ? `+${s[sel!].pe!.points}` : '—'} → {s[sel!].cum}
              </span>
            ))}
          </>
        ) : (
          <span className="muted">{t('circuit.chartHintH2h')}</span>
        )}
      </div>
    </div>
  )
}
