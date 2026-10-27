import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n'
import { useAuth } from './lib/auth'
import { syncPaused, useCollectionSync, useDocFieldSync } from './lib/sync'
import { DEFAULT_PREFS, PREFS_KEY, type Prefs, readPrefs } from './lib/prefs'
import { DEFAULT_THEME, type Theme, applyTheme } from './lib/theme'
import type { Deck } from './lib/decks'
import type { Match } from './lib/matches'
import { useMeta } from './lib/meta'
import { readStored, useStoredState, writeStored } from './lib/storage'
import { claimPlayer, unclaimPlayer, useClaims } from './lib/claims'
import { type CircuitNotice, type CircuitSnapshot, mergeNotices, noticeOf, snapshotOf, useCircuit } from './lib/circuit'
import { Icon } from './components/ui'
import Home from './views/Home'
import Meta, { META_MODE_KEY } from './views/Meta'
import { CircuitNoticeCard, EventPage, PlayerPage } from './views/Circuit'
import { ComparePage, LeaguePage } from './views/CircuitMore'
import Decks from './views/Decks'
import DeckDetail from './views/DeckDetail'
import Stats from './views/Stats'
import Account, { isAccountSection } from './views/Account'
import LifeCounter, { GAME_KEY, type GameState, defaultGame, isGameInProgress } from './views/LifeCounter'
import { useDialog } from './components/Dialog'

type Tab = 'home' | 'meta' | 'game' | 'decks' | 'stats' | 'account'
const TABS = ['home', 'meta', 'game', 'stats', 'decks'] as const
const ROUTES: Tab[] = [...TABS, 'account']

const fromHash = (): { tab: Tab; deck: string | null } => {
  const [tab, deck] = location.hash.slice(1).split('/')
  return { tab: ROUTES.includes(tab as Tab) ? (tab as Tab) : 'home', deck: deck || null }
}

type Route = { tab: Tab; deck: string | null }
const toHash = (r: Route) => (r.deck ? `${r.tab}/${r.deck}` : r.tab)
const isSub = (r: Route) => !!r.deck || r.tab === 'account'
const parentOf = (r: Route) => (r.deck ? r.tab : 'home')

