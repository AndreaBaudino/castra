import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { playerKey } from '../lib/circuit'
import {
  type RankRow,
  type TableMatch,
  type Tournament,
  clockLabel,
  ranking,
  timeLeft,
  tournamentStatus,
  tournamentTitle,
  unconfirmed,
  useNow,
  useTournament,
  useTournaments,
} from '../lib/tournaments'
import { Icon, ShareButton } from '../components/ui'
import { SubPageShell, placeLabel } from './Circuit'

// The tournaments run in the app, for whoever follows them (docs/tornei.md): the link on the home, the list of the ones
// being played (#live) and one tournament (#live/<id>) with its pairings, standings and a search for a player. The TO
// pages (Organizer.tsx) show the tables and the standings with the same lists.

// a result one player entered and the other hasn't confirmed yet ends with a question mark
const scoreText = (m: TableMatch) =>
  !m.p2 ? '2-0' : m.score ? m.score.slice(0, m.score[2] ? 3 : 2).join('-') + (unconfirmed(m) ? '?' : '') : '—'

/** A round's tables, the bye last; `onPick` makes them tappable (the TO enters the results). */
export function MatchList({ matches, nameOf, onPick }: { matches: TableMatch[]; nameOf: (k: string | null) => string; onPick?: (m: TableMatch) => void }) {
  const { t } = useI18n()
  return (
    <ul className="card-list">
      {[...matches]
        .sort((a, b) => (a.table || 999) - (b.table || 999))
        .map((m) => (
          <li key={`${m.round}-${m.table}`} className="event-row" onClick={() => m.p2 && onPick?.(m)}>
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

/** The standings (or the final order), with each one's commander, record and opponents' match-win %. */
export function RankingList({ rows, onPick }: { rows: RankRow[]; onPick?: (id: string) => void }) {
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
              {r.commander ?? t('run.noCommander')} · {r.wins}-{r.losses}
              {r.draws ? `-${r.draws}` : ''} · OMW {Math.round(r.omwp * 100)}%
            </span>
          </div>
          <b className="pts-inline">{r.points}</b>
        </li>
      ))}
    </ul>
  )
}

const playing = (x: Tournament) => x.status === 'swiss' || x.status === 'cut'
const today = () => new Date().toLocaleDateString('sv') // the local day, as YYYY-MM-DD

/** On the home, when a tournament is being played: to follow it (one) or pick one (more). */
export function LiveLink({ open }: { open: (id?: string) => void }) {
  const { t } = useI18n()
  const live = useTournaments().tournaments.filter(([, x]) => playing(x))
  if (!live.length) return null
  return (
    <button className="card home-row" onClick={() => open(live.length === 1 ? live[0][0] : undefined)}>
      <span className="title-live">{t('live.title')}</span>
      <span className="home-row-link">
        <span className="muted small">{t('live.follow', { n: live.length })}</span>
        <Icon name="chevron" size={16} />
      </span>
    </button>
  )
}

/** A row of the list: its round and time left, or once over its winner. */
function Row({ id, x, open }: { id: string; x: Tournament; open: (id: string) => void }) {
  const { t } = useI18n()
  const now = useNow()
  const { players, matches } = useTournament(id)
  const winner = x.status === 'done' && players.length ? ranking(x, players, matches)[0] : null
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
        <section className="card">
          <div className="card-title">{t('live.today')}</div>
          <ul className="card-list">
            {over.map(([id, x]) => (
              <Row key={id} id={id} x={x} open={open} />
            ))}
          </ul>
        </section>
      )}
    </SubPageShell>
  )
}

/** One tournament, as whoever follows it sees it: no results to enter, a search for a player. */
export function LivePage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, lang } = useI18n()
  const now = useNow()
  const { t: tour, players, matches } = useTournament(id)
  const [tab, setTab] = useState<'pairings' | 'standings'>('pairings')
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
  // a finished tournament opens on its final standings, one being registered on who's in
  const shown = tour.status === 'done' ? 'standings' : tab
  const key = playerKey(q)
  const found = key.length < 2 ? [] : rows.map((r, i) => ({ r, place: i + 1 })).filter(({ r }) => playerKey(r.name).includes(key)).slice(0, 5)
  const title = tournamentTitle(tour, t)

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
                    : !m || tour.status === 'done'
                      ? (r.commander ?? '')
                      : !opp
                        ? t('meta.bye')
                        : t('live.table', { n: m.table, p: nameOf(opp), s: scoreText(m) })}
                </p>
              </section>
            )
          })}
          {tour.status !== 'done' && (
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
                    <span className="ellipsis muted small">{p.commander ?? ''}</span>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ) : shown === 'pairings' ? (
        <section className="card">
          <div className="card-title">{tour.status === 'cut' ? t('run.cutRound', { n: current.length * 2 }) : t('run.roundN', { n: tour.round })}</div>
          <MatchList matches={current} nameOf={nameOf} />
        </section>
      ) : (
        <section className="card">
          <div className="card-title">{tour.status === 'done' ? t('run.final') : t('run.standings')}</div>
          <RankingList rows={rows} />
        </section>
      )}
    </SubPageShell>
  )
}
