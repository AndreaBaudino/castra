import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { AppUser } from '../lib/auth'
import type { Claim } from '../lib/claims'
import { type Deck, checkDeck, isValid } from '../lib/decks'
import { useBanlist } from '../lib/banlist'
import { CheckBox } from './DeckDetail'
import type { Match as Played } from '../lib/matches'
import { useLiveDoc } from '../lib/firebase'
import { readStored, writeStored } from '../lib/storage'
import { freshTimer } from '../lib/timer'
import { placeLabel } from './Circuit'
import {
  type Penalty,
  type Player,
  type TableMatch,
  type Tournament,
  clockLabel,
  confirmScore,
  findByCode,
  isListLink,
  joinTournament,
  loadList,
  personalMatches,
  ranking,
  removePlayer,
  saveList,
  setDrop,
  sideScore,
  timeLeft,
  tournamentStatus,
  tournamentTitle,
  unconfirmed,
  useNow,
  useMyPenalties,
  useTournament,
  useTournaments,
} from '../lib/tournaments'
import { Icon, Sheet } from '../components/ui'
import { useDialog } from '../components/Dialog'
import { commanderNames } from './Decks'
import { CommanderInput, ResultSheet } from './Organizer'
import { GAME_KEY, type GameState, defaultGame, isGameInProgress } from './LifeCounter'

// The players' side of the tournaments run in the app (docs/tornei.md): on the home, the row to type a tournament's
// code, and the card of the tournament they're registering for or playing: registration (commander, deck, decklist),
// then their table, the clock, the result to enter or confirm, the drop.

interface Me {
  user: AppUser | null
  me: string | null // the circuit player the account holds
  claim: Claim | null
  name: string // the player's name in the circuit
  decks: Deck[]
  openLive: (id: string) => void
  login: () => void
  linkPlayer: () => void
  record: (ms: Played[]) => void // into the player's own matches, skipping the ones already there
  openGame: () => void // the life counter
}

/** The cards of the account's tournaments and of the one whose code was typed, then the row for a code. */
export function TournamentCards({ code, setCode, ...me }: Me & { code: string | null; setCode: (c: string | null) => void }) {
  const { t } = useI18n()
  const { tournaments } = useTournaments()
  const [found, setFound] = useState<string | null | undefined>()
  const [typed, setTyped] = useState('')
  useEffect(() => {
    setFound(undefined)
    if (code) findByCode(code).then(setFound, () => setFound(null))
  }, [code])
  // the ones being registered for, played or just over: each card shows only if the player is in it
  const ids = me.me ? tournaments.map(([id]) => id) : []
  const shown = [...new Set([...(found ? [found] : []), ...ids])]
  return (
    <>
      {shown.map((id) => (
        <TournamentCard key={id} id={id} typed={id === found} close={() => setCode(null)} {...me} />
      ))}
      {code && found === null && (
        <section className="card">
          <div className="card-title">
            {t('join.notFound', { c: code })}
            <button className="icon-btn" onClick={() => setCode(null)} aria-label="close">
              <Icon name="close" size={18} />
            </button>
          </div>
        </section>
      )}
      <form
        className="card home-row join-row"
        onSubmit={(e) => {
          e.preventDefault()
          setCode(typed.trim().toUpperCase())
          setTyped('')
        }}
      >
        <span className="title-live">{t('join.title')}</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6))}
          placeholder={t('join.code')}
          aria-label={t('join.code')}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button className="btn ghost small" disabled={typed.length !== 6}>
          {t('join.enter')}
        </button>
      </form>
    </>
  )
}

/** The clock of the round, with the minutes added to the player's table. */
function Clock({ tour, extra }: { tour: Tournament; extra?: number }) {
  const { t } = useI18n()
  const left = timeLeft(tour, useNow(), extra)
  return <b className={`to-score ${(left ?? 1) <= 0 ? 'bad-text' : ''}`}>{clockLabel(left, t)}</b>
}

