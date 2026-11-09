import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { playerKey } from '../lib/circuit'
import { useLiveCollection } from '../lib/firebase'
import {
  type Player,
  type RankRow,
  type TableMatch,
  type Tournament,
  clockLabel,
  ranking,
  sideScore,
  timeLeft,
  tournamentStatus,
  tournamentTitle,
  unconfirmed,
  listLinkProps,
  icsOf,
  upcoming,
  useEntered,
  useLists,
  useNow,
  useTournament,
  useTournaments,
} from '../lib/tournaments'
import { Icon, ShareButton } from '../components/ui'
import { Toggle } from './Account'
import type { MetaDataset } from '../lib/meta'
import { useWide } from '../lib/wide'
import { LiveDot, SubPageShell, placeLabel } from './Circuit'

// The tournaments run in the app, for whoever follows them (docs/tornei.md): the link on the home, the list of the ones
// being played (#live) and one tournament (#live/<id>) with its pairings, standings and a search for a player. The TO
// pages (Organizer.tsx) show the tables and the standings with the same lists.

// a result one player entered and the other hasn't confirmed yet ends with a question mark
const scoreText = (m: TableMatch) =>
  !m.p2 ? '2-0' : m.score ? m.score.slice(0, m.score[2] ? 3 : 2).join('-') + (unconfirmed(m) ? '?' : '') : '—'

/** A round's tables, the bye last; `onPick` makes them tappable (the TO enters the results), `me`'s table stands out. */
export function MatchList({
  matches,
  nameOf,
  onPick,
  me,
}: {
  matches: TableMatch[]
  nameOf: (k: string | null) => string
  onPick?: (m: TableMatch) => void
  me?: string | null
}) {
  const { t } = useI18n()
  return (
    <ul className="card-list">
      {[...matches]
        .sort((a, b) => (a.table || 999) - (b.table || 999))
        .map((m) => (
          <li key={`${m.round}-${m.table}`} className={`event-row ${me && (m.p1 === me || m.p2 === me) ? 'mine' : ''}`} onClick={() => m.p2 && onPick?.(m)}>
            <span className="place-badge">{m.p2 ? m.table : '—'}</span>
            <div className="event-main">
              <span className="ellipsis">{nameOf(m.p1)}</span>
              <span className="ellipsis muted">{m.p2 ? nameOf(m.p2) : t('meta.bye')}</span>
            </div>
            <span className="to-score">
              {scoreText(m)}
              {m.extra ? <small> +{m.extra}′</small> : null}
            </span>
          </li>
        ))}
    </ul>
  )
}

/** The standings (or the final order), with each one's commander (`secret`: not yet), record, opponents' match-win % and decklist. */
export function RankingList({ rows, onPick, lists, secret }: { rows: RankRow[]; onPick?: (id: string) => void; lists?: Map<string, string>; secret?: boolean }) {
  const { t, lang } = useI18n()
  return (
    <ul className="card-list">
      {rows.map((r, i) => (
        <li key={r.id} className="event-row" onClick={() => onPick?.(r.id)}>
          <span className="place-badge">{placeLabel(i + 1, lang)}</span>
          <div className="event-main">
            <span className="ellipsis">
              {r.name}
              {r.dropped && <span className="muted small"> · {t('run.dropped')}</span>}
            </span>
            <span className="ellipsis muted small">
              {!secret && `${r.commander ?? t('run.noCommander')} · `}
              {r.wins}-{r.losses}
              {r.draws ? `-${r.draws}` : ''} · OMW {Math.round(r.omwp * 100)}%
            </span>
          </div>
          {lists?.get(r.id) && (
            <a className="link small" {...listLinkProps(lists.get(r.id)!)} onClick={(e) => e.stopPropagation()}>
              {t('live.list')}
            </a>
          )}
          <b className="pts-inline">{r.points}</b>
        </li>
      ))}
    </ul>
  )
}

