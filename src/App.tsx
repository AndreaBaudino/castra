import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n'
import { useAuth } from './lib/auth'
import { useCollectionSync, useDocFieldSync } from './lib/sync'
import { DEFAULT_THEME, type Theme, applyTheme } from './lib/theme'
import type { Deck } from './lib/decks'
import type { Match } from './lib/matches'
import { useMeta } from './lib/meta'
import { readStored, useStoredState, writeStored } from './lib/storage'
import { useCircuit } from './lib/circuit'
import { Icon } from './components/ui'
import Home from './views/Home'
import Meta, { META_MODE_KEY } from './views/Meta'
import { EventPage, PlayerPage } from './views/Circuit'
import Decks from './views/Decks'
import DeckDetail from './views/DeckDetail'
import Stats from './views/Stats'
import Account from './views/Account'
import LifeCounter, { GAME_KEY, type GameState, defaultGame, isGameInProgress } from './views/LifeCounter'

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
  const [route, setRoute] = useState(fromHash)
  const [decks, setDecks] = useStoredState<Deck[]>('cc.decks', [])
  const [matches, setMatches] = useStoredState<Match[]>('cc.matches', [])
  const [importOpen, setImportOpen] = useState(false)
  const [theme, setTheme] = useStoredState<Theme>('cc.theme', DEFAULT_THEME)
  const { data: meta, status, refresh } = useMeta()
  const circuit = useCircuit()
  const [circuitMe, setCircuitMe] = useStoredState<string | null>('cc.circuit.me', null)
  const [follow, setFollow] = useStoredState<string[]>('cc.circuit.follow', [])
  const { user } = useAuth()
  const uid = user?.uid ?? null

  useCollectionSync(uid, 'decks', decks, setDecks, (l, r) => l.updatedAt > r.updatedAt)
  useCollectionSync(uid, 'matches', matches, setMatches)
  useDocFieldSync(uid, 'theme', theme, setTheme)
  useDocFieldSync(uid, 'circuitMe', circuitMe, setCircuitMe)
  useDocFieldSync(uid, 'circuitFollow', follow, setFollow)
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

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
    if (stack && sub && !history.state?.sheet && isSub(to)) {
      history.pushState({ sub: sub + 1 }, '', `#${toHash(to)}`)
      return setRoute(fromHash())
    }
    const depth = sub + (history.state?.sheet ? 1 : 0)
    if (!depth) return land(to)
    pending.current = to
    history.go(-depth) // the popstate handler lands on `to`
  }

  const openDeck = route.deck ? decks.find((d) => d.id === route.deck) : undefined
  const circuitPrefs = { me: circuitMe, setMe: setCircuitMe, follow, setFollow }
  const openPlayer = (key: string) => go('meta', `p~${encodeURIComponent(key)}`, true)
  const openEvent = (id: string) => go('meta', `e~${id}`, true)
  // meta/p~<player key> and meta/e~<event id>
  const [metaSub, metaArg] = route.tab === 'meta' && route.deck ? [route.deck.slice(0, 1), decodeURIComponent(route.deck.slice(2))] : []
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
            meta={meta}
            decks={decks}
            matches={matches}
            gameInProgress={gameInProgress}
            go={(tab) => go(tab)}
            user={user}
            circuit={circuit.data}
            circuitMe={circuitMe}
            openPlayer={openPlayer}
            findMe={() => {
              writeStored(META_MODE_KEY, 'circuit')
              writeStored('cc.circuit.view', 'ranking')
              go('meta')
            }}
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
            onBack={() => go('home')}
            onSignOut={() => {
              // the data now lives in the account: don't leave it on a possibly shared device
              setDecks(() => [])
              setMatches(() => [])
              setTheme(() => DEFAULT_THEME)
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
              <PlayerPage circuit={circuit.data} playerKey={metaArg!} prefs={circuitPrefs} onBack={() => history.back()} openEvent={openEvent} />
            ) : (
              <EventPage circuit={circuit.data} eventId={metaArg!} prefs={circuitPrefs} onBack={() => history.back()} openPlayer={openPlayer} />
            )
          ) : (
            <Meta
              meta={meta}
              status={status}
              onRefresh={refresh}
              circuit={circuit.data}
              circuitStatus={circuit.status}
              onCircuitRefresh={circuit.refresh}
              prefs={circuitPrefs}
              openPlayer={openPlayer}
              openEvent={openEvent}
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
              <Icon name={tab} size={22} />
            )}
            <span>{t(`nav.${tab}`)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
