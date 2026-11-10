import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import type { AppUser } from '../lib/auth'
import { type Circuit, playerKey } from '../lib/circuit'
import type { MetaDataset } from '../lib/meta'
import { type Organizer, canRun, useOrganizers } from '../lib/organizers'
import { isEvent, sourceYear, useSources, type Source } from '../lib/sources'
import { type Score, suggestedRounds, validScore, winnerOf } from '../lib/swiss'
import { cardSuggestions, closest } from '../lib/aliases'
import type { Claim } from '../lib/claims'
import {
  type Infraction,
  type LogEntry,
  type Penalty,
  INFRACTIONS,
  PENALTIES,
  addPenalty,
  type Player,
  type TableMatch,
  type Tournament,
  canPublish,
  confirmPlayer,
  createTournament,
  deleteTournament,
  finishTournament,
  hasCommander,
  joinLink,
  screenLink,
  listLinkProps,
  loadList,
  loadLists,
  newCode,
  nextCutRound,
  nextStage,
  pairSwiss,
  photoLink,
  publishTournament,
  removePlayer,
  replacePhoto,
  ranking,
  reportScore,
  savePlayer,
  setDrop,
  clockLabel,
  setExtra,
  setFiled,
  setScore,
  setTournament,
  sheetData,
  sheetRows,
  startClock,
  startCut,
  timeLeft,
  tournamentStatus,
  tournamentTitle,
  tournamentsOf,
  unconfirmed,
  useNow,
  useTournament,
  unpublishTournament,
  useLists,
  useLog,
  useTournaments,
  useUnfiled,
} from '../lib/tournaments'
import { Icon, Sheet, useBackCloses } from '../components/ui'
import { NOTIFY_URL, TOURNAMENT_GUIDE_URL } from '../config'
import { pushBlock, turnOnPush } from '../lib/push'
import { useDialog } from '../components/Dialog'
import { LiveDot, SubPageShell } from './Circuit'
import { useWakeLock } from '../lib/wakeLock'
import { useQr } from '../lib/qr'
import { Toggle } from './Account'
import { MatchList, RankingList } from './Live'
import { JoinSheet } from './MyTournament'
import { type Deck, parseDecklist } from '../lib/decks'
import { useIsAdmin } from '../lib/admin'
import { savePicture, standingsImage } from '../lib/standingsImage'

// The tournament organizers' pages (docs/tornei.md): the card on the home, the TO area (#to) with the tournaments to
// run, and one tournament run from the phone (#to/<id>): registration, rounds, results, top cut, the rows for the sheet.

/** The tournaments this TO runs, by their sheets: from yesterday on, and the older ones not in the sheet yet. */
function useRun(uid: string, organizer: Organizer) {
  const { sources } = useSources()
  const { tournaments } = useTournaments()
  const unfiled = useUnfiled()
  const bySheet = useMemo(() => new Map(sources.map((s) => [s.drive, s])), [sources])
  const all = new Map([...unfiled, ...tournaments])
  const run = [...all].filter(([, x]) => bySheet.has(x.drive) && canRun(uid, organizer, bySheet.get(x.drive)!))
  return { sources, tournaments, run: run.sort((a, b) => a[1].date.localeCompare(b[1].date)) }
}

// ---------- the home card ----------

export function OrganizerCard({ uid, organizer, open }: { uid: string; organizer: Organizer; open: (id?: string) => void }) {
  const { t } = useI18n()
  const now = useNow()
  const live = useRun(uid, organizer).run.filter(([, x]) => x.status !== 'done')
  return (
    <section className="card">
      <div className="card-title">
        {t('run.area')}
        <span className="muted small">{organizer.leagues.join(' · ')}</span>
      </div>
      {!live.length ? (
        <p className="muted small no-margin">{t('run.nothingLive')}</p>
      ) : (
        <ul className="card-list">
          {live.slice(0, 3).map(([id, x]) => (
            <li key={id} className="event-row" onClick={() => open(id)}>
              <div className="event-main">
                <strong className="ellipsis">{tournamentTitle(x, t)}</strong>
                <span className="muted small">
                  {tournamentStatus(x, t)}
                  {x.status !== 'open' && ` · ${clockLabel(timeLeft(x, now), t)}`}
                </span>
              </div>
              <Icon name="chevron" size={16} />
            </li>
          ))}
        </ul>
      )}
      <button className="btn ghost" onClick={() => open()}>
        {t('run.allTournaments')}
      </button>
    </section>
  )
}

// ---------- the TO area ----------