function TournamentCard({ id, typed, close, user, me, claim, name, decks, openLive, login, linkPlayer, record, openGame }: Me & { id: string; typed: boolean; close: () => void }) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  // the whole tournament only when the player is in it (or typed its code): one document read for each of the others
  const entered = useLiveDoc<Player>(me && `tournaments/${id}/players/${me}`) != null
  const { t: tour, players, matches } = useTournament(typed || entered ? id : null)
  const penalties = useMyPenalties(entered ? id : null, user?.uid ?? null)
  const [joining, setJoining] = useState(false)
  const [result, setResult] = useState<TableMatch | null>(null)
  const [busy, setBusy] = useState(false)
  const mine = me ? players.find(([k]) => k === me)?.[1] : undefined
  // once in, the card stays as one of the player's: the code would turn invalid at round 1
  useEffect(() => {
    if (typed && entered) close()
  }, [typed, entered]) // eslint-disable-line react-hooks/exhaustive-deps
  // once over, the matches go into the player's stats (the same ids every time: never twice)
  const over = tour?.status === 'done' && !!mine
  useEffect(() => {
    if (over) record(personalMatches(id, tour!, players, matches, me!, decks, tournamentTitle(tour!, t)))
  }, [over, matches]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!tour || (!mine && !typed)) return null
  // over: on its day, how it went
  if (tour.status === 'done') {
    if (tour.date !== new Date().toLocaleDateString('sv')) return null
    const rows = ranking(tour, players, matches)
    const at = rows.findIndex((r) => r.id === me)
    const r = rows[at]
    return r ? (
      <section className="card my-tour">
        <div className="card-title">
          <span className="ellipsis">{tournamentTitle(tour, t)}</span>
          <span className="muted small">{tournamentStatus(tour, t)}</span>
        </div>
        <p className="no-margin">
          <b>{placeLabel(at + 1, lang)}</b> · {r.wins}-{r.losses}
          {r.draws ? `-${r.draws}` : ''} · {t('live.points', { n: r.points })}
        </p>
        <p className="muted small no-margin">{t('join.recorded')}</p>
        <button className="link" onClick={() => openLive(id)}>
          {t('join.final')}
        </button>
      </section>
    ) : null
  }

  const verified = !!claim?.verified
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
  const names = new Map(players)
  const nameOf = (k: string | null) => (k ? (names.get(k)?.name ?? k) : t('meta.bye'))
  const m = me ? matches.find((x) => x.round === tour.round && (x.p1 === me || x.p2 === me)) : undefined
  const opp = m && (m.p1 === me ? m.p2 : m.p1)
  const flip = m?.p2 === me
  const count = players.filter(([, p]) => !p.pending).length

  const title = (
    <div className="card-title">
      <span className="ellipsis">{tournamentTitle(tour, t)}</span>
      {tour.status === 'open' ? (
        typed && !mine ? (
          <button className="icon-btn" onClick={close} aria-label="close">
            <Icon name="close" size={18} />
          </button>
        ) : (
          <span className="muted small">{t('run.players', { n: count })}</span>
        )
      ) : (
        <Clock tour={tour} extra={m?.extra} />
      )}
    </div>
  )
  const live = (
    <button className="link" onClick={() => openLive(id)}>
      {t(tour.status === 'open' ? 'join.seeRegistered' : 'join.seeLive')}
    </button>
  )

  // registering
  if (tour.status === 'open')
    return (
      <section className="card my-tour">
        {title}
        {mine ? (
          <>
            <p className={`small no-margin ${mine.pending ? 'muted' : 'good-text'}`}>{t(mine.pending ? 'join.pending' : 'join.in')}</p>
            <p className="small no-margin">
              {mine.commander ?? t('run.noCommander')}
              <span className="muted"> · {t(mine.list ? 'join.listIn' : 'join.noList')}</span>
            </p>
            <div className="btn-pair">
              <button className="btn ghost" disabled={busy} onClick={() => setJoining(true)}>
                {t('join.edit')}
              </button>
              <button
                className="btn ghost"
                disabled={busy}
                onClick={async () => {
                  if (await dialog.confirm(t('join.leaveConfirm'), { ok: t('join.leave'), danger: true })) act(() => removePlayer(id, me!, true))
                }}
              >
                {t('join.leave')}
              </button>
            </div>
          </>
        ) : !user ? (
          <button className="btn primary" onClick={login}>
            {t('join.login')}
          </button>
        ) : !me ? (
          <>
            <p className="muted small no-margin">{t('join.linkFirst')}</p>
            <button className="btn primary" onClick={linkPlayer}>
              {t('join.link')}
            </button>
          </>
        ) : (
          <>
            {!verified && <p className="muted small no-margin">{t('join.notVerified')}</p>}
            <button className="btn primary" onClick={() => setJoining(true)}>
              {t(verified ? 'join.register' : 'join.request')}
            </button>
          </>
        )}
        {live}
        {user && me && (
          <JoinSheet
            open={joining}
            onClose={() => setJoining(false)}
            id={id}
            user={user}
            me={me}
            name={name}
            verified={verified}
            decks={decks}
            mine={mine}
          />
        )}
      </section>
    )

  // playing
  const current = m
  // the life counter on this match, with the round's clock: its result goes to the tournament (docs/tornei.md)
  const play = async () => {
    const g = readStored<GameState>(GAME_KEY, defaultGame())
    if (g.tour?.id !== id || g.tour.round !== tour.round) {
      if (isGameInProgress(g) && !(await dialog.confirm(t('join.playReplace'), { ok: t('join.play') }))) return
      // opened once the time is up: no alarm (unless the TO adds minutes)
      const up = (timeLeft(tour, Date.now(), current?.extra) ?? 1) <= 0
      const timer = { ...freshTimer(), addedMs: (current?.extra ?? 0) * 60_000, alerted: up ? 'turns' : 'none' } as const
      writeStored<GameState>(GAME_KEY, { ...defaultGame(), timer, tour: { id, round: tour.round, me: me!, verified, games: [0, 0, 0] } })
    }
    openGame()
  }
  return (
    <section className="card my-tour playing">
      {title}
      <span className="muted small">{tournamentStatus(tour, t)}</span>
      {mine?.drop != null ? (
        <p className="muted small no-margin">{t('join.dropped', { n: mine.drop })}</p>
      ) : !current ? (
        <p className="muted small no-margin">{t(tour.status === 'cut' ? 'join.outOfCut' : 'join.notThisRound')}</p>
      ) : !opp ? (
        <p className="small no-margin">{t('join.bye')}</p>
      ) : (
        <>
          <p className="no-margin">
            <b>{t('run.table', { n: current.table })}</b> · {t('join.against', { p: nameOf(opp) })}
            <span className="muted small"> · {names.get(opp)?.commander ?? ''}</span>
          </p>
          {!current.score ? (
            verified ? (
              <div className="btn-pair">
                <button className="btn ghost" onClick={play}>
                  {t('join.play')}
                </button>
                <button className="btn primary" disabled={busy} onClick={() => setResult(current)}>
                  {t('join.report')}
                </button>
              </div>
            ) : (
              <>
                <p className="muted small no-margin">{t('join.toReports')}</p>
                <button className="btn ghost" onClick={play}>
                  {t('join.play')}
                </button>
              </>
            )
          ) : unconfirmed(current) && current.reportedBy === me ? (
            <>
              <p className="small no-margin">{t('join.waiting', { s: sideScore(current.score, flip), p: nameOf(opp) })}</p>
              <button className="btn ghost" disabled={busy} onClick={() => setResult(current)}>
                {t('join.fix')}
              </button>
            </>
          ) : unconfirmed(current) ? (
            <>
              <p className="small no-margin">{t('join.toConfirm', { p: nameOf(opp), s: sideScore(current.score, flip) })}</p>
              {verified && (
                <div className="btn-pair">
                  <button className="btn ghost" disabled={busy} onClick={() => setResult(current)}>
                    {t('join.wrong')}
                  </button>
                  <button className="btn primary" disabled={busy} onClick={() => act(() => confirmScore(id, current, me!))}>
                    {t('join.confirm')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="small no-margin good-text">{t('join.result', { s: sideScore(current.score, flip) })}</p>
          )}
        </>
      )}
      {penalties.length > 0 && (
        <div>
          <p className="bad-text small no-margin">{t('join.penalties')}</p>
          {penalties.map((e, i) => (
            <p key={i} className="muted small no-margin">
              {t(`pen.${e.kind as Penalty}`)} · {e.round ? t('run.roundN', { n: e.round }) : t('pen.beforeStart')}
              {e.infraction && ` · ${t(`inf.${e.infraction}`)}`}
              {e.text && ` · ${e.text}`}
            </p>
          ))}
        </div>
      )}
      {live}
      {verified && tour.status === 'swiss' && mine?.drop == null && (
        <button
          className="btn ghost"
          disabled={busy}
          onClick={async () => {
            if (await dialog.confirm(t('join.dropConfirm', { n: tour.round }), { ok: t('run.drop'), danger: true })) act(() => setDrop(id, me!, tour.round))
          }}
        >
          {t('run.drop')}
        </button>
      )}
      <ResultSheet id={id} match={result} cut={tour.status === 'cut'} nameOf={nameOf} me={me ?? undefined} onClose={() => setResult(null)} />
    </section>
  )
}

/** Registering, or changing the registration: a deck of the app (its commander), the commander, the decklist. */
function JoinSheet({
  open,
  onClose,
  id,
  user,
  me,
  name,
  verified,
  decks,
  mine,
}: {
  open: boolean
  onClose: () => void
  id: string
  user: AppUser
  me: string
  name: string
  verified: boolean
  decks: Deck[]
  mine?: Player
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const [deck, setDeck] = useState('')
  const [cmd, setCmd] = useState('')
  const [link, setLink] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setDeck(mine?.deck ?? '')
    setCmd(mine?.commander ?? '')
    setLink('')
    setSaved('')
    if (mine?.list)
      loadList(id, me).then(
        (l) => {
          setLink(l ?? '')
          setSaved(l ?? '')
        },
        () => {},
      )
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  // Moxfield links often carry a query or a fragment
  const clean = link.trim().replace(/[?#].*$/, '')
  const badLink = !!clean && !isListLink(clean)
  useBanlist() // a newer banlist changes the check
  const chosen = decks.find((d) => d.id === deck)
  const check = chosen && checkDeck(chosen)
  const pick = (deckId: string) => {
    setDeck(deckId)
    const d = decks.find((x) => x.id === deckId)
    // partners in alphabetical order, as in the sheets
    if (d && commanderNames(d).length) setCmd(commanderNames(d).sort().join(' / '))
  }
  const save = async () => {
    setBusy(true)
    try {
      await joinTournament(user, id, me, { name, commander: cmd.trim(), deck: deck || null, invalid: !!check && !isValid(check), verified }, !!mine)
      if (clean !== saved) await saveList(id, me, clean || null)
      onClose()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={name}>
      <div className="form">
        <label>
          <span>{t('join.deck')}</span>
          <select value={deck} onChange={(e) => pick(e.target.value)}>
            <option value="">{t('join.noDeck')}</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="field-hint">{t('join.deckHint')}</span>
        </label>
        {check && (
          <>
            <CheckBox check={check} />
            {!isValid(check) && <p className="muted small no-margin">{t('join.badDeckHint')}</p>}
          </>
        )}
        <CommanderInput value={cmd} onChange={setCmd} />
        <label>
          <span>{t('join.list')}</span>
          <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://moxfield.com/decks/…" />
          <span className={`field-hint ${badLink ? 'bad-text' : ''}`}>{t(badLink ? 'join.badList' : 'join.listHint')}</span>
        </label>
        <button className="btn primary" disabled={busy || !cmd.trim() || badLink} onClick={save}>
          {t(mine ? 'join.save' : verified ? 'join.register' : 'join.request')}
        </button>
      </div>
    </Sheet>
  )
}