const playing = (x: Tournament) => x.status === 'swiss' || x.status === 'cut'
const today = () => new Date().toLocaleDateString('sv') // the local day, as YYYY-MM-DD

/** On the home, when a tournament is being played: to follow it (one) or pick one (more); `calendar`: its link beside. */
export function LiveLink({ open, calendar }: { open: (id?: string) => void; calendar?: () => void }) {
  const { t } = useI18n()
  const { tournaments, loaded } = useTournaments()
  const live = tournaments.filter(([, x]) => playing(x))
  // once read, a red dot says there's none rather than the row disappearing
  if (!loaded) return null
  const follow = () => open(live.length === 1 ? live[0][0] : undefined)
  const title = (
    <span className="title-live">
      {t('live.title')}
      <LiveDot live={live.length ? 'live' : 'none'} />
    </span>
  )
  // none: the red dot says it, no words to squeeze beside the calendar
  const status = live.length > 0 && <span className="muted small">{t('live.follow', { n: live.length })}</span>
  if (calendar)
    return (
      <div className="card home-row">
        <button className="home-row-link" onClick={follow}>
          {title}
          {status}
        </button>
        <button className="home-row-link link" onClick={calendar}>
          <Icon name="calendar" size={16} /> {t('cal.title')}
        </button>
      </div>
    )
  return (
    <button className="card home-row" onClick={follow}>
      {title}
      <span className="home-row-link">
        {status}
        <Icon name="chevron" size={16} />
      </span>
    </button>
  )
}

/** On the home: the live link, then the next tournaments but the player's own (they have their card); with none,
 *  no card and the calendar's link in the live row. */
