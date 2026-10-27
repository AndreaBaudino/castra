import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type Circuit, type CircuitEvent, type Player, eventDateLabel, potyStatus } from '../lib/circuit'
import { useStoredState } from '../lib/storage'
import { Icon } from '../components/ui'

// The Centurion circuit (players, leagues, big events): a world apart from the deck meta.

export interface CircuitPrefs {
  me: string | null // player key the user said is them
  setMe: (k: string | null) => void
  follow: string[]
  setFollow: (fn: (f: string[]) => string[]) => void
}

type Sort = 'total' | 's1' | 's2' | 'events' | 'played' | 'avg' | 'top8'
const SORTS: Sort[] = ['total', 's1', 's2', 'events', 'played', 'avg', 'top8']
const MIN_FOR_AVG = 3

const avg = (p: Player) => (p.events.length ? p.eventPoints / p.events.length : 0)
const sortValue = (p: Player, s: Sort) =>
  s === 'total'
    ? p.total
    : s === 's1'
      ? (p.s1?.points ?? 0)
      : s === 's2'
        ? (p.s2?.points ?? 0)
        : s === 'events'
          ? p.eventPoints
          : s === 'played'
            ? p.events.length
            : s === 'avg'
              ? avg(p)
              : p.top8
// players with nothing to show for that measure are left out of the ranking
const qualifies = (p: Player, s: Sort) =>
  s === 's1' ? !!p.s1 : s === 's2' ? !!p.s2 : s === 'avg' ? p.events.length >= MIN_FOR_AVG : s === 'total' ? true : sortValue(p, s) > 0

const placeLabel = (n: number, lang: string) => (lang === 'it' ? `${n}°` : `#${n}`)

const playerLeagues = (p: Player) => [p.s1, p.s2].flatMap((l) => (l ? [l.league, ...(l.also ?? [])] : []))

export function leagues(c: Circuit) {
  const set = new Set<string>()
  c.players.forEach((p) => playerLeagues(p).forEach((l) => l !== '—' && set.add(l)))
  return [...set].sort((a, b) => a.localeCompare(b))
}

// ---------- the "Circuit" half of the Meta tab ----------

export function CircuitPanel({
  circuit,
  prefs,
  openPlayer,
  openEvent,
}: {
  circuit: Circuit
  prefs: CircuitPrefs
  openPlayer: (key: string) => void
  openEvent: (id: string) => void
}) {
  const { t } = useI18n()
  const [view, setView] = useStoredState<'ranking' | 'events'>('cc.circuit.view', 'ranking')
  return (
    <>
      <div className="seg wide">
        {(['ranking', 'events'] as const).map((v) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {t(v === 'ranking' ? 'circuit.ranking' : 'circuit.events')}
          </button>
        ))}
      </div>
      {view === 'ranking' ? (
        <Ranking circuit={circuit} prefs={prefs} openPlayer={openPlayer} />
      ) : (
        <EventList circuit={circuit} prefs={prefs} openEvent={openEvent} />
      )}
    </>
  )
}

