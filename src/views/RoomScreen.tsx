import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type TableMatch, clockLabel, liveLink, joinLink, ranking, timeLeft, tournamentTitle, useNow, useTournament } from '../lib/tournaments'
import { winnerOf } from '../lib/swiss'
import { useQr } from '../lib/qr'
import { useWakeLock } from '../lib/wakeLock'

// The screen for the room (#screen/<id>): on the computer of a projector or a TV, no sign-in (the tournaments are
// public), no app around it. Drawn on a 1920×1080 stage scaled to the window, so it reads the same on any screen.

const W = 1920
const H = 1080
const PAGE_MS = 12_000 // long lists turn page by themselves

const fit = () => Math.min(innerWidth / W, innerHeight / H)

function Qr({ text, label }: { text: string; label: string }) {
  const qr = useQr(text)
  return (
    <div className="rs-qr">
      {qr && (
        <svg viewBox={`-1 -1 ${qr.n + 2} ${qr.n + 2}`} shapeRendering="crispEdges" role="img" aria-label={label}>
          <path d={qr.d} />
        </svg>
      )}
    </div>
  )
}

export default function RoomScreen({ id }: { id: string }) {
  const { t, lang } = useI18n()
  const now = useNow()
  const { t: tour, players, matches } = useTournament(id)
  const rows = useMemo(() => (tour ? ranking(tour, players, matches) : []), [tour, players, matches])
  const [scale, setScale] = useState(fit)
  const [full, setFull] = useState(!!document.fullscreenElement)
  useWakeLock(true)
  useEffect(() => {
    const onResize = () => setScale(fit())
    const onFull = () => setFull(!!document.fullscreenElement)
    addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [])

  // the same page for every list, so they turn together
  const page = <T,>(list: T[], per: number) => {
    const p = Math.floor(now / PAGE_MS) % Math.max(1, Math.ceil(list.length / per))
    return { items: list.slice(p * per, p * per + per), from: p * per + 1, to: Math.min(list.length, p * per + per) }
  }
  const names = new Map(players)
  const nameOf = (k: string | null) => (k ? (names.get(k)?.name ?? k) : '—')
  const active = players.filter(([, p]) => p.drop == null && !p.pending).length

  const body = () => {
    if (!tour) return <div className="rs-empty">…</div>

    if (tour.status === 'open') {
      const shown = page(
        players.filter(([, p]) => !p.pending).map(([, p]) => p.name).sort((a, b) => a.localeCompare(b)),
        30,
      )
      return (
        <div className="rs-body rs-open">
          <section className="rs-panel rs-join">
            {tour.code && (
              <>
                <Qr text={joinLink(tour.code)} label={t('run.qrAlt')} />
                <span className="rs-note">{t('screen.scan')}</span>
                <b className="rs-code">{tour.code}</b>
              </>
            )}
          </section>
          <section className="rs-panel">
            <div className="rs-panel-head">
              <h2>{t('run.registered')}</h2>
              <b className="rs-count">{active}</b>
            </div>
            <div className="rs-names">
              {shown.items.map((n, i) => (
                <span key={i} className="rs-cell">
                  {n}
                </span>
              ))}
            </div>
            <span className="rs-note rs-foot">{t('screen.secret')}</span>
          </section>
        </div>
      )
    }

    if (tour.status === 'cut') {
      const levels = Math.log2(tour.cut)
      const cols = (['quarters', 'semis', 'final'] as const).slice(3 - levels)
      return (
        <div className="rs-body rs-bracket" style={{ gridTemplateColumns: `repeat(${levels}, minmax(0, 1fr))` }}>
          {cols.map((c, k) => {
            const round = tour.rounds + 1 + k
            const on = round === tour.round
            const ms = matches.filter((m) => m.round === round)
            const shown: (TableMatch | null)[] = ms.length ? ms : Array(tour.cut / 2 ** (k + 1)).fill(null)
            return (
              <div key={c} className="rs-col">
                <span className={`rs-col-title ${on ? 'on' : ''}`}>
                  {t(`screen.${c}`)}
                  {on && ` · ${t('screen.now')}`}
                </span>
                <div className="rs-col-list">
                  {shown.map((m, i) => {
                    const w = m?.score ? winnerOf(m.score) : 0
                    return (
                      <div key={i} className={`rs-match ${on ? 'on' : ''} ${m ? '' : 'later'}`}>
                        {([1, 2] as const).map((side) => (
                          <div key={side} className={`rs-side ${w && w !== side ? 'out' : ''}`}>
                            <span className="rs-num">{on && side === 1 && m ? m.table : ''}</span>
                            <span className="rs-name">{m ? nameOf(side === 1 ? m.p1 : m.p2) : '—'}</span>
                            <b>{m?.score?.[side - 1] ?? ''}</b>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    const record = (r: (typeof rows)[number]) => `${r.wins}-${r.losses}${r.draws ? `-${r.draws}` : ''}`

    if (tour.status === 'done') {
      const shown = page(rows, 16)
      return (
        <div className="rs-body">
          <section className="rs-panel">
            <div className="rs-panel-head">
              <h2>{t('run.final')}</h2>
              <span className="rs-note">{t('screen.places', { a: shown.from, b: shown.to })}</span>
            </div>
            <div className="rs-grid">
              {shown.items.map((r, i) => (
                <div key={r.id} className={`rs-cell rs-row ${shown.from + i === 1 ? 'first' : ''}`}>
                  <span className="rs-num">{shown.from + i}</span>
                  <div className="rs-two">
                    <span>{r.name}</span>
                    <span className="rs-muted">{r.commander ?? t('run.noCommander')}</span>
                  </div>
                  <span className="rs-rec">{record(r)}</span>
                  <b>{r.points}</b>
                </div>
              ))}
            </div>
          </section>
        </div>
      )
    }

    // the Swiss rounds: the tables beside the standings; the bye last
    const tables = page(
      matches.filter((m) => m.round === tour.round).sort((a, b) => (a.p2 ? a.table : 999) - (b.p2 ? b.table : 999)),
      16,
    )
    const standing = page(rows, 12)
    return (
      <div className="rs-body rs-swiss">
        <section className="rs-panel">
          <div className="rs-panel-head">
            <h2>{t('run.pairings')}</h2>
            <span className="rs-note">{t('screen.tables', { a: tables.from, b: tables.to })}</span>
          </div>
          <div className="rs-grid">
            {tables.items.map((m) => (
              <div key={m.table} className="rs-cell rs-row">
                <span className="rs-num">{m.p2 ? m.table : '—'}</span>
                <div className="rs-two">
                  <span>{nameOf(m.p1)}</span>
                  <span className="rs-muted">{m.p2 ? nameOf(m.p2) : t('meta.bye')}</span>
                </div>
                <b className={m.p2 && !m.score ? 'rs-muted' : ''}>
                  {!m.p2 ? '2-0' : m.score ? m.score.slice(0, m.score[2] ? 3 : 2).join('-') : '—'}
                </b>
              </div>
            ))}
          </div>
        </section>
        <section className="rs-panel">
          <div className="rs-panel-head">
            <h2>{t('run.standings')}</h2>
            <span className="rs-note">{t('screen.places', { a: standing.from, b: standing.to })}</span>
          </div>
          <div className="rs-list">
            {standing.items.map((r, i) => (
              <div key={r.id} className="rs-line">
                <span className="rs-num">{standing.from + i}</span>
                <span className="rs-name">{r.name}</span>
                <span className="rs-rec">{record(r)}</span>
                <b>{r.points}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const left = tour ? timeLeft(tour, now) : null
  const current = tour ? matches.filter((m) => m.round === tour.round && m.p2) : []
  const levelName = tour?.status === 'cut' ? (['final', 'semis', 'quarters'] as const)[Math.log2(tour.cut) - (tour.round - tour.rounds)] : null
  const kicker = !tour
    ? ''
    : tour.status === 'open'
      ? t('run.status.open')
      : tour.status === 'done'
        ? t('run.status.done')
        : tour.status === 'cut'
          ? `${t('run.cutRound', { n: tour.cut })} · ${levelName ? t(`screen.${levelName}`) : ''}`
          : t('run.round', { n: tour.round, of: tour.rounds || '?' })
  const day = tour && new Date(tour.date + 'T12:00').toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
  const sub = !tour
    ? ''
    : tour.status === 'open'
      ? [day, tour.place].filter(Boolean).join(' · ')
      : tour.status === 'done'
        ? `${day} · ${t('run.players', { n: active })}`
        : `${t('run.players', { n: active })} · ${t('screen.results', { n: current.filter((m) => m.score).length, of: current.length })}`

  return (
    <div className="rs">
      <div className="rs-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {tour && (
          <header className="rs-head">
            <div className="rs-title">
              <span className="rs-kicker">{kicker}</span>
              <h1>{tournamentTitle(tour, t)}</h1>
              <span className="rs-sub">{sub}</span>
            </div>
            {left != null ? (
              <div className="rs-clock">
                <b className={left <= 0 ? 'bad-text' : ''}>{clockLabel(left, t)}</b>
                <span>{t('screen.clock')}</span>
              </div>
            ) : (
              tour.status === 'open' &&
              tour.time && (
                <div className="rs-clock small">
                  <b>{tour.time}</b>
                  <span>{t('screen.start')}</span>
                </div>
              )
            )}
          </header>
        )}
        {body()}
        {tour && tour.status !== 'open' && (
          <footer className="rs-footer">
            <Qr text={liveLink(id)} label={t('screen.follow')} />
            <div className="rs-two">
              <span>{t(tour.status === 'done' ? 'screen.followDone' : 'screen.follow')}</span>
              <span className="rs-muted">{t(tour.status === 'done' ? 'screen.followDoneHint' : 'screen.followHint')}</span>
            </div>
            <span className="rs-brand">Castra</span>
          </footer>
        )}
      </div>
      {!full && document.fullscreenEnabled && (
        <button className="btn rs-full" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
          {t('screen.full')}
        </button>
      )}
    </div>
  )
}