export default function OrganizerArea({
  user,
  organizer,
  dataset,
  onBack,
  openTournament,
}: {
  user: AppUser | null
  organizer: Organizer | null
  dataset: MetaDataset | null
  onBack: () => void
  openTournament: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  const uid = user?.uid ?? ''
  const { sources, tournaments, run } = useRun(uid, organizer ?? { player: '', name: '', leagues: [], at: '', by: '' })
  const [adding, setAdding] = useState<{ s: Source; stage: string; date: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' })
  if (!organizer || !user)
    return (
      <SubPageShell title={t('run.area')} onBack={onBack}>
        <div className="notice">{t('run.notTo')}</div>
      </SubPageShell>
    )

  const year = new Date().getFullYear()
  // the season being played (January to May the first, as in the meta): an older season's sheet takes no new stages
  const season = new Date().getMonth() < 5 ? 's1' : 's2'
  const leagues = sources.filter(
    (s) => s.kind === 'league' && sourceYear(s) === year && s.season === season && canRun(uid, organizer, s),
  )
  const started = new Set(tournaments.map(([id]) => id))
  const levels = sources
    .filter((s) => isEvent(s.kind) && (s.date ?? '') >= today && canRun(uid, organizer, s) && !started.has(s.drive))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const create = async (s: Source, date: string, stage?: number) => {
    setBusy(true)
    try {
      const id = await createTournament(user, s, date, stage)
      setAdding(null)
      openTournament(id)
    } catch (e) {
      await dialog.alert(t((e as Error).message === 'taken' ? 'run.taken' : 'admin.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SubPageShell title={t('run.area')} onBack={onBack}>
      {/* on a computer two columns: the tournaments on the left, the rest on the right */}
      <div className="to-cols">
        <section className="card">
          <div className="card-title">{t('run.yours')}</div>
          {!run.length ? (
            <p className="muted small no-margin">{t('run.none')}</p>
          ) : (
            <ul className="card-list">
              {run.map(([id, x]) => (
                <li key={id} className="event-row" onClick={() => openTournament(id)}>
                  <div className="event-main">
                    <strong className="ellipsis">{tournamentTitle(x, t)}</strong>
                    <span className="muted small">
                      {day(x.date)} · {tournamentStatus(x, t)}
                      {x.status === 'done' && !x.filed && <span className="bad-text"> · {t('run.toFile')}</span>}
                    </span>
                  </div>
                  <Icon name="chevron" size={16} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="to-side">
          <section className="card">
            <div className="card-title">{t('run.newStage')}</div>
            {!leagues.length ? (
              <p className="muted small no-margin">{t('run.noLeagues')}</p>
            ) : (
              <ul className="card-list">
                {leagues.map((s) => (
                  <li key={s.drive} className="event-row">
                    <div className="event-main">
                      <strong className="ellipsis">{s.league}</strong>
                      <span className="muted small">
                        {(s.season ?? '').toUpperCase()} {s.year}
                      </span>
                    </div>
                    <button
                      className="btn ghost small"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          setAdding({ s, stage: String(nextStage(s, dataset, await tournamentsOf(s.drive))), date: today })
                        } catch {
                          await dialog.alert(t('admin.error'))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      <Icon name="plus" size={16} /> {t('run.stageShort')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-title">{t('run.levels')}</div>
            {!levels.length ? (
              <p className="muted small no-margin">{t('run.noLevels')}</p>
            ) : (
              <ul className="card-list">
                {levels.map((s) => (
                  <li key={s.drive} className="event-row">
                    <div className="event-main">
                      <strong className="ellipsis">{s.name}</strong>
                      <span className="muted small">
                        {t(`sources.kind.${s.kind}`)} · {day(s.date!)}
                      </span>
                    </div>
                    <button
                      className="btn ghost small"
                      disabled={busy}
                      onClick={async () => {
                        if (await dialog.confirm(t('run.startLevel', { n: s.name ?? '' }), { ok: t('run.start') })) create(s, s.date!)
                      }}
                    >
                      {t('run.start')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small no-margin">{t('run.levelsHint')}</p>
          </section>

          <section className="card menu-card">
            <a className="menu-row" href={TOURNAMENT_GUIDE_URL} target="_blank" rel="noopener noreferrer">
              <Icon name="trophy" size={20} />
              <span className="menu-label">{t('account.guideTournaments')}</span>
              <span className="muted small ellipsis menu-note">{t('run.guideHint')}</span>
              <Icon name="external" size={16} />
            </a>
          </section>
        </div>
      </div>

      <Sheet open={!!adding} onClose={() => setAdding(null)} title={adding ? `${adding.s.league} · ${t('run.newStage')}` : ''}>
        {adding && (
          <div className="form">
            <label>
              <span>{t('run.stageNumber')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                required
                value={adding.stage}
                onChange={(e) => setAdding({ ...adding, stage: e.target.value })}
              />
              <span className="field-hint">{t('run.stageHint')}</span>
            </label>
            <label>
              <span>{t('sources.date')}</span>
              <input type="date" value={adding.date} onChange={(e) => setAdding({ ...adding, date: e.target.value })} />
            </label>
            <button
              className="btn primary"
              disabled={busy || !adding.date || !stageOk(adding.stage)}
              onClick={() => create(adding.s, adding.date, +adding.stage)}
            >
              {t('run.create')}
            </button>
          </div>
        )}
      </Sheet>
    </SubPageShell>
  )
}

// ---------- one tournament ----------

// the field may be emptied while typing: only a whole number 1-60 creates the stage
const stageOk = (v: string) => /^\d+$/.test(v) && +v >= 1 && +v <= 60

const QUICK: Score[] = [[2, 0, 0], [2, 1, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0], [0, 1, 0], [1, 2, 0], [0, 2, 0]]
const same = (a: Score, b: Score) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

export function TournamentAdmin({
  id,
  user,
  organizer,
  circuit,
  claims,
  dataset,
  onBack,
  openLive,
  tourNotify,
  setTourNotify,
  decks,
}: {
  id: string
  decks: Deck[] // the TO's own, to register with one
  openLive: () => void
  tourNotify: boolean // the tournament notifications are on: the registration requests reach this TO
  setTourNotify: (on: boolean) => void
  claims: Map<string, Claim>
  user: AppUser | null
  organizer: Organizer | null
  circuit: Circuit | null
  dataset: MetaDataset | null
  onBack: () => void
}) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  const now = useNow()
  const { t: tour, players, matches } = useTournament(id)
  const [result, setResult] = useState<TableMatch | null>(null)
  const [player, setPlayer] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [joining, setJoining] = useState(false)
  const [qr, setQr] = useState(false)
  const [busy, setBusy] = useState(false)
  const rows = useMemo(() => (tour ? ranking(tour, players, matches) : []), [tour, players, matches])
  // the decklists, read once it's over: copying needs them at hand (a phone allows it only right after the tap)
  const lists = useLists(id, players, tour?.status === 'done')
  const { organizers } = useOrganizers()
  const admin = useIsAdmin(user?.uid ?? null)
  const log = useLog(tour ? id : null, tour?.at ?? '')

  if (!organizer || !user)
    return (
      <SubPageShell title={t('run.area')} onBack={onBack}>
        <div className="notice">{t('run.notTo')}</div>
      </SubPageShell>
    )
  if (!tour)
    return (
      <SubPageShell title={t('run.area')} onBack={onBack}>
        <div className="empty">…</div>
      </SubPageShell>
    )

  const names = new Map(players)
  const nameOf = (k: string | null) => (k ? (names.get(k)?.name ?? k) : t('meta.bye'))
  // who did it: a TO, a player of the tournament, otherwise an admin
  const whoOf = (uid: string) => organizers.get(uid)?.name ?? players.find(([, p]) => p.uid === uid)?.[1].name ?? t('log.admin')
  const penalties = new Map<string, number>()
  for (const e of log) if (e.player && isPenalty(e)) penalties.set(e.player, (penalties.get(e.player) ?? 0) + 1)
  const current = matches.filter((m) => m.round === tour.round)
  const missing = current.filter((m) => m.p2 && !m.score).length
  const toConfirm = current.filter(unconfirmed).length
  const pending = players.filter(([, p]) => p.pending)
  const entered = players.filter(([, p]) => !p.pending)
  const active = entered.filter(([, p]) => p.drop == null)
  const noCommander = entered.filter(([, p]) => !hasCommander(p)).length
  const listed = entered.filter(([, p]) => p.list && !p.deck).length // a deck of the app: its photo is the decklist
  const linked = entered.filter(([, p]) => p.deck).length
  const playing = tour.status === 'swiss' || tour.status === 'cut'
  const lastSwiss = tour.status === 'swiss' && tour.round >= tour.rounds
  const cutDone = tour.status === 'cut' && !missing && current.every((m) => !m.p2 || (m.score && winnerOf(m.score)))
  const rounds = [...new Set(matches.map((m) => m.round))].filter((r) => r !== tour.round || tour.status === 'done')

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }
  // results the opponent hasn't confirmed: the TO decides whether they stand
  const confirmed = async () => !toConfirm || dialog.confirm(t('run.unconfirmedConfirm', { n: toConfirm }), { ok: t('run.goOn') })
  const nextRound = async () => {
    if (missing && !(await dialog.confirm(t('run.missingConfirm', { n: missing }), { ok: t('run.pairAnyway') }))) return
    if (await confirmed()) act(() => pairSwiss(id, tour, players, matches))
  }
  const shareCode = async (code: string) => {
    const url = joinLink(code)
    if (navigator.share) return navigator.share({ title: 'Castra', text: t('run.codeShare', { n: tournamentTitle(tour, t), c: code }), url }).catch(() => {})
    copy(url, t('run.linkCopied'))
  }
  const publish = async () => {
    const tab = tour.stage ? t('run.stage', { n: tour.stage }) : 'Classifica'
    if (!(await dialog.confirm(t('run.publishConfirm', { n: tab }), { ok: t('run.publish') }))) return
    setBusy(true)
    try {
      // the lists read now: a list of Castra put back since the page opened goes in, before any link
      const res = await publishTournament(id, sheetData(tour, players, matches, await loadLists(id, players)))
      const added = [
        res.players.length ? t('run.publishedPlayers', { p: res.players.join(', ') }) : '',
        res.commanders.length ? t('run.publishedCommanders', { p: res.commanders.join(', ') }) : '',
        res.manual.length ? t('run.publishedManual', { p: res.manual.join(', ') }) : '',
      ]
      await dialog.alert([t('run.published', { n: res.tab }), ...added].filter(Boolean).join('\n\n'))
    } catch (e) {
      const msg = (e as Error).message
      await dialog.alert(msg === 'login' ? t('run.publishLogin') : t('run.publishError', { e: msg }))
    } finally {
      setBusy(false)
    }
  }
  const unpublish = async () => {
    if (!(await dialog.confirm(t('run.unpublishConfirm', { n: tour.published!.tab }), { ok: t('run.unpublish'), danger: true }))) return
    setBusy(true)
    try {
      const res = await unpublishTournament(id)
      await dialog.alert([t('run.unpublished', { n: res.tab }), res.kept.length ? t('run.unpublishedKept', { p: res.kept.join(', ') }) : ''].filter(Boolean).join('\n\n'))
    } catch (e) {
      const msg = (e as Error).message
      await dialog.alert(msg === 'login' ? t('run.publishLogin') : t('run.unpublishError', { e: msg }))
    } finally {
      setBusy(false)
    }
  }
  const picture = () =>
    act(async () => {
      const day = new Date(tour.date).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
      const head = t('run.pictureHead').split('|') as [string, string, string, string, string]
      const title = tournamentTitle(tour, t)
      const sub = `${day} · ${t('run.players', { n: rows.length })}`
      const blob = await standingsImage(rows, { title, subtitle: sub, head, dropped: t('run.dropped') }, lang)
      await savePicture(blob, `${title.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`)
    })
  const copy = async (text: string, done = t('run.copied')) => {
    try {
      await navigator.clipboard.writeText(text)
      await dialog.alert(done)
    } catch {
      await dialog.alert(t('admin.error'))
    }
  }
  return (
    <SubPageShell title={tournamentTitle(tour, t)} onBack={onBack}>
      {/* on a computer two columns: the round on the left, standings and players on the right */}
      <div className="to-cols">
        <section className="card">
          <div className="card-title">
            {tournamentStatus(tour, t)}
            <span className="muted small">
              {new Date(tour.date).toLocaleDateString(lang, { day: 'numeric', month: 'short' })} · {t('run.players', { n: active.length })}
            </span>
          </div>
          {playing && (
            <div className="to-clock">
              <b className={(timeLeft(tour, now) ?? 1) <= 0 ? 'bad-text' : ''}>{clockLabel(timeLeft(tour, now), t)}</b>
              <span className="muted small">
                {missing ? t('run.missing', { n: missing }) : t('run.allIn')}
                {toConfirm > 0 && ` · ${t('run.toConfirm', { n: toConfirm })}`}
              </span>
            </div>
          )}
          {tour.status === 'open' && (
            <div className="to-code">
              <div>
                <span className="muted small">{t('run.code')}</span>
                <b>{tour.code ?? '—'}</b>
              </div>
              {tour.code && (
                <>
                  <button className="btn tonal small" onClick={() => setQr(true)} aria-label={t('run.qrShow')}>
                    <Icon name="qr" size={18} /> QR
                  </button>
                  <button className="icon-btn" onClick={() => shareCode(tour.code!)} aria-label={t('share.label')}>
                    <Icon name="share" size={18} />
                  </button>
                </>
              )}
            </div>
          )}
          {tour.status === 'open' && (
            <button
              className="btn ghost small to-new-code"
              disabled={busy}
              onClick={async () => {
                if (!tour.code || (await dialog.confirm(t('run.newCodeConfirm'), { ok: t('run.newCode') }))) act(() => setTournament(id, { code: newCode() }))
              }}
            >
              {t(tour.code ? 'run.newCode' : 'run.makeCode')}
            </button>
          )}
          {qr && tour.status === 'open' && tour.code && (
            <QrScreen tour={tour} code={tour.code} players={active.length} onShare={() => shareCode(tour.code!)} onClose={() => setQr(false)} />
          )}
          {/* a TO who plays too: with one of their decks, for their stats, as the players do from the home */}
          {tour.status === 'open' && (
            <button className="btn ghost" onClick={() => setJoining(true)}>
              {t(names.has(organizer.player) ? 'run.myEntry' : 'run.joinToo')}
            </button>
          )}
          {/* the requests reach the TO only with the notifications on: a TO never registers, so never gets asked */}
          {tour.status === 'open' && NOTIFY_URL && !tourNotify && !pushBlock() && (
            <div className="notice">
              {t('run.notifyAsk')}{' '}
              <button className="btn ghost small" onClick={() => turnOnPush(user.uid, setTourNotify)}>
                {t('push.enable')}
              </button>
            </div>
          )}
          {/* the room's projector or TV: opened on that computer, or its link sent there */}
          <a className="btn tonal" href={screenLink(id)} target="_blank" rel="noreferrer">
            <Icon name="screen" size={18} /> {t('run.screen')}
          </a>
          <div className="to-screen">
            <span className="muted small">{t('run.screenHint')}</span>
            <button className="btn ghost small" onClick={() => copy(screenLink(id), t('run.linkCopied'))}>
              {t('run.copyLink')}
            </button>
          </div>
          <button className="link" onClick={openLive}>
            {t('run.livePage')}
          </button>
          {(tour.status === 'open' || tour.status === 'swiss') && (
            <>
              <div className="stepper to-step">
                <span>
                  {t('run.rounds')} <span className="muted small">{t('run.suggested', { n: suggestedRounds(active.length) })}</span>
                </span>
                <div className="stepper-ctrl">
                  <button
                    disabled={busy || (tour.rounds || suggestedRounds(active.length)) <= Math.max(1, tour.round)}
                    onClick={() => act(() => setTournament(id, { rounds: (tour.rounds || suggestedRounds(active.length)) - 1 }))}
                  >
                    −
                  </button>
                  <b>{tour.rounds || suggestedRounds(active.length)}</b>
                  <button
                    disabled={busy || (tour.rounds || suggestedRounds(active.length)) >= 15}
                    onClick={() => act(() => setTournament(id, { rounds: (tour.rounds || suggestedRounds(active.length)) + 1 }))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="stepper to-step">
                <span>{t('run.cut')}</span>
                <div className="seg">
                  {([0, 2, 4, 8] as const).map((n) => (
                    <button
                      key={n}
                      className={tour.cut === n ? 'on' : ''}
                      disabled={busy || n > active.length}
                      onClick={() => act(() => setTournament(id, { cut: n }))}
                    >
                      {n ? `Top ${n}` : t('run.noCut')}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {tour.status === 'open' && <CalendarCard id={id} tour={tour} />}

        {playing && (
          <section className="card to-tables">
            <div className="card-title">{tour.status === 'cut' ? t('run.cutRound', { n: current.length * 2 }) : t('run.pairings')}</div>
            <MatchList matches={current} nameOf={nameOf} onPick={setResult} />
            <p className="muted small no-margin">{t('run.tapTable')}</p>
          </section>
        )}

        <div className="btn-col">
          {tour.status === 'open' && (
            <button
              className="btn primary"
              disabled={busy || active.length < 2}
              onClick={async () => {
                if (pending.length && !(await dialog.confirm(t('run.pendingConfirm', { n: pending.length }), { ok: t('run.startAnyway'), danger: true })))
                  return
                if (noCommander && !(await dialog.confirm(t('run.noCommanderConfirm', { n: noCommander }), { ok: t('run.startAnyway') }))) return
                act(async () => {
                  if (!tour.rounds) await setTournament(id, { rounds: suggestedRounds(active.length) })
                  await pairSwiss(id, { ...tour, rounds: tour.rounds || suggestedRounds(active.length) }, players, matches)
                })
              }}
            >
              {t('run.startRound', { n: 1 })}
            </button>
          )}
          {playing && tour.paused && (
            <button className="btn primary" disabled={busy} onClick={() => act(() => startClock(id, tour.round))}>
              {t('run.startClock', { n: tour.round })}
            </button>
          )}
          {tour.status === 'swiss' && !lastSwiss && (
            <button className={`btn ${tour.paused ? 'tonal' : 'primary'}`} disabled={busy} onClick={nextRound}>
              {t('run.startRound', { n: tour.round + 1 })}
            </button>
          )}
          {lastSwiss && tour.cut > 0 && (
            <button
              className="btn primary"
              disabled={busy || missing > 0 || active.length < tour.cut}
              onClick={async () => {
                if (await confirmed()) act(() => startCut(id, tour, players, matches))
              }}
            >
              {t('run.startCut', { n: tour.cut })}
            </button>
          )}
          {cutDone && current.length > 1 && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                if (await confirmed()) act(() => nextCutRound(id, tour, matches))
              }}
            >
              {t('run.nextCut')}
            </button>
          )}
          {((lastSwiss && !tour.cut) || (cutDone && current.length === 1)) && (
            <button
              className="btn primary"
              disabled={busy || missing > 0}
              onClick={async () => {
                if ((await confirmed()) && (await dialog.confirm(t('run.finishConfirm'), { ok: t('run.finish') }))) act(() => finishTournament(id, rows.map((r) => r.id)))
              }}
            >
              {t('run.finish')}
            </button>
          )}
          {lastSwiss && tour.cut > 0 && active.length < tour.cut && <p className="muted small no-margin">{t('run.cutTooBig')}</p>}
          {tour.status === 'swiss' && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                const done = current.filter((m) => m.p2 && m.score).length
                const msg = done ? t('run.redoConfirmLost', { n: done }) : t('run.redoConfirm')
                if (await dialog.confirm(msg, { ok: t('run.redo'), danger: done > 0 })) act(() => pairSwiss(id, tour, players, matches, true))
              }}
            >
              <Icon name="refresh" size={16} /> {t('run.redo')}
            </button>
          )}
        </div>

        {tour.status === 'done' && (
          <section className="card">
            <div className="card-title">{t('run.sheet')}</div>
            {canPublish && !tour.filed && (
              <>
                <button className="btn primary" disabled={busy || noCommander > 0} onClick={publish}>
                  {t('run.publish')}
                </button>
                <p className="muted small no-margin">{t(noCommander ? 'run.publishNoCommander' : 'run.publishHint')}</p>
              </>
            )}
            <p className="muted small no-margin">{t('run.sheetHint')}</p>
            <div className="btn-pair">
              <button className="btn ghost" onClick={() => copy(sheetRows(tour, players, matches).names)}>
                <Icon name="copy" size={16} /> {t('run.copyNames')}
              </button>
              <button className="btn ghost" onClick={() => copy(sheetRows(tour, players, matches, lists).results)}>
                <Icon name="copy" size={16} /> {t('run.copyResults')}
              </button>
            </div>
            {tour.published ? (
              <>
                <p className="muted small no-margin">{t('run.publishedIn', { n: tour.published.tab })}</p>
                {canPublish && (
                  <button className="btn ghost" disabled={busy} onClick={unpublish}>
                    {t('run.unpublish')}
                  </button>
                )}
              </>
            ) : (
              <>
                <button className={`btn ${tour.filed ? 'ghost' : 'primary'}`} disabled={busy} onClick={() => act(() => setFiled(id, !tour.filed))}>
                  {tour.filed ? t('run.unfile') : t('run.file')}
                </button>
                <p className="muted small no-margin">{t(tour.filed ? 'run.filed' : 'run.fileHint')}</p>
              </>
            )}
          </section>
        )}

        <div className="to-side">
          {tour.status !== 'open' && (
            <section className="card">
              <div className="card-title">{tour.status === 'done' ? t('run.final') : t('run.standings')}</div>
              <RankingList rows={rows} onPick={setPlayer} />
              {tour.status === 'done' && (
                <button className="btn ghost" disabled={busy} onClick={picture}>
                  <Icon name="download" size={16} /> {t('run.picture')}
                </button>
              )}
            </section>
          )}

          {pending.length > 0 && (
            <section className="card">
              <div className="card-title">
                {t('run.requests')}
                <span className="muted small">{pending.length}</span>
              </div>
              <ul className="card-list">
                {pending.map(([k, p]) => {
                  const c = claims.get(k)
                  return (
                    <li key={k} className="event-row">
                      {c?.photo ? (
                        <img className="admin-avatar" src={c.photo} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="admin-avatar">{(c?.name || '?').charAt(0).toUpperCase()}</span>
                      )}
                      <div className="event-main">
                        <span className="ellipsis">{p.name}</span>
                        <span className="ellipsis muted small">
                          {c?.name ?? t('admin.noName')} · {t('run.commanderIn')}
                          {p.invalid && <span className="bad-text"> · {t('run.badDeck')}</span>}
                        </span>
                      </div>
                      <button
                        className="btn ghost small"
                        disabled={busy}
                        onClick={async () => {
                          if (await dialog.confirm(t('run.rejectConfirm', { p: p.name }), { ok: t('run.reject'), danger: true })) act(() => removePlayer(id, k))
                        }}
                      >
                        {t('run.reject')}
                      </button>
                      <button
                        className="btn primary small"
                        disabled={busy}
                        // the claim, if still the one that asked and not verified yet, is verified with the same tap
                        onClick={() => act(() => confirmPlayer(user, id, k, !!c && c.uid === p.uid && !c.verified))}
                      >
                        {t('run.accept')}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="muted small no-margin">{t('run.requestsHint')}</p>
            </section>
          )}

          <section className="card">
            <div className="card-title">
              {t('run.registered')}
              {/* the legend of the icons on each row */}
              <span className="muted small icon-legend">
                {t('run.players', { n: entered.length })} · <Icon name="list" size={14} />
                {t('run.lists', { n: listed, of: entered.length })} · <Icon name="decks" size={14} />
                {t('run.castra', { n: linked, of: entered.length })}
              </span>
            </div>
            {noCommander > 0 && <p className="bad-text small no-margin">{t('run.missingCommanders', { n: noCommander })}</p>}
            <ul className="card-list">
              {[...entered]
                .sort((a, b) => a[1].name.localeCompare(b[1].name))
                .map(([k, p]) => (
                  <li key={k} className="event-row" onClick={() => setPlayer(k)}>
                    <div className="event-main">
                      <span className="ellipsis">
                        {p.name}
                        {p.drop != null && <span className="muted small"> · {t('run.dropped')}</span>}
                        {p.joined && <span className="muted small"> · {t('run.lateFrom', { n: p.joined })}</span>}
                      </span>
                      <span className={`ellipsis small ${hasCommander(p) ? 'muted' : 'bad-text'}`}>
                        {/* secret until round 1, even to the TOs */}
                        {!hasCommander(p) ? t('run.noCommander') : tour.status === 'open' ? t('run.commanderIn') : p.commander}
                        {p.invalid && <span className="bad-text"> · {t('run.badDeck')}</span>}
                        {penalties.has(k) && <span className="bad-text"> · {t('run.penalties', { n: penalties.get(k)! })}</span>}
                      </span>
                    </div>
                    {/* the decklist (missing in red): a Moxfield link, or the photo of a deck of the app */}
                    <span className={`row-icon ${p.list ? 'good-text' : 'bad-text'}`} title={t(p.deck ? 'run.castraLinked' : p.list ? 'join.listIn' : 'join.noList')}>
                      <Icon name={p.deck ? 'decks' : 'list'} size={16} />
                    </span>
                    <Icon name="chevron" size={16} />
                  </li>
                ))}
            </ul>
            {tour.status !== 'done' && tour.status !== 'cut' && (
              <button className="btn ghost" onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} /> {tour.status === 'open' ? t('run.addPlayer') : t('run.addLate', { n: tour.round + 1 })}
              </button>
            )}
          </section>
        </div>

        {rounds.length > 0 && (
          <section className="card to-tables">
            <div className="card-title">{t('run.pastRounds')}</div>
            {rounds.map((r) => (
              <details key={r}>
                <summary>{r > tour.rounds && tour.status !== 'swiss' ? t('run.cutRoundN', { n: r - tour.rounds }) : t('run.roundN', { n: r })}</summary>
                <MatchList matches={matches.filter((m) => m.round === r)} nameOf={nameOf} onPick={setResult} />
              </details>
            ))}
          </section>
        )}

        <LogCard log={log} nameOf={nameOf} whoOf={whoOf} secret={tour.status === 'open'} />

        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            // published: cancelling here leaves the sheet as it is
            const ask = tour.published ? t('run.cancelPublished', { n: tour.published.tab }) : t('run.cancelConfirm', { n: tournamentTitle(tour, t) })
            if (!(await dialog.confirm(ask, { ok: t('run.cancel'), danger: true }))) return
            act(async () => {
              await deleteTournament(id, players, matches)
              onBack()
            })
          }}
        >
          <Icon name="trash" size={16} /> {t('run.cancel')}
        </button>
      </div>

      <ResultSheet
        id={id}
        match={result && (matches.find((m) => m.table === result.table && m.round === result.round) ?? result)}
        cut={!!result && result.round > tour.rounds && tour.status !== 'swiss'}
        nameOf={nameOf}
        onClose={() => setResult(null)}
        log={{ entries: log, whoOf, tour }}
      />
      <PlayerSheet
        id={id}
        user={user}
        tour={tour}
        keyOf={player}
        player={player ? (names.get(player) ?? null) : null}
        onClose={() => setPlayer(null)}
        log={log}
        match={current.find((m) => m.p1 === player || m.p2 === player)}
        nameOf={nameOf}
        whoOf={whoOf}
        admin={admin}
      />
      <JoinSheet
        open={joining}
        onClose={() => setJoining(false)}
        id={id}
        user={user}
        me={organizer.player}
        name={organizer.name}
        verified // a TO is a verified player
        decks={decks}
        mine={names.get(organizer.player)}
        onJoined={() => {}}
      />
      <AddPlayerSheet
        open={adding}
        id={id}
        user={user}
        tour={tour}
        registered={players}
        circuit={circuit}
        dataset={dataset}
        onClose={() => setAdding(false)}
      />
    </SubPageShell>
  )
}

/**
 * A table's result: a quick pick, or games won by each and drawn. The TO also adds minutes to its clock; a player
 * (`me`) sees it from their side, and their result waits for the opponent's confirmation.
 */
export function ResultSheet({
  id,
  match,
  cut,
  nameOf,
  onClose,
  me,
  initial,
  onSaved,
  log,
}: {
  id: string
  match: TableMatch | null
  cut: boolean
  nameOf: (k: string | null) => string
  onClose: () => void
  me?: string
  initial?: Score // the games counted on the life counter
  onSaved?: () => void
  log?: { entries: LogEntry[]; whoOf: (uid: string) => string; tour: Tournament } // the TO: the table's changes
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const lines = (log?.entries ?? []).filter((e) => e.round === match?.round && e.table === match?.table)
  const [check, setCheck] = useState(false)
  useEffect(() => setCheck(false), [match?.round, match?.table])
  const [s, setS] = useState<Score>([0, 0, 0])
  const [busy, setBusy] = useState(false)
  const flip = !!me && match?.p2 === me
  useEffect(() => {
    if (match) setS(initial ?? match.score ?? (flip ? [0, 2, 0] : [2, 0, 0]))
    // once per opening: the live match changes with every result entered at the other tables
  }, [match && `${match.round}-${match.table}`]) // eslint-disable-line react-hooks/exhaustive-deps
  const ok = validScore(s) && (!cut || winnerOf(s) !== 0)
  const run = async (fn: () => Promise<void>, close = true) => {
    setBusy(true)
    try {
      await fn()
      if (close) onClose()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }
  const step = (i: 0 | 1 | 2, d: number) => setS((x) => x.map((v, j) => (j === i ? Math.max(0, v + d) : v)) as Score)
  return (
    <Sheet open={!!match} onClose={onClose} title={match ? t('run.table', { n: match.table }) : ''}>
      {match && (
        <div className="form">
          <div className="chips wrap">
            {(flip ? [...QUICK].reverse() : QUICK).map((q) => (
              <button key={q.join()} className={`chip ${same(q, s) ? 'on' : ''}`} onClick={() => setS(q)}>
                {flip ? `${q[1]}-${q[0]}` : `${q[0]}-${q[1]}`}
              </button>
            ))}
          </div>
          {((flip ? [1, 0, 2] : [0, 1, 2]) as (0 | 1 | 2)[]).map((i) => (
            <div key={i} className="stepper to-step">
              <span className="ellipsis">{i === 2 ? t('run.drawnGames') : nameOf(i ? match.p2 : match.p1)}</span>
              <div className="stepper-ctrl">
                <button onClick={() => step(i, -1)}>−</button>
                <b>{s[i]}</b>
                <button onClick={() => step(i, 1)}>+</button>
              </div>
            </div>
          ))}
          {!ok && <p className="bad-text small no-margin">{t(validScore(s) ? 'run.cutNeedsWinner' : 'run.notBo3')}</p>}
          {!me && unconfirmed(match) && <p className="muted small no-margin">{t('run.reportedBy', { p: nameOf(match.reportedBy!) })}</p>}
          {me && <p className="muted small no-margin">{t('join.reportHint', { p: nameOf(match.p1 === me ? match.p2 : match.p1) })}</p>}
          <button
            className="btn primary"
            disabled={busy || !ok}
            onClick={() =>
              run(async () => {
                await (me ? reportScore(id, match, s, me) : setScore(id, match, s))
                onSaved?.()
              })
            }
          >
            {t('run.saveResult')}
          </button>
          {!me && (
            <>
              {/* the sheet stays open: as many minutes as needed, the TO closes it */}
              <div className="stepper to-step">
                <span className="ellipsis">{t('run.extraMinutes')}</span>
                <div className="stepper-ctrl">
                  <button disabled={busy || !match.extra} onClick={() => run(() => setExtra(id, match, Math.max(0, (match.extra ?? 0) - 5)), false)}>
                    −
                  </button>
                  <b>{match.extra ?? 0}</b>
                  <button disabled={busy || (match.extra ?? 0) >= 60} onClick={() => run(() => setExtra(id, match, (match.extra ?? 0) + 5), false)}>
                    +
                  </button>
                </div>
              </div>
              <button className="btn ghost" disabled={busy || !match.score} onClick={() => run(() => setScore(id, match, null))}>
                {t('run.clearResult')}
              </button>
            </>
          )}
          {log && !check && match.p2 && (
            <button className="btn ghost" onClick={() => setCheck(true)}>
              {t('pen.deckCheck')}
            </button>
          )}
          {log && check && <PenaltyForm id={id} tour={log.tour} match={match} log={log.entries} onDone={onClose} />}
          {log && lines.length > 0 && <LogLines log={lines} nameOf={nameOf} whoOf={log.whoOf} />}
        </div>
      )}
    </Sheet>
  )
}

/** The tournament's log: who changed what, newest first. */
function LogCard({ log, nameOf, whoOf, secret }: { log: LogEntry[]; nameOf: (k: string | null) => string; whoOf: (uid: string) => string; secret: boolean }) {
  const { t } = useI18n()
  return (
    <section className="card">
      <details>
        <summary>{t('log.title')}</summary>
        <p className="muted small">{t('log.hint')}</p>
        {log.length ? <LogLines log={log} nameOf={nameOf} whoOf={whoOf} secret={secret} /> : <p className="muted small no-margin">{t('log.empty')}</p>}
      </details>
    </section>
  )
}

function LogLines({ log, nameOf, whoOf, secret }: { log: LogEntry[]; nameOf: (k: string | null) => string; whoOf: (uid: string) => string; secret?: boolean }) {
  const { t, lang } = useI18n()
  return (
    <ul className="card-list log">
      {log.map((e, i) => (
        <li key={i}>
          <span className="muted">{e.at ? new Date(e.at.toMillis()).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) : '…'}</span>{' '}
          <b>{whoOf(e.by)}</b>{' '}
          {/* the commanders are secret until round 1 */}
          {t(secret && (e.kind === 'join' || e.kind === 'commander') ? `log.${e.kind}Hidden` : e.kind === 'add' && e.round ? 'log.addLate' : e.kind === 'commander' && e.from ? 'log.commanderFrom' : `log.${e.kind}`, {
            p: nameOf(e.player ?? null),
            r: e.round ?? '',
            n: e.table ?? '',
            from: e.from ?? '',
            to: e.to ?? '',
          })}
          {e.infraction && ` · ${t(`inf.${e.infraction}`)}`}
          {e.text && <span className="muted"> · {e.text}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Commander suggestions from Scryfall while typing. */
function useCommanders(q: string) {
  const [cards, setCards] = useState<string[]>([])
  useEffect(() => {
    const ctl = new AbortController()
    const timer = setTimeout(() => cardSuggestions(q, ctl.signal).then(setCards, () => {}), 250)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [q])
  return cards
}

export function CommanderInput({ value, onChange, hint, locked }: { value: string; onChange: (v: string) => void; hint?: string; locked?: boolean }) {
  const { t } = useI18n()
  const cards = useCommanders(value)
  return (
    <label>
      <span>{t('run.commander')}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} list="to-commanders" autoComplete="off" disabled={locked} />
      <datalist id="to-commanders">
        {cards.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <span className="field-hint">{t(locked ? 'join.cmdFromDeck' : 'run.commanderHint')}</span>
    </label>
  )
}

/** A registered player: their commander, the drop, and before the start taking them off. */
function PlayerSheet({
  id,
  user,
  tour,
  keyOf,
  player,
  onClose,
  log,
  match,
  nameOf,
  whoOf,
  admin,
}: {
  id: string
  user: AppUser
  tour: Tournament
  admin: boolean // a list of Castra lost: put back once it's over
  keyOf: string | null
  player: Player | null
  onClose: () => void
  log: LogEntry[]
  match?: TableMatch // in the round being played
  nameOf: (k: string | null) => string
  whoOf: (uid: string) => string
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const [cmd, setCmd] = useState('')
  const [list, setList] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pen, setPen] = useState(false)
  const [paste, setPaste] = useState<string | null>(null) // the admin's decklist for the photo, while open
  const notes = log.filter((e) => e.player === keyOf && (isPenalty(e) || e.kind === 'note'))
  useEffect(() => {
    setCmd(tour.status === 'open' ? '' : (player?.commander ?? '')) // secret until round 1
  }, [player?.commander, keyOf, tour.status])
  useEffect(() => {
    setPen(false)
    setPaste(null)
  }, [keyOf])
  useEffect(() => {
    setList(null)
    if (keyOf && player?.list) loadList(id, keyOf).then(setList, () => {})
  }, [keyOf, player?.list]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      onClose()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }
  const k = keyOf!
  return (
    <Sheet open={!!player} onClose={onClose} title={player?.name}>
      {player && (
        <div className="form">
          {player.deck && (
            <p className="small no-margin">
              <span className="good-text">✓</span> {t('run.castraLinked')}
            </p>
          )}
          {list && (
            <a className="link" {...listLinkProps(list)}>
              {t('run.openList')}
            </a>
          )}
          {admin && tour.status === 'done' && player.deck && (
            <>
              {paste == null ? (
                <button className="btn ghost" onClick={() => setPaste('')}>
                  {t('run.photoReplace')}
                </button>
              ) : (
                <label>
                  <span>{t('run.photoReplace')}</span>
                  <textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t('decks.pasteHint')} />
                  <span className="field-hint">{t('run.photoReplaceHint')}</span>
                </label>
              )}
              {paste != null && (
                <button
                  className="btn primary"
                  disabled={busy || !parseDecklist(paste).length}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await replacePhoto(id, k, paste, player.commander ?? player.name)
                      setPaste(null)
                      setList(photoLink(id, k))
                      // the sheet keeps the old link until it gets this one
                      await navigator.clipboard.writeText(photoLink(id, k)).catch(() => {})
                      await dialog.alert(t('run.photoReplaced'))
                    } catch {
                      await dialog.alert(t('admin.error'))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {t('run.photoSave')}
                </button>
              )}
            </>
          )}
          {notes.length > 0 && <LogLines log={notes} nameOf={nameOf} whoOf={whoOf} />}
          {pen ? (
            <PenaltyForm id={id} tour={tour} player={[k, player]} match={match} log={log} onDone={onClose} />
          ) : (
            <button className="btn ghost" onClick={() => setPen(true)}>
              {t('pen.add')}
            </button>
          )}
          <CommanderInput value={cmd} onChange={setCmd} hint={tour.status === 'open' && hasCommander(player) ? t('run.commanderHidden') : undefined} />
          <button
            className="btn primary"
            disabled={busy || !cmd.trim() || cmd.trim() === player.commander}
            onClick={() => run(() => savePlayer(user, id, k, { name: player.name, commander: cmd.trim(), joined: player.joined }, tour.status === 'open', player))}
          >
            {t('run.saveCommander')}
          </button>
          {tour.status === 'swiss' &&
            (player.drop == null ? (
              <button
                className="btn ghost"
                disabled={busy}
                onClick={async () => {
                  if (await dialog.confirm(t('run.dropConfirm', { p: player.name, n: tour.round }), { ok: t('run.drop') })) run(() => setDrop(id, k, tour.round))
                }}
              >
                {t('run.drop')}
              </button>
            ) : (
              <button className="btn ghost" disabled={busy} onClick={() => run(() => setDrop(id, k, null))}>
                {t('run.undrop')}
              </button>
            ))}
          {tour.status === 'open' && (
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                if (await dialog.confirm(t('run.removeConfirm', { p: player.name }), { ok: t('run.remove'), danger: true })) run(() => removePlayer(id, k))
              }}
            >
              {t('run.remove')}
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}

const isPenalty = (e: LogEntry) => (PENALTIES as readonly string[]).includes(e.kind) && e.kind !== 'note'

/**
 * A penalty or a note on a player, or a deck check at a table (no player): a line of the log. A match loss (and a
 * disqualification) can also give the match being played to the opponent, 2-0; a disqualification drops the player.
 */
function PenaltyForm({
  id,
  tour,
  player,
  match,
  log,
  onDone,
}: {
  id: string
  tour: Tournament
  player?: [string, Player]
  match?: TableMatch
  log: LogEntry[]
  onDone: () => void
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const [k, p] = player ?? []
  const [kind, setKind] = useState<Penalty>(p ? 'warning' : 'deckCheck')
  const [inf, setInf] = useState<Infraction | ''>('')
  const [round, setRound] = useState(match?.round ?? tour.round)
  const [text, setText] = useState('')
  const [apply, setApply] = useState(true)
  const [busy, setBusy] = useState(false)
  const loses = (kind === 'matchLoss' || kind === 'dq') && !!match?.p2 && round === match.round
  // a second warning for the same infraction may become a game loss: the TO decides
  const before = kind === 'warning' && inf ? log.filter((e) => e.player === k && e.kind === 'warning' && e.infraction === inf).length : 0
  const save = async () => {
    setBusy(true)
    try {
      await addPenalty(id, {
        kind,
        round,
        player: k,
        table: k ? undefined : match?.table,
        infraction: inf || undefined,
        text: text.trim() || undefined,
        uid: kind === 'note' ? undefined : p?.uid,
      })
      if (loses && apply) await setScore(id, match!, match!.p1 === k ? [0, 2, 0] : [2, 0, 0])
      if (kind === 'dq' && tour.status === 'swiss' && p!.drop == null) await setDrop(id, k!, tour.round)
      onDone()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="form">
      {p ? (
        <div className="chips wrap">
          {PENALTIES.map((x) => (
            <button key={x} className={`chip ${kind === x ? 'on' : ''}`} onClick={() => setKind(x)}>
              {t(`pen.${x}`)}
            </button>
          ))}
        </div>
      ) : (
        <strong>{t('pen.deckCheckAt', { n: match?.table ?? '' })}</strong>
      )}
      {p && kind !== 'note' && (
        <label>
          <span>{t('pen.infraction')}</span>
          <select value={inf} onChange={(e) => setInf(e.target.value as Infraction | '')}>
            <option value="">{t('pen.noInfraction')}</option>
            {INFRACTIONS.map((x) => (
              <option key={x} value={x}>
                {t(`inf.${x}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {p && tour.round > 0 && (
        <label>
          <span>{t('pen.round')}</span>
          <select value={round} onChange={(e) => setRound(+e.target.value)}>
            {Array.from({ length: tour.round + 1 }, (_, i) => tour.round - i).map((r) => (
              <option key={r} value={r}>
                {r ? t('run.roundN', { n: r }) : t('pen.beforeStart')}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span>{t(p ? 'pen.text' : 'pen.outcome')}</span>
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
      </label>
      {before > 0 && <p className="bad-text small no-margin">{t('pen.again', { n: before })}</p>}
      {loses && <Toggle label={t('pen.apply', { r: match!.round })} on={apply} set={setApply} />}
      {kind === 'dq' && tour.status === 'swiss' && <p className="muted small no-margin">{t('pen.dqDrop', { r: tour.round })}</p>}
      <button className="btn primary" disabled={busy} onClick={save}>
        {t('pen.save')}
      </button>
    </div>
  )
}

/** Registering a player: someone the app knows (the circuit's ranking, the meta's tournaments) or a new name. */
function AddPlayerSheet({
  open,
  id,
  user,
  tour,
  registered,
  circuit,
  dataset,
  onClose,
}: {
  open: boolean
  id: string
  user: AppUser
  tour: Tournament
  registered: [string, Player][]
  circuit: Circuit | null
  dataset: MetaDataset | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [cmd, setCmd] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) {
      setQ('')
      setPicked(null)
      setCmd('')
    }
  }, [open])
  // everyone the app knows, by player key
  const known = useMemo(() => {
    const m = new Map<string, string>()
    circuit?.players.forEach((p) => m.set(p.key, p.name))
    dataset?.entries.forEach((e) => e.player && e.key && !m.has(e.key) && m.set(e.key, e.player))
    return m
  }, [circuit, dataset])
  const taken = new Set(registered.map(([k]) => k))
  const key = playerKey(q)
  const found = key.length < 2 ? [] : [...known].filter(([k]) => k.includes(key) && !taken.has(k)).slice(0, 8)
  const isNew = key.length >= 2 && !known.has(key) && !taken.has(key)
  const near = isNew ? closest(q, [...known.values()], 3) : []

  const save = async () => {
    const name = picked ? known.get(picked)! : q.trim()
    setBusy(true)
    try {
      // after the start, a late entry: from the next round, the ones before lost 0-2
      await savePlayer(user, id, picked ?? key, { name, commander: cmd.trim() || null, joined: tour.status === 'open' ? undefined : tour.round + 1 }, tour.status === 'open')
      onClose()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={tour.status === 'open' ? t('run.addPlayer') : t('run.addLate', { n: tour.round + 1 })}>
      <div className="form">
        {picked ? (
          <div className="stepper to-step">
            <strong>{known.get(picked)}</strong>
            <button className="btn ghost small" onClick={() => setPicked(null)}>
              {t('run.change')}
            </button>
          </div>
        ) : (
          <>
            <label>
              <span>{t('run.player')}</span>
              <input type="search" placeholder={t('run.searchPlayer')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </label>
            {taken.has(key) && <p className="muted small no-margin">{t('run.already')}</p>}
            {found.length > 0 && (
              <div className="chips wrap">
                {found.map(([k, n]) => (
                  <button key={k} className="chip" onClick={() => setPicked(k)}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {isNew && (
              <p className="muted small no-margin">
                {t('run.newPlayer', { p: q.trim() })}
                {near.length > 0 && ` ${t('run.similar', { p: near.join(', ') })}`}
              </p>
            )}
          </>
        )}
        <CommanderInput value={cmd} onChange={setCmd} />
        <button className="btn primary" disabled={busy || (!picked && !isNew)} onClick={save}>
          {t('run.register')}
        </button>
      </div>
    </Sheet>
  )
}

/** The registration code as a QR, full screen, to show in the room: the camera opens the app on the tournament. */
function QrScreen({ tour, code, players, onShare, onClose }: { tour: Tournament; code: string; players: number; onShare: () => void; onClose: () => void }) {
  const { t, lang } = useI18n()
  const path = useQr(joinLink(code))
  useBackCloses(true, onClose)
  useWakeLock(true)
  return (
    <div className="qr-screen" role="dialog" aria-modal>
      <div className="qr-head">
        <span className="qr-status">{tournamentStatus(tour, t)}</span>
        <button className="icon-btn" onClick={onClose} aria-label="close">
          <Icon name="close" />
        </button>
      </div>
      <h2>{tournamentTitle(tour, t)}</h2>
      <span className="muted">{new Date(tour.date).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <div className="qr-code">
        {path && (
          <svg viewBox={`-1 -1 ${path.n + 2} ${path.n + 2}`} shapeRendering="crispEdges" role="img" aria-label={t('run.qrAlt')}>
            <path d={path.d} />
          </svg>
        )}
      </div>
      <span className="muted small">{t('run.qrOr')}</span>
      <b className="qr-text">{code}</b>
      <span className="qr-count">
        <LiveDot live="live" /> {t('run.qrCount', { n: players })}
      </span>
      <button className="btn qr-share" onClick={onShare}>
        <Icon name="share" size={16} /> {t('run.qrShare')}
      </button>
    </div>
  )
}

/** Day, start, venue and address of a tournament not started yet, for the calendar; or kept out of it. */
function CalendarCard({ id, tour }: { id: string; tour: Tournament }) {
  const { t } = useI18n()
  const dialog = useDialog()
  const initial = { date: tour.date, time: tour.time ?? '', place: tour.place ?? '', address: tour.address ?? '', hidden: !!tour.hidden }
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const changed = JSON.stringify(f) !== JSON.stringify(initial)
  const save = async () => {
    setBusy(true)
    try {
      await setTournament(id, { date: f.date, time: f.time || null, place: f.place.trim() || null, address: f.address.trim() || null, hidden: f.hidden })
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card form">
      <div className="card-title">{t('cal.card')}</div>
      <p className="muted small no-margin">{t('cal.cardHint')}</p>
      <div className="cal-fields">
        <label>
          <span>{t('cal.day')}</span>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </label>
        <label>
          <span>{t('cal.time')}</span>
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </label>
      </div>
      <label>
        <span>{t('cal.place')}</span>
        <input maxLength={100} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
      </label>
      <label>
        <span>{t('cal.address')}</span>
        <input maxLength={200} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      </label>
      <Toggle label={t('cal.show')} hint={t('cal.showHint')} on={!f.hidden} set={(on) => setF({ ...f, hidden: !on })} />
      <button className="btn tonal" disabled={busy || !changed || !f.date} onClick={save}>
        {t('join.save')}
      </button>
    </section>
  )
}