function Ranking({ circuit, prefs, openPlayer }: { circuit: Circuit; prefs: CircuitPrefs; openPlayer: (key: string) => void }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [sort, setSort] = useStoredState<Sort>('cc.circuit.sort', 'total')
  const [league, setLeague] = useStoredState('cc.circuit.league', '')
  const [onlyFollowed, setOnlyFollowed] = useState(false)
  const poty = useMemo(() => potyStatus(circuit), [circuit])
  const allLeagues = useMemo(() => leagues(circuit), [circuit])

  const list = useMemo(() => {
    const nq = q.trim().toLowerCase()
    return circuit.players
      .filter(
        (p) =>
          qualifies(p, sort) &&
          (!nq || p.name.toLowerCase().includes(nq)) &&
          (!league || playerLeagues(p).includes(league)) &&
          (!onlyFollowed || prefs.follow.includes(p.key) || p.key === prefs.me),
      )
      .sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || (a.rank ?? 0) - (b.rank ?? 0))
  }, [circuit, q, sort, league, onlyFollowed, prefs.follow, prefs.me])
  // the POTY line only makes sense on the plain overall ranking
  const showPotyLine = sort === 'total' && !q && !league && !onlyFollowed
  const lastInZone = [...poty.zone].pop()

  const fmt = (p: Player) => (sort === 'avg' ? avg(p).toFixed(1) : String(sortValue(p, sort)))

  return (
    <>
      <div className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('circuit.searchPlayer')} />
      </div>
      <div className="filters wrap">
        <select className="select-pill" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('circuit.sortBy')}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`circuit.sort.${s}`)}
            </option>
          ))}
        </select>
        <select className="select-pill" value={league} onChange={(e) => setLeague(e.target.value)} aria-label={t('circuit.league')}>
          <option value="">{t('circuit.allLeagues')}</option>
          {allLeagues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button className={`chip ${onlyFollowed ? 'on' : ''}`} onClick={() => setOnlyFollowed(!onlyFollowed)}>
          <Icon name="star" size={13} /> {t('circuit.followed')}
        </button>
      </div>

      <ol className="meta-list">
        {list.map((p, i) => (
          <PlayerRow
            key={p.key}
            p={p}
            pos={sort === 'total' ? (p.rank ?? i + 1) : i + 1}
            value={fmt(p)}
            unit={t(sort === 'played' ? 'circuit.unitEvents' : sort === 'top8' ? 'circuit.unitTop8' : sort === 'avg' ? 'circuit.unitAvg' : 'circuit.unitPts')}
            prefs={prefs}
            poty={poty.isIn(p) ? (p.potyInvited ? 'invited' : 'zone') : undefined}
            potyLine={showPotyLine && p.key === lastInZone ? t('circuit.potyLine', { n: poty.zone.size }) : undefined}
            onClick={() => openPlayer(p.key)}
          />
        ))}
        {!list.length && <li className="empty">{t('meta.noResults')}</li>}
      </ol>
      {sort === 'avg' && <p className="muted small center">{t('circuit.avgNote', { n: MIN_FOR_AVG })}</p>}
    </>
  )
}

function PlayerRow({
  p,
  pos,
  value,
  unit,
  prefs,
  poty,
  potyLine,
  onClick,
}: {
  p: Player
  pos: number
  value: string
  unit: string
  prefs: CircuitPrefs
  poty?: 'invited' | 'zone'
  potyLine?: string
  onClick: () => void
}) {
  const { t } = useI18n()
  const league = p.s2?.league ?? p.s1?.league
  return (
    <>
      <li className={`meta-row player-row ${p.key === prefs.me ? 'me' : ''}`} onClick={onClick}>
        <div className="meta-main">
          <span className="rank wide">{pos}</span>
          <div className="meta-name">
            <div className="name-line">
              <span className="ellipsis">{p.name}</span>
              {prefs.follow.includes(p.key) && (
                <span className="star-on">
                  <Icon name="star" size={12} />
                </span>
              )}
              {p.key === prefs.me && <span className="tag me-tag">{t('circuit.you')}</span>}
            </div>
            <div className="sub-line">
              {league && <span className="muted small">{league}</span>}
              <span className="muted small">· {t('circuit.nEvents', { n: p.events.length })}</span>
              {poty === 'invited' && <span className="tag poty">{t('circuit.potyInvited')}</span>}
              {poty === 'zone' && <span className="tag poty-zone">POTY</span>}
            </div>
          </div>
          <span className="pts">
            <b>{value}</b>
            <small>{unit}</small>
          </span>
        </div>
      </li>
      {potyLine && <li className="poty-line">{potyLine}</li>}
    </>
  )
}

