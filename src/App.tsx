import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n'
import { useAuth } from './lib/auth'
import { syncPaused, useCollectionSync, useDocFieldSync } from './lib/sync'
import { DEFAULT_PREFS, PREFS_KEY, type Prefs, readPrefs } from './lib/prefs'
import { DEFAULT_TIMER_SETTINGS, type TimerSettings } from './lib/timer'
import { DEFAULT_THEME, type Theme, applyTheme } from './lib/theme'
import type { Deck } from './lib/decks'
import type { Match } from './lib/matches'
import { resetPickedYear, useMeta, usePickedYear } from './lib/meta'
import { loadCircuitSheets, useCircuitSheets } from './lib/circuits'
import { readStored, useStoredState, writeStored } from './lib/storage'
import { claimPlayer, unclaimPlayer, useClaims } from './lib/claims'
import { loadBanlist } from './lib/banlist'
import { BanlistNoticeCard } from './views/BanlistNotice'
import { type CircuitNotice, type CircuitSnapshot, mergeNotices, noticeOf, snapshotOf, useCircuit } from './lib/circuit'
import { Icon } from './components/ui'
import Home from './views/Home'
import Meta, { META_MODE_KEY } from './views/Meta'
import { CircuitNoticeCard, EventPage, PlayerPage, focusMeInRanking } from './views/Circuit'
import { CommanderPage, TournamentPage, tournamentOfEvent } from './views/MetaPages'
import { ComparePage, LeaguePage } from './views/CircuitMore'
import { CardPage, CardsSearchPage } from './views/Cards'
import Decks from './views/Decks'
import DeckDetail from './views/DeckDetail'
import Stats from './views/Stats'
import Account, { isAccountSection } from './views/Account'
import LifeCounter, { GAME_KEY, type GameState, defaultGame, isGameInProgress } from './views/LifeCounter'
import { useDialog } from './components/Dialog'
import { UpdateBanner } from './components/AppBanners'
import { SideNav } from './components/SideNav'
import { useWide } from './lib/wide'

type Tab = 'home' | 'meta' | 'game' | 'decks' | 'stats' | 'account' | 'cards'
const TABS = ['home', 'meta', 'game', 'stats', 'decks'] as const
const ROUTES: Tab[] = [...TABS, 'account', 'cards']

const fromHash = (): { tab: Tab; deck: string | null } => {
  const [tab, deck] = location.hash.slice(1).split('/')
  return { tab: ROUTES.includes(tab as Tab) ? (tab as Tab) : 'home', deck: deck || null }
}

type Route = { tab: Tab; deck: string | null }
const toHash = (r: Route) => (r.deck ? `${r.tab}/${r.deck}` : r.tab)
const isSub = (r: Route) => !!r.deck || r.tab === 'account'
const parentOf = (r: Route) => (r.deck ? r.tab : 'home')