export function NextTournaments({ me, open, openCalendar }: { me: string | null; open: (id?: string) => void; openCalendar: () => void }) {
  const { t } = useI18n()
  const next = upcoming(useTournaments().tournaments)
  const entered = useEntered(
    next.map(([id]) => id),
    me,
  )
  const others = entered ? next.filter(([id]) => !entered.has(id)) : []
  return (
    <>
      <LiveLink open={open} calendar={entered && !others.length ? openCalendar : undefined} />
      {others.length > 0 && (
        <section className="card">
          <div className="card-title">
            {t('cal.next')}
            <button className="link" onClick={openCalendar}>
              {t('cal.title')}
            </button>
          </div>
          <ul className="card-list">
            {others.slice(0, 2).map(([id, x]) => (
              <CalendarRow key={id} id={id} x={x} me={me} open={open} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

const dayOf = (x: Tournament) => new Date(x.date + 'T12:00') // midday: the same day in every time zone

/** A tournament of the calendar: its day, time and venue, and whether registration is open (or the player is in). */
function CalendarRow({ id, x, me, open }: { id: string; x: Tournament; me: string | null; open: (id: string) => void }) {
  const { t, lang } = useI18n()
  const players = useLiveCollection<Player>(`tournaments/${id}/players`).docs
  const n = players.filter(([, p]) => p.drop == null && !p.pending).length
  const mine = !!me && players.some(([k]) => k === me)
  const d = dayOf(x)
  const short = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(lang, o).replace('.', '').toUpperCase()
  return (
    <li className="event-row" onClick={() => open(id)}>
      <span className="cal-date">
        <small>{short({ weekday: 'short' })}</small>
        <b>{d.getDate()}</b>
        <small>{short({ month: 'short' })}</small>
      </span>
      <div className="event-main">
        <strong className="ellipsis">{tournamentTitle(x, t)}</strong>
        <span className="muted small ellipsis">{[x.time, x.place].filter(Boolean).join(' · ') || t('cal.tbd')}</span>
        <span className={`tag ${mine ? 'idea' : x.code ? 'new' : ''}`}>
          {mine ? t('cal.in') : x.code ? t('run.status.open') : t('cal.notYet')} · {t('run.qrCount', { n })}
        </span>
      </div>
    </li>
  )
}

/** The calendar: the tournaments not started yet, month by month; the player's leagues are the ones they played in. */
export function CalendarPage({ me, dataset, open, onBack }: { me: string | null; dataset: MetaDataset | null; open: (id: string) => void; onBack: () => void }) {
  const { t, lang } = useI18n()
  const { tournaments, loaded } = useTournaments()
  const [f, setF] = useState<'all' | 'mine' | 'events'>('all')
  const leagues = useMemo(
    () => new Set(me && dataset ? dataset.entries.filter((e) => e.key === me).map((e) => dataset.tournaments[e.t]?.league) : []),
    [dataset, me],
  )
  const shown = upcoming(tournaments).filter(([, x]) => (f === 'all' ? true : f === 'events' ? x.kind !== 'league' : x.kind === 'league' && leagues.has(x.name)))
  const months = new Map<string, [string, Tournament][]>()
  for (const r of shown) months.set(r[1].date.slice(0, 7), [...(months.get(r[1].date.slice(0, 7)) ?? []), r])
  return (
    <SubPageShell title={t('cal.title')} onBack={onBack}>
      <div className="seg wide">
        {(['all', ...(leagues.size ? ['mine' as const] : []), 'events'] as const).map((v) => (
          <button key={v} className={f === v ? 'on' : ''} onClick={() => setF(v)}>
            {t(`cal.${v}`)}
          </button>
        ))}
      </div>
      {!shown.length && <p className="muted no-margin">{loaded ? t('cal.none') : '…'}</p>}
      {[...months].map(([m, rows]) => (
        <section key={m}>
          <h3 className="group-title">{dayOf(rows[0][1]).toLocaleDateString(lang, { month: 'long', year: 'numeric' })}</h3>
          <ul className="card-list">
            {rows.map(([id, x]) => (
              <CalendarRow key={id} id={id} x={x} me={me} open={open} />
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small group-note">{t('cal.hint')}</p>
    </SubPageShell>
  )
}

/** A row of the list: its round and time left, or once over its winner. */
function Row({ id, x, open }: { id: string; x: Tournament; open: (id: string) => void }) {
  const { t } = useI18n()
  const now = useNow()
  // the list already has the tournament; the matches only for the winner, once it's over
  const players = useLiveCollection<Player>(`tournaments/${id}/players`).docs
  const matches = useLiveCollection<TableMatch>(x.status === 'done' ? `tournaments/${id}/matches` : null).docs
  const winner = x.status === 'done' && players.length ? ranking(x, players, matches.map(([, m]) => m))[0] : null
  return (
    <li className="event-row" onClick={() => open(id)}>
      <div className="event-main">
        <strong className="ellipsis">{tournamentTitle(x, t)}</strong>
        <span className="muted small ellipsis">
          {winner
            ? t('live.won', { p: winner.name, c: winner.commander ?? '—' })
            : `${tournamentStatus(x, t)} · ${t('run.players', { n: players.filter(([, p]) => p.drop == null && !p.pending).length })}`}
        </span>
      </div>
      {playing(x) && <b className="to-score">{clockLabel(timeLeft(x, now), t)}</b>}
      <Icon name="chevron" size={16} />
    </li>
  )
}

/** The tournaments being played, and the ones over today. */
export default function LiveList({ onBack, open }: { onBack: () => void; open: (id: string) => void }) {
  const { t } = useI18n()
  const { tournaments, loaded } = useTournaments()
  const live = tournaments.filter(([, x]) => playing(x))
  const over = tournaments.filter(([, x]) => x.status === 'done' && x.date === today())
  return (
    <SubPageShell title={t('live.title')} onBack={onBack}>
      {/* on a computer the ones over today beside the ones being played */}
      <div className="to-cols even">
        <section className="card">
          <div className="card-title">{t('live.now')}</div>
          {!live.length ? (
            <p className="muted small no-margin">{loaded ? t('live.none') : '…'}</p>
          ) : (
            <ul className="card-list">
              {live.map(([id, x]) => (
                <Row key={id} id={id} x={x} open={open} />
              ))}
            </ul>
          )}
        </section>
        {over.length > 0 && (
          <div className="to-side">
            <section className="card">
              <div className="card-title">{t('live.today')}</div>
              <ul className="card-list">
                {over.map(([id, x]) => (
                  <Row key={id} id={id} x={x} open={open} />
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </SubPageShell>
  )
}

/** One tournament, as whoever follows it sees it: no results to enter, a search for a player. */
export function LivePage({
  id,
  me,
  onBack,
  onJoin,
  remind,
}: {
  id: string
  me: string | null
  onBack: () => void
  onJoin: (code: string) => void // to the registration, on the home
  remind?: { on: boolean; set: (on: boolean) => void } // a notification the day before: signed in, with notifications
}) {
  const { t, lang } = useI18n()
  const now = useNow()
  const { t: tour, players, matches } = useTournament(id)
  // the decklists turn public once it's over
  const lists = useLists(id, players, tour?.status === 'done')
  const [tab, setTab] = useState<'pairings' | 'standings'>('pairings')
  const wide = useWide()
  const [q, setQ] = useState('')
  const rows = useMemo(() => (tour ? ranking(tour, players, matches) : []), [tour, players, matches])
  if (!tour)
    return (
      <SubPageShell title={t('live.title')} onBack={onBack}>
        <div className="empty">…</div>
      </SubPageShell>
    )

  const names = new Map(players)
  const nameOf = (k: string | null) => (k ? (names.get(k)?.name ?? k) : t('meta.bye'))
  const current = matches.filter((m) => m.round === tour.round)
  // a finished tournament opens on its final standings, one being registered on who's in; a computer shows the
  // pairings and the standings side by side
  const both = wide && tour.status !== 'done'
  const shown = tour.status === 'done' ? 'standings' : tab
  const key = playerKey(q)
  const found = key.length < 2 ? [] : rows.map((r, i) => ({ r, place: i + 1 })).filter(({ r }) => playerKey(r.name).includes(key)).slice(0, 5)
  const title = tournamentTitle(tour, t)
  const mine = me && names.has(me) ? matches.filter((m) => m.p1 === me || m.p2 === me) : []
  const standings = (
    <section className="card">
      <div className="card-title">{tour.status === 'done' ? t('run.final') : t('run.standings')}</div>
      <RankingList rows={rows} lists={lists} secret={tour.status !== 'done'} />
    </section>
  )

  return (
    <SubPageShell title={title} onBack={onBack} actions={<ShareButton text={t('live.share', { n: title })} />}>
      <section className="card">
        <div className="card-title">
          {tournamentStatus(tour, t)}
          <span className="muted small">
            {new Date(tour.date).toLocaleDateString(lang, { day: 'numeric', month: 'short' })} ·{' '}
            {t('run.players', { n: players.filter(([, p]) => p.drop == null && !p.pending).length })}
          </span>
        </div>
        {playing(tour) && (
          <div className="to-clock">
            <b>{clockLabel(timeLeft(tour, now), t)}</b>
          </div>
        )}
      </section>

      {/* not started yet: when and where, to register, into the phone's calendar, a reminder */}
      {tour.status === 'open' && (
        <section className="card">
          <div className="cal-line">
            <Icon name="calendar" size={18} />
            <div className="event-main">
              <strong>{new Date(tour.date + 'T12:00').toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
              <span className="muted small">
                {[tour.time && t('cal.start', { t: tour.time }), tour.cut ? t('cal.swissCut', { n: tour.cut }) : t('cal.swiss')].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
          {(tour.place || tour.address) && (
            <div className="cal-line">
              <Icon name="pin" size={18} />
              <div className="event-main">
                <strong>{tour.place || tour.address}</strong>
                {tour.place && tour.address && <span className="muted small">{tour.address}</span>}
                <a className="link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([tour.place, tour.address].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">
                  {t('cal.maps')}
                </a>
              </div>
            </div>
          )}
          {tour.code && !(me && names.has(me)) && (
            <button className="btn primary" onClick={() => onJoin(tour.code!)}>
              {t('join.register')}
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              const a = document.createElement('a')
              a.href = URL.createObjectURL(new Blob([icsOf(id, tour, title, `${location.origin}${location.pathname}#live/${encodeURIComponent(id)}`)], { type: 'text/calendar' }))
              a.download = 'castra.ics'
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            <Icon name="calendar" size={16} /> {t('cal.ics')}
          </button>
          {remind && <Toggle label={t('cal.remind')} hint={t('cal.remindHint')} on={remind.on} set={remind.set} />}
        </section>
      )}

      {tour.status !== 'open' && (
        <>
          <label className="search">
            <Icon name="search" size={18} />
            <input type="search" placeholder={t('live.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {found.map(({ r, place }) => {
            const m = current.find((x) => x.p1 === r.id || x.p2 === r.id)
            const opp = m && (m.p1 === r.id ? m.p2 : m.p1)
            return (
              <section key={r.id} className="card">
                <div className="card-title">
                  {r.name}
                  <span className="muted small">
                    {placeLabel(place, lang)} · {t('live.points', { n: r.points })}
                  </span>
                </div>
                <p className="muted small no-margin">
                  {r.dropped
                    ? t('run.dropped')
                    : tour.status === 'done'
                      ? (r.commander ?? '')
                      : !m
                        ? ''
                        : !opp
                        ? t('meta.bye')
                        : t('live.table', { n: m.table, p: nameOf(opp), s: scoreText(m) })}
                </p>
              </section>
            )
          })}
          {tour.status !== 'done' && !both && (
            <div className="seg wide">
              {(['pairings', 'standings'] as const).map((v) => (
                <button key={v} className={shown === v ? 'on' : ''} onClick={() => setTab(v)}>
                  {t(v === 'pairings' ? 'run.pairings' : 'run.standings')}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* on a computer the pairings beside the standings */}
      <div className="to-cols">
        {mine.length > 0 && (
          <section className="card">
            <div className="card-title">{t('live.mine')}</div>
            <ul className="card-list">
              {mine.map((m) => {
                const opp = m.p1 === me ? m.p2 : m.p1
                return (
                  <li key={m.round} className="event-row">
                    <span className="place-badge">{m.round}</span>
                    <div className="event-main">
                      <span className="ellipsis">{opp ? nameOf(opp) : t('meta.bye')}</span>
                      <span className="ellipsis muted small">{opp ? (names.get(opp)?.commander ?? '') : ''}</span>
                    </div>
                    <span className="to-score">{!opp ? '2-0' : m.score ? sideScore(m.score, m.p2 === me) + (unconfirmed(m) ? '?' : '') : '—'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {tour.status === 'open' ? (
          <section className="card">
            <div className="card-title">{t('run.registered')}</div>
            <ul className="card-list">
              {players
                .filter(([, p]) => !p.pending)
                .sort((a, b) => a[1].name.localeCompare(b[1].name))
                .map(([k, p]) => (
                  <li key={k} className="event-row">
                    <div className="event-main">
                      <span className="ellipsis">{p.name}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ) : (
          <>
            {(both || shown === 'pairings') && (
              <section className="card">
                <div className="card-title">{tour.status === 'cut' ? t('run.cutRound', { n: current.length * 2 }) : t('run.roundN', { n: tour.round })}</div>
                <MatchList matches={current} nameOf={nameOf} me={me} />
              </section>
            )}
            {both ? <div className="to-side">{standings}</div> : shown === 'standings' && standings}
          </>
        )}
      </div>
    </SubPageShell>
  )
}