function EventList({ circuit, prefs, openEvent }: { circuit: Circuit; prefs: CircuitPrefs; openEvent: (id: string) => void }) {
  const { t, lang } = useI18n()
  const [level, setLevel] = useStoredState<'all' | '1' | '2' | 'none'>('cc.circuit.level', 'all')
  const [month, setMonth] = useStoredState('cc.circuit.month', 0)
  const [sort, setSort] = useStoredState<'recent' | 'oldest' | 'size'>('cc.circuit.evSort', 'recent')
  const months = useMemo(() => [...new Set(circuit.events.map((e) => e.month).filter(Boolean) as number[])].sort((a, b) => a - b), [circuit])
  const byKey = useMemo(() => new Map(circuit.players.map((p) => [p.key, p])), [circuit])

  const list = circuit.events
    .filter((e) => (level === 'all' ? true : level === 'none' ? !e.level : e.level === +level) && (!month || e.month === month))
    .sort((a, b) => (sort === 'recent' ? b.order - a.order : sort === 'oldest' ? a.order - b.order : b.players - a.players))

  return (
    <>
      <div className="filters wrap">
        <div className="seg">
          {(['all', '1', '2', 'none'] as const).map((l) => (
            <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
              {l === 'all' ? t('circuit.all') : l === 'none' ? t('circuit.otherLevel') : `LV${l}`}
            </button>
          ))}
        </div>
        <select className="select-pill" value={month} onChange={(e) => setMonth(+e.target.value)} aria-label={t('circuit.month')}>
          <option value={0}>{t('circuit.allMonths')}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {new Date(2000, m - 1, 1).toLocaleDateString(lang, { month: 'long' })}
            </option>
          ))}
        </select>
        <select className="select-pill" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('circuit.sortBy')}>
          <option value="recent">{t('circuit.evSort.recent')}</option>
          <option value="oldest">{t('circuit.evSort.oldest')}</option>
          <option value="size">{t('circuit.evSort.size')}</option>
        </select>
      </div>
      <ul className="card-list">
        {list.map((e) => {
          const winner = e.results.find((r) => r.place === 1)
          const mine = prefs.me ? e.results.find((r) => r.key === prefs.me) : undefined
          return (
            <li key={e.id} className="event-row" onClick={() => openEvent(e.id)}>
              <div className="event-main">
                <div className="name-line">
                  <span className="ellipsis">{e.name}</span>
                </div>
                <div className="sub-line">
                  {eventDateLabel(e, lang) && <span className="muted small">{eventDateLabel(e, lang)}</span>}
                  <span className="muted small">· {t('circuit.nPlayers', { n: e.players })}</span>
                  {e.level && <span className="tag">LV{e.level}</span>}
                  {mine && (
                    <span className="tag me-tag">
                      {t('circuit.you')}: {mine.place ? placeLabel(mine.place, lang) : t('circuit.played')}
                    </span>
                  )}
                </div>
                {winner && (
                  <div className="small winner">
                    <Icon name="trophy" size={13} /> {byKey.get(winner.key)?.name}
                    {winner.poty && <span className="muted"> · {t('circuit.top4Poty')}</span>}
                  </div>
                )}
              </div>
              <Icon name="chevron" size={18} />
            </li>
          )
        })}
        {!list.length && <li className="empty">{t('meta.noResults')}</li>}
      </ul>
    </>
  )
}

// ---------- player ----------