export default function App() {
  const { t, lang, setLang } = useI18n()
  const dialog = useDialog()
  const [route, setRoute] = useState(fromHash)
  const [decks, setDecks] = useStoredState<Deck[]>('cc.decks', [])
  const [matches, setMatches] = useStoredState<Match[]>('cc.matches', [])
  const [importOpen, setImportOpen] = useState(false)
  const [theme, setTheme] = useStoredState<Theme>('cc.theme', DEFAULT_THEME)
  const [prefs, setPrefs] = useStoredState<Prefs>(PREFS_KEY, readPrefs())
  const [timerSettings, setTimerSettings] = useStoredState<TimerSettings>('cc.timerSettings', DEFAULT_TIMER_SETTINGS)
  const { dataset, data: meta, status, refresh } = useMeta()
  // the newest year's circuit (home, profile, ranking notices), and the one of the year picked in the Circuit tab
  const circuitSheets = useCircuitSheets()
  const pickedYear = usePickedYear()
  const shownSheet = pickedYear === null ? circuitSheets[0] : (circuitSheets.find((s) => s.year === pickedYear) ?? null)
  const circuit = useCircuit(circuitSheets[0])
  // an older year is read only while the Circuit tab is open
  const pastCircuit = useCircuit(route.tab === 'meta' && shownSheet && shownSheet.year !== circuitSheets[0].year ? shownSheet : null)
  const shown = shownSheet?.year === circuitSheets[0].year ? circuit : pastCircuit
  const [circuitMe, setCircuitMe] = useStoredState<string | null>('cc.circuit.me', null)
  const [follow, setFollow] = useStoredState<string[]>('cc.circuit.follow', [])
  const [notice, setNotice] = useStoredState<CircuitNotice | null>('cc.circuit.notice', null)
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { claims, loaded: claimsLoaded } = useClaims()
  const wide = useWide()

  useCollectionSync(uid, 'decks', decks, setDecks, (l, r) => l.updatedAt > r.updatedAt)
  useCollectionSync(uid, 'matches', matches, setMatches)
  useDocFieldSync(uid, 'theme', theme, setTheme)
  useDocFieldSync(uid, 'prefs', prefs, (p) => setPrefs({ ...DEFAULT_PREFS, ...p }))
  useDocFieldSync(uid, 'timerSettings', timerSettings, (s) => setTimerSettings({ ...DEFAULT_TIMER_SETTINGS, ...s }))
  useDocFieldSync(uid, 'lang', lang, setLang)
  useDocFieldSync(uid, 'circuitMe', circuitMe, setCircuitMe)
  useDocFieldSync(uid, 'circuitFollow', follow, setFollow)
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  useEffect(() => {
    loadBanlist()
    loadCircuitSheets()
  }, [])

  // keep the local "me" in line with the shared claims
  useEffect(() => {
    if (!claimsLoaded || !circuitMe || syncPaused()) return // paused: the account is being deleted
    const claim = claims.get(circuitMe)
    if (claim && claim.uid !== uid) setCircuitMe(null) // someone else's
    // linked before claims existed, or released by an admin: refused when the admin revoked it for this account
    else if (!claim && user)
      claimPlayer(user, circuitMe, null).catch((e) => {
        if ((e as { code?: string }).code === 'permission-denied') setCircuitMe(null)
      })
  }, [claims, claimsLoaded, circuitMe, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // compare the circuit with what the user saw last time: their position, the followed players, new events
  useEffect(() => {
    if (!circuit.data) return
    const next = snapshotOf(circuit.data, circuitMe, follow)
    const prev = readStored<CircuitSnapshot | null>('cc.circuit.seen', null)
    writeStored('cc.circuit.seen', next)
    const change = prev && noticeOf(prev, next, circuit.data)
    if (change && prefs.circuitAlerts) setNotice((n) => mergeNotices(n, change))
  }, [circuit.data, circuitMe, follow]) // eslint-disable-line react-hooks/exhaustive-deps

  // the history is [home, main page, sub-pages…, open sheet]: land() rebuilds it from the home entry
  const land = (to: Route) => {
    const main = isSub(to) ? parentOf(to) : to.tab
    history.replaceState(null, '', '#home')
    if (main !== 'home') history.pushState({ main: true }, '', `#${main}`)
    if (isSub(to)) history.pushState({ main: main !== 'home', sub: 1 }, '', `#${toHash(to)}`)
    setRoute(fromHash())
  }
  // where we're going once history.go() has rewound to the home entry
  const pending = useRef<Route | null>(null)
  useEffect(() => {
    // opened straight on a page (a link, the installed app): put home and the main page underneath
    if (!history.state?.main && !history.state?.sub) land(fromHash())
    const onPop = () => {
      if (pending.current) land(pending.current)
      else setRoute(fromHash())
      pending.current = null
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  // on a desktop the circuit and the decks show the list and the open page side by side: moving between pages
  // of the same list scrolls only the open page, so the list stays where it was
  const detail = useRef<HTMLDivElement>(null)
  const lastTab = useRef(route.tab)
  useEffect(() => {
    if (detail.current && lastTab.current === route.tab) detail.current.scrollTo(0, 0)
    else window.scrollTo(0, 0)
    lastTab.current = route.tab
  }, [route.tab, route.deck])

  // Home is the first entry, so the phone's back button closes the app only from there. Every other main page
  // sits one entry above home, and main pages replace each other there: back from any of them goes home.
  // A sub-page (a deck, account, a circuit player or event) sits one entry above its main page, so back
  // returns there. `stack` piles a sub-page on the current page (a player's event, that event's players,
  // a player opened from the stats…), so back retraces the steps.
  const go = (tab: Tab, deck?: string, stack = false) => {
    const to = { tab, deck: deck ?? null }
    const st = history.state
    const sub = Number(st?.sub ?? 0) // true from before sub-pages could stack
    if (stack && !st?.sheet && !st?.dialog && isSub(to)) {
      history.pushState({ main: !!st?.main, sub: sub + 1 }, '', `#${toHash(to)}`)
      return setRoute(fromHash())
    }
    const depth = (st?.main ? 1 : 0) + sub + (st?.sheet ? 1 : 0) + (st?.dialog ? 1 : 0)
    if (!depth) return land(to)
    pending.current = to
    history.go(-depth) // the popstate handler lands on `to`
  }

  const noticeCard = notice && (
    <CircuitNoticeCard
      notice={notice}
      claims={claims}
      openPlayer={(k) => {
        setNotice(null)
        openCurrentPlayer(k)
      }}
      onClose={() => setNotice(null)}
    />
  )

  const openDeck = route.deck ? decks.find((d) => d.id === route.deck) : undefined
  // "this is me": a shared claim, so a player can belong to one account only
  const linkPlayer = async (key: string | null) => {
    if (!user) {
      if (key) return go('account')
      return setCircuitMe(null) // a link made before signing in: nothing shared to release
    }
    const owned = circuitMe && claims.get(circuitMe)?.uid === user.uid ? circuitMe : null
    try {
      if (key) await claimPlayer(user, key, owned)
      else if (owned) await unclaimPlayer(user, owned)
      setCircuitMe(key)
    } catch {
      dialog.alert(t('circuit.claimError'))
    }
  }
  const circuitPrefs = { me: circuitMe, follow, setFollow, claims, uid, link: linkPlayer, login: () => go('account'), matches }
  const openPlayer = (key: string) => go('meta', `p~${encodeURIComponent(key)}`, true)
  const openEvent = (id: string) => go('meta', `e~${id}`, true)
  const openLeague = (season: string, name: string) => go('meta', `l~${season}~${encodeURIComponent(name)}`, true)
  const openCompare = (a: string, b: string) => go('meta', `c~${encodeURIComponent(a)}~${encodeURIComponent(b)}`, true)
  const openCommander = (name: string) => go('meta', `k~${encodeURIComponent(name)}`, true)
  const openTournament = (id: string) => go('meta', `t~${encodeURIComponent(id)}`, true)
  // from the home, the profile and the notices: the player in this year's circuit, whatever year the tab shows
  const openCurrentPlayer = (key: string) => {
    resetPickedYear()
    openPlayer(key)
  }
  // cards/<card name>: the name is encoded, as split cards have a slash ("Fire // Ice")
  const openCard = (name: string) => go('cards', encodeURIComponent(name))
  const cardName = route.tab === 'cards' && route.deck ? decodeURIComponent(route.deck) : undefined
  const findMe = () => {
    resetPickedYear()
    writeStored(META_MODE_KEY, 'circuit')
    writeStored('cc.circuit.view', 'ranking')
    go('meta')
  }
  // the overall ranking, centred on the linked player
  const openRanking = () => {
    writeStored('cc.circuit.sort', 'total')
    writeStored('cc.circuit.league', '')
    focusMeInRanking()
    findMe()
  }
  // meta/p~<player key>, meta/e~<event id>, meta/l~<season>~<league>, meta/c~<player a>~<player b>,
  // meta/k~<commander>, meta/t~<tournament id> (an event or a league stage of the deck meta)
  const [metaSub, ...metaArgs] = route.tab === 'meta' && route.deck ? route.deck.split('~').map(decodeURIComponent) : []
  // a circuit event with its sheet opens as a tournament of the meta: same players, plus decks and records
  const circuitEvent = metaSub === 'e' ? shown.data?.events.find((e) => e.id === metaArgs[0]) : undefined
  const eventTournament = circuitEvent && tournamentOfEvent(dataset, circuitEvent)
  const gameInProgress = isGameInProgress(readStored<GameState>(GAME_KEY, defaultGame()))
  const metaList = (
    <Meta
      current={metaSub === 'k' ? metaArgs[0] : undefined}
      banner={noticeCard}
      dataset={dataset}
      status={status}
      onRefresh={refresh}
      circuit={shown.data}
      circuitStatus={shown.status}
      onCircuitRefresh={shown.refresh}
      circuitYears={circuitSheets.map((c) => c.year)}
      circuitYear={pickedYear ?? circuitSheets[0].year}
      prefs={circuitPrefs}
      openPlayer={openPlayer}
      openEvent={openEvent}
      openLeague={openLeague}
      openCommander={openCommander}
    />
  )
  // a phone shows the open page in place of its list; a desktop shows them side by side
  const split = (list: React.ReactNode, page: React.ReactNode, pick: string) =>
    !wide ? (
      (page ?? list)
    ) : (
      <div className="split">
        <div className="split-list">{list}</div>
        <div className="split-page" ref={detail}>
          {page ?? (
            <div className="split-empty">
              <Icon name="list" size={36} />
              <p>{pick}</p>
            </div>
          )}
        </div>
      </div>
    )

  return (
    <div className="app">
      <UpdateBanner />
      {wide && <SideNav tab={route.tab} go={(tab) => go(tab)} user={user} gameInProgress={gameInProgress} />}
      <main>
        {route.tab === 'game' && (
          <LifeCounter
            decks={decks}
            metaNames={meta.decks.map((d) => d.name)}
            players={circuit.data?.players}
            settings={timerSettings}
            setSettings={setTimerSettings}
            onSaveMatch={(m) => setMatches((ms) => [m, ...ms])}
          />
        )}
        {route.tab === 'home' && (
          <Home
            banner={
              <>
                <BanlistNoticeCard decks={decks} openDeck={(id) => go('decks', id)} openCard={openCard} />
                {noticeCard}
              </>
            }
            dataset={dataset}
            metaDecks={meta.decks}
            decks={decks}
            matches={matches}
            gameInProgress={gameInProgress}
            go={(tab) => go(tab)}
            user={user}
            circuit={circuit.data}
            circuitStatus={circuit.status}
            circuitMe={circuitMe}
            openPlayer={openCurrentPlayer}
            findMe={findMe}
            openRanking={openRanking}
            openCommander={openCommander}
            openDeck={(id) => go('decks', id)}
            openCards={() => go('cards')}
            importDeck={() => {
              setImportOpen(true)
              go('decks')
            }}
          />
        )}
        {route.tab === 'account' && (
          <Account
            theme={theme}
            setTheme={setTheme}
            prefs={prefs}
            setPrefs={setPrefs}
            setTimerSettings={setTimerSettings}
            decks={decks}
            setDecks={setDecks}
            matches={matches}
            setMatches={setMatches}
            circuit={circuit.data}
            circuitPrefs={circuitPrefs}
            openPlayer={openCurrentPlayer}
            findMe={findMe}
            section={isAccountSection(route.deck) ? route.deck : null}
            openSection={(sec) => go('account', sec, true)}
            onBack={() => (route.deck ? history.back() : go('home'))}
            onSignOut={() => {
              // the data now lives in the account: don't leave it on a possibly shared device
              setDecks(() => [])
              setMatches(() => [])
              setTheme(() => DEFAULT_THEME)
              setPrefs(() => DEFAULT_PREFS)
              setCircuitMe(null)
              setFollow(() => [])
            }}
          />
        )}
        {route.tab === 'stats' && (
          <Stats
            matches={matches}
            setMatches={setMatches}
            decks={decks}
            metaDecks={meta.decks}
            players={circuit.data?.players}
            openPlayer={openCurrentPlayer}
            openCommander={openCommander}
          />
        )}
        {route.tab === 'meta' &&
          split(
            metaList,
            metaSub === 'k' ? (
              <CommanderPage
                dataset={dataset}
                name={metaArgs[0]}
                decks={decks}
                onBack={() => history.back()}
                openPlayer={openPlayer}
                openTournament={openTournament}
                openDeck={(id) => go('decks', id)}
              />
            ) : metaSub === 't' || (metaSub === 'e' && eventTournament) ? (
              <TournamentPage
                dataset={dataset}
                id={metaSub === 't' ? metaArgs[0] : eventTournament!.id}
                circuit={shown.data}
                prefs={circuitPrefs}
                onBack={() => history.back()}
                openPlayer={openPlayer}
                openCommander={openCommander}
                openLeague={openLeague}
              />
            ) : metaSub && shown.data ? (
              metaSub === 'p' ? (
                <PlayerPage
                  circuit={shown.data}
                  dataset={dataset}
                  playerKey={metaArgs[0]}
                  prefs={circuitPrefs}
                  onBack={() => history.back()}
                  openEvent={openEvent}
                  openCompare={openCompare}
                  openCommander={openCommander}
                  openTournament={openTournament}
                />
              ) : metaSub === 'e' ? (
                <EventPage circuit={shown.data} eventId={metaArgs[0]} prefs={circuitPrefs} onBack={() => history.back()} openPlayer={openPlayer} />
              ) : metaSub === 'l' ? (
                <LeaguePage
                  circuit={shown.data}
                  dataset={dataset}
                  season={metaArgs[0]}
                  name={metaArgs[1]}
                  prefs={circuitPrefs}
                  onBack={() => history.back()}
                  openPlayer={openPlayer}
                  openTournament={openTournament}
                  openCommander={openCommander}
                />
              ) : (
                <ComparePage
                  circuit={shown.data}
                  dataset={dataset}
                  a={metaArgs[0]}
                  b={metaArgs[1]}
                  prefs={circuitPrefs}
                  onBack={() => history.back()}
                  openPlayer={openPlayer}
                  openEvent={openEvent}
                  openTournament={openTournament}
                />
              )
            ) : null,
            t('meta.pick'),
          )}
        {route.tab === 'cards' &&
          split(
            <CardsSearchPage current={cardName} onOpen={openCard} onBack={() => go('home')} />,
            cardName && <CardPage name={cardName} metaDecks={meta.decks} onBack={() => go('cards')} openCommander={openCommander} />,
            t('cards.pick'),
          )}
        {route.tab === 'decks' &&
          split(
            <Decks
              decks={decks}
              setDecks={setDecks}
              metaDecks={meta.decks}
              current={openDeck?.id}
              onOpen={(id) => go('decks', id)}
              importOpen={importOpen}
              setImportOpen={setImportOpen}
            />,
            openDeck && (
              <DeckDetail
                deck={openDeck}
                metaDecks={meta.decks}
                matches={matches}
                onChange={(d) => setDecks((ds) => ds.map((x) => (x.id === d.id ? d : x)))}
                onDelete={() => {
                  setDecks((ds) => ds.filter((x) => x.id !== openDeck.id))
                  go('decks')
                }}
                onBack={() => go('decks')}
                openCommander={openCommander}
              />
            ),
            t('decks.pick'),
          )}
      </main>

      {!wide && (
        <nav className="tabbar">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`${tab === 'game' ? 'center' : ''} ${route.tab === tab || (tab === 'home' && (route.tab === 'account' || route.tab === 'cards')) ? 'on' : ''}`}
              onClick={() => go(tab)}
            >
              {tab === 'game' ? (
                <span className="fab">
                  <Icon name="game" size={28} />
                </span>
              ) : (
                <Icon name={tab === 'meta' ? 'trophy' : tab} size={22} />
              )}
              <span>{t(`nav.${tab}`)}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