export default function App() {
  const { t } = useI18n()
  const dialog = useDialog()
  const [route, setRoute] = useState(fromHash)
  const [decks, setDecks] = useStoredState<Deck[]>('cc.decks', [])
  const [matches, setMatches] = useStoredState<Match[]>('cc.matches', [])
  const [importOpen, setImportOpen] = useState(false)
  const [theme, setTheme] = useStoredState<Theme>('cc.theme', DEFAULT_THEME)
  const [prefs, setPrefs] = useStoredState<Prefs>(PREFS_KEY, readPrefs())
  const { data: meta, status, refresh } = useMeta()
  const circuit = useCircuit()
  const [circuitMe, setCircuitMe] = useStoredState<string | null>('cc.circuit.me', null)
  const [follow, setFollow] = useStoredState<string[]>('cc.circuit.follow', [])
  const [notice, setNotice] = useStoredState<CircuitNotice | null>('cc.circuit.notice', null)
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { claims, loaded: claimsLoaded } = useClaims()

  useCollectionSync(uid, 'decks', decks, setDecks, (l, r) => l.updatedAt > r.updatedAt)
  useCollectionSync(uid, 'matches', matches, setMatches)
  useDocFieldSync(uid, 'theme', theme, setTheme)
  useDocFieldSync(uid, 'prefs', prefs, (p) => setPrefs({ ...DEFAULT_PREFS, ...p }))
  useDocFieldSync(uid, 'circuitMe', circuitMe, setCircuitMe)
  useDocFieldSync(uid, 'circuitFollow', follow, setFollow)
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // keep the local "me" in line with the shared claims
  useEffect(() => {
    if (!claimsLoaded || !circuitMe || syncPaused()) return // paused: the account is being deleted
    const claim = claims.get(circuitMe)
    if (claim && claim.uid !== uid) setCircuitMe(null) // someone else's
    else if (!claim && user) claimPlayer(user, circuitMe, null).catch(() => {}) // linked before claims existed
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

  // the history is [main page, sub-pages…, open sheet]: land() rebuilds it from the main entry
  const land = (to: Route) => {
    if (isSub(to)) {
      history.replaceState(null, '', `#${parentOf(to)}`)
      history.pushState({ sub: true }, '', `#${toHash(to)}`)
    } else history.replaceState(null, '', `#${toHash(to)}`)
    setRoute(fromHash())
  }
  // where we're going once history.go() has rewound to the main entry
  const pending = useRef<Route | null>(null)
  useEffect(() => {
    // opened straight on a sub-page: put its parent underneath, so back still lands there
    if (!history.state?.sub) land(fromHash())
    const onPop = () => {
      if (pending.current) land(pending.current)
      else setRoute(fromHash())
      pending.current = null
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.tab, route.deck])

  // Main pages replace each other, so the phone's back button closes the app from any of them.
  // A sub-page (a deck, account, a circuit player or event) sits one entry above its main page, so back
  // returns there. `stack` piles a sub-page on the current one (a player's event, that event's players…),
  // so back retraces the steps.
  const go = (tab: Tab, deck?: string, stack = false) => {
    const to = { tab, deck: deck ?? null }
    const sub = Number(history.state?.sub ?? 0) // true from before sub-pages could stack
    if (stack && sub && !history.state?.sheet && !history.state?.dialog && isSub(to)) {
      history.pushState({ sub: sub + 1 }, '', `#${toHash(to)}`)
      return setRoute(fromHash())
    }
    const depth = sub + (history.state?.sheet ? 1 : 0) + (history.state?.dialog ? 1 : 0)
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
        openPlayer(k)
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
  const circuitPrefs = { me: circuitMe, follow, setFollow, claims, uid, link: linkPlayer, login: () => go('account') }
  const openPlayer = (key: string) => go('meta', `p~${encodeURIComponent(key)}`, true)
  const openEvent = (id: string) => go('meta', `e~${id}`, true)
  const openLeague = (season: string, name: string) => go('meta', `l~${season}~${encodeURIComponent(name)}`, true)
  const openCompare = (a: string, b: string) => go('meta', `c~${encodeURIComponent(a)}~${encodeURIComponent(b)}`, true)
  const findMe = () => {
    writeStored(META_MODE_KEY, 'circuit')
    writeStored('cc.circuit.view', 'ranking')
    go('meta')
  }
  // meta/p~<player key>, meta/e~<event id>, meta/l~<season>~<league>, meta/c~<player a>~<player b>
  const [metaSub, ...metaArgs] = route.tab === 'meta' && route.deck ? route.deck.split('~').map(decodeURIComponent) : []
  const gameInProgress = isGameInProgress(readStored<GameState>(GAME_KEY, defaultGame()))

  return (
    <div className="app">
      <main>
        {route.tab === 'game' && (
          <LifeCounter
            decks={decks}
            metaNames={meta.decks.map((d) => d.name)}
            onSaveMatch={(m) => setMatches((ms) => [m, ...ms])}
          />
        )}
        {route.tab === 'home' && (
          <Home
            banner={noticeCard}
            meta={meta}
            decks={decks}
            matches={matches}
            gameInProgress={gameInProgress}
            go={(tab) => go(tab)}
            user={user}
            circuit={circuit.data}
            circuitStatus={circuit.status}
            circuitMe={circuitMe}
            openPlayer={openPlayer}
            findMe={findMe}
            openDeck={(id) => go('decks', id)}
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
            decks={decks}
            setDecks={setDecks}
            matches={matches}
            setMatches={setMatches}
            circuit={circuit.data}
            circuitPrefs={circuitPrefs}
            openPlayer={openPlayer}
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
          <Stats matches={matches} setMatches={setMatches} decks={decks} metaDecks={meta.decks} />
        )}
        {route.tab === 'meta' &&
          (metaSub && circuit.data ? (
            metaSub === 'p' ? (
              <PlayerPage
                circuit={circuit.data}
                playerKey={metaArgs[0]}
                prefs={circuitPrefs}
                onBack={() => history.back()}
                openEvent={openEvent}
                openCompare={openCompare}
              />
            ) : metaSub === 'e' ? (
              <EventPage circuit={circuit.data} eventId={metaArgs[0]} prefs={circuitPrefs} onBack={() => history.back()} openPlayer={openPlayer} />
            ) : metaSub === 'l' ? (
              <LeaguePage
                circuit={circuit.data}
                season={metaArgs[0]}
                name={metaArgs[1]}
                prefs={circuitPrefs}
                onBack={() => history.back()}
                openPlayer={openPlayer}
              />
            ) : (
              <ComparePage
                circuit={circuit.data}
                a={metaArgs[0]}
                b={metaArgs[1]}
                prefs={circuitPrefs}
                onBack={() => history.back()}
                openPlayer={openPlayer}
                openEvent={openEvent}
              />
            )
          ) : (
            <Meta
              banner={noticeCard}
              meta={meta}
              status={status}
              onRefresh={refresh}
              circuit={circuit.data}
              circuitStatus={circuit.status}
              onCircuitRefresh={circuit.refresh}
              prefs={circuitPrefs}
              openPlayer={openPlayer}
              openEvent={openEvent}
              openLeague={openLeague}
            />
          ))}
        {route.tab === 'decks' &&
          (openDeck ? (
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
            />
          ) : (
            <Decks
              decks={decks}
              setDecks={setDecks}
              metaDecks={meta.decks}
              onOpen={(id) => go('decks', id)}
              importOpen={importOpen}
              setImportOpen={setImportOpen}
            />
          ))}
      </main>

      <nav className="tabbar">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`${tab === 'game' ? 'center' : ''} ${route.tab === tab || (tab === 'home' && route.tab === 'account') ? 'on' : ''}`}
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
    </div>
  )
}