export function PlayerPage({
  circuit,
  playerKey,
  prefs,
  onBack,
  openEvent,
}: {
  circuit: Circuit
  playerKey: string
  prefs: CircuitPrefs
  onBack: () => void
  openEvent: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const p = circuit.players.find((x) => x.key === playerKey)
  const poty = useMemo(() => potyStatus(circuit), [circuit])
  if (!p) return <SubPageShell title="—" onBack={onBack} />
  const followed = prefs.follow.includes(p.key)
  const isMe = prefs.me === p.key
  const above = [...circuit.players].reverse().find((o) => o.total > p.total)
  const evById = new Map(circuit.events.map((e) => [e.id, e]))

  return (
    <SubPageShell
      title={p.name}
      onBack={onBack}
      actions={
        <button
          className={`icon-btn ${followed ? 'star-on' : ''}`}
          onClick={() => prefs.setFollow((f) => (followed ? f.filter((k) => k !== p.key) : [...f, p.key]))}
          aria-label={t('circuit.follow')}
        >
          <Icon name="star" />
        </button>
      }
    >
      <button className={`btn ${isMe ? 'primary' : 'ghost'}`} onClick={() => prefs.setMe(isMe ? null : p.key)}>
        <Icon name="user" size={16} /> {isMe ? t('circuit.isMe') : t('circuit.thisIsMe')}
      </button>

      <section className="card">
        <div className="stats3">
          <div>
            <div className="stat-num">#{p.rank}</div>
            <div className="stat-label">{t('circuit.position')}</div>
          </div>
          <div>
            <div className="stat-num">{p.total}</div>
            <div className="stat-label">{t('circuit.points')}</div>
          </div>
          <div>
            <div className="stat-num">{p.events.length}</div>
            <div className="stat-label">{t('circuit.events')}</div>
          </div>
        </div>
        <PotyNote p={p} poty={poty} />
        {above && <div className="muted small">{t('circuit.gapAbove', { n: above.total - p.total, r: above.rank ?? '' })}</div>}
      </section>

      <section className="card">
        <div className="card-title">{t('circuit.breakdown')}</div>
        {(['s1', 's2'] as const).map((s) => {
          const l = p[s]
          return (
            <div key={s} className="kv">
              <span>
                {t(s === 's1' ? 'circuit.sort.s1' : 'circuit.sort.s2')}
                {l && ` · ${l.league} (${t('circuit.leagueRank', { r: l.leagueRank, n: l.leaguePlayers })})`}
                {l?.also && <span className="muted small"> · {t('circuit.alsoLeague', { l: l.also.join(', ') })}</span>}
              </span>
              <b>{l ? l.points : '—'}</b>
            </div>
          )
        })}
        <div className="kv">
          <span>{t('circuit.sort.events')}</span>
          <b>{p.eventPoints}</b>
        </div>
        <div className="kv total">
          <span>{t('circuit.total')}</span>
          <b>{p.total}</b>
        </div>
      </section>

      {p.events.length > 0 && (
        <>
          <section className="card">
            <div className="stats3 compact">
              <div>
                <div className="stat-num">{p.top8}</div>
                <div className="stat-label">Top 8</div>
              </div>
              <div>
                <div className="stat-num">{p.best ? placeLabel(p.best, lang) : '—'}</div>
                <div className="stat-label">{t('circuit.best')}</div>
              </div>
              <div>
                <div className="stat-num">{avg(p).toFixed(1)}</div>
                <div className="stat-label">{t('circuit.avgPts')}</div>
              </div>
            </div>
            <div className="card-title">{t('circuit.chartTitle')}</div>
            <PointsChart circuit={circuit} p={p} />
          </section>

          <section className="group">
            <div className="group-title">{t('circuit.eventsPlayed')}</div>
            <ul className="card-list">
              {[...p.events].reverse().map((pe) => {
                const e = evById.get(pe.eventId)!
                return (
                  <li key={pe.eventId} className="event-row" onClick={() => openEvent(pe.eventId)}>
                    <span className={`place-badge ${pe.place ? (pe.place <= 4 ? 'top4' : 'top8') : ''}`}>
                      {pe.place ? placeLabel(pe.place, lang) : '—'}
                    </span>
                    <div className="event-main">
                      <span className="ellipsis">{e.name}</span>
                      <span className="muted small">
                        {eventDateLabel(e, lang)}
                        {eventDateLabel(e, lang) ? ' · ' : ''}
                        {t('circuit.nPlayers', { n: e.players })}
                      </span>
                    </div>
                    {pe.poty ? <span className="tag poty">{t('circuit.potyInvited')}</span> : <b className="pts-inline">+{pe.points}</b>}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </SubPageShell>
  )
}

function PotyNote({ p, poty }: { p: Player; poty: ReturnType<typeof potyStatus> }) {
  const { t } = useI18n()
  if (p.potyInvited) return <div className="check ok">{t('circuit.potyByEvent')}</div>
  if (poty.zone.has(p.key)) {
    const pos = [...poty.zone].indexOf(p.key) + 1
    return <div className="check ok">{t('circuit.potyInZone', { pos, n: poty.zone.size })}</div>
  }
  return <div className="check">{t('circuit.potyGap', { n: Math.max(1, poty.cutoff - p.total), c: poty.cutoff })}</div>
}

/** Event points piling up over the season: one point per event of the circuit, a dot where the player scored. */
function PointsChart({ circuit, p }: { circuit: Circuit; p: Player }) {
  const { t, lang } = useI18n()
  const [sel, setSel] = useState<number | null>(null)
  const W = 320
  const H = 120
  const pad = { l: 26, r: 8, t: 8, b: 16 }
  const n = circuit.events.length
  let cum = 0
  const pts = circuit.events.map((e, i) => {
    const pe = p.events.find((x) => x.eventId === e.id)
    cum += pe?.points ?? 0
    return { e, pe, cum, i }
  })
  const max = Math.max(cum, 10)
  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * (W - pad.l - pad.r) : 0)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const path = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.i).toFixed(1)},${y(d.cum).toFixed(1)}`).join('')
  const s = sel !== null ? pts[sel] : null
  const ticks = [0, Math.round(max / 2), max]

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('circuit.chartTitle')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 4} y={y(v) + 3} className="axis" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path d={path} className="line" />
        {pts.map(
          (d) =>
            d.pe && (
              <g key={d.e.id} onClick={() => setSel(sel === d.i ? null : d.i)}>
                <circle cx={x(d.i)} cy={y(d.cum)} r={12} className="hit" />
                <circle cx={x(d.i)} cy={y(d.cum)} r={sel === d.i ? 5.5 : 4} className="dot" />
              </g>
            ),
        )}
        {s && <line x1={x(s.i)} x2={x(s.i)} y1={pad.t} y2={H - pad.b} className="cross" />}
      </svg>
      <div className="chart-tip small">
        {s ? (
          <>
            <b>{s.e.name}</b> · {s.pe?.place ? `${placeLabel(s.pe.place, lang)} · ` : ''}+{s.pe?.points ?? 0} → {s.cum}
          </>
        ) : (
          <span className="muted">{t('circuit.chartHint')}</span>
        )}
      </div>
    </div>
  )
}

// ---------- event ----------

export function EventPage({
  circuit,
  eventId,
  prefs,
  onBack,
  openPlayer,
}: {
  circuit: Circuit
  eventId: string
  prefs: CircuitPrefs
  onBack: () => void
  openPlayer: (key: string) => void
}) {
  const { t, lang } = useI18n()
  const e = circuit.events.find((x) => x.id === eventId)
  const byKey = useMemo(() => new Map(circuit.players.map((p) => [p.key, p])), [circuit])
  if (!e) return <SubPageShell title="—" onBack={onBack} />
  const top = e.results.filter((r) => r.place).sort((a, b) => a.place! - b.place!)
  const rest = e.results.filter((r) => !r.place).sort((a, b) => (byKey.get(a.key)?.name ?? '').localeCompare(byKey.get(b.key)?.name ?? ''))

  const row = (r: CircuitEvent['results'][number]) => (
    <li
      key={r.key}
      className={`event-row ${r.key === prefs.me ? 'me' : ''}`}
      onClick={() => openPlayer(r.key)}
    >
      <span className={`place-badge ${r.place ? (r.place <= 4 ? 'top4' : 'top8') : ''}`}>{r.place ? placeLabel(r.place, lang) : '—'}</span>
      <span className="ellipsis grow">
        {byKey.get(r.key)?.name}
        {prefs.follow.includes(r.key) && (
          <span className="star-on">
            {' '}
            <Icon name="star" size={12} />
          </span>
        )}
      </span>
      {r.poty ? <span className="tag poty">{t('circuit.potyInvited')}</span> : <b className="pts-inline">{r.points}</b>}
    </li>
  )

  return (
    <SubPageShell title={e.name} onBack={onBack}>
      <div className="chips static">
        {eventDateLabel(e, lang) && <span className="tag big">{eventDateLabel(e, lang)}</span>}
        <span className="tag big">{t('circuit.nPlayers', { n: e.players })}</span>
        {e.level && <span className="tag big">LV{e.level}</span>}
      </div>
      <section className="group">
        <div className="group-title">Top 8</div>
        <ul className="card-list">{top.map(row)}</ul>
      </section>
      {rest.length > 0 && (
        <section className="group">
          <div className="group-title">{t('circuit.participants', { n: rest.length })}</div>
          <ul className="card-list">{rest.map(row)}</ul>
        </section>
      )}
    </SubPageShell>
  )
}

function SubPageShell({
  title,
  onBack,
  actions,
  children,
}: {
  title: string
  onBack: () => void
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="page">
      <header className="page-head">
        <div className="head-left">
          <button className="icon-btn" onClick={onBack} aria-label="back">
            <Icon name="back" />
          </button>
          <h1 className="sub-title">{title}</h1>
        </div>
        {actions}
      </header>
      {children}
    </div>
  )
}

// ---------- live indicator ----------

type LoadStatus = 'idle' | 'loading' | 'error'
type Live = 'live' | 'stale' | 'none'

// green: fetched from the sheet (or being fetched) · yellow: showing the saved copy (offline, error) · red: no data at all
const liveOf = (circuit: Circuit | null, status: LoadStatus): Live =>
  !circuit ? (status === 'loading' ? 'live' : 'none') : status === 'error' ? 'stale' : 'live'

function useMinuteTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
}

function ago(iso: string, lang: string, justNow: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  if (min < 1) return justNow
  if (min < 60) return rtf.format(-min, 'minute')
  if (min < 24 * 60) return rtf.format(-Math.round(min / 60), 'hour')
  return new Date(iso).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })
}

export function LiveStatus({ circuit, status }: { circuit: Circuit | null; status: LoadStatus }) {
  const { t, lang } = useI18n()
  useMinuteTick()
  const live = liveOf(circuit, status)
  const when = circuit && new Date(circuit.updatedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })
  const text =
    live === 'none'
      ? t('circuit.liveNone')
      : status === 'loading'
        ? t('circuit.liveLoading')
        : live === 'stale'
          ? t(navigator.onLine ? 'circuit.liveError' : 'circuit.liveOffline', { d: when ?? '' })
          : t('circuit.live', { d: ago(circuit!.updatedAt, lang, t('circuit.justNow')) })
  return (
    <div className={`live-status ${live}`} role="status">
      <LiveDot live={live} />
      <span>{text}</span>
    </div>
  )
}

function LiveDot({ live, title }: { live: Live; title?: string }) {
  return <span className={`live-dot ${live}`} title={title} aria-hidden={!title} />
}

// ---------- home card ----------

export function CircuitCard({
  circuit,
  status,
  me,
  openPlayer,
  findMe,
}: {
  circuit: Circuit | null
  status: LoadStatus
  me: string | null
  openPlayer: (k: string) => void
  findMe: () => void
}) {
  const { t } = useI18n()
  const live = liveOf(circuit, status)
  const p = me ? circuit?.players.find((x) => x.key === me) : undefined
  const poty = useMemo(() => circuit && potyStatus(circuit), [circuit])
  if (!circuit) return null
  return (
    <section className="card">
      <div className="card-title">
        <span className="title-live">
          {t('circuit.title')}
          <LiveDot live={live} title={t(live === 'live' ? 'circuit.dotLive' : 'circuit.dotStale')} />
        </span>
        {p && (
          <button className="link" onClick={() => openPlayer(p.key)}>
            {t('stats.details')}
          </button>
        )}
      </div>
      {!p || !poty ? (
        <div className="empty-inline">
          <p className="muted small">{t('circuit.linkPrompt')}</p>
          <button className="btn small primary" onClick={findMe}>
            <Icon name="search" size={16} /> {t('circuit.findMe')}
          </button>
        </div>
      ) : (
        <>
          <div className="stats3 compact">
            <div>
              <div className="stat-num">#{p.rank}</div>
              <div className="stat-label">{t('circuit.position')}</div>
            </div>
            <div>
              <div className="stat-num">{p.total}</div>
              <div className="stat-label">{t('circuit.points')}</div>
            </div>
            <div>
              <div className="stat-num">{p.top8}</div>
              <div className="stat-label">Top 8</div>
            </div>
          </div>
          <PotyNote p={p} poty={poty} />
        </>
      )}
    </section>
  )
}
