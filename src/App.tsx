import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n'
import { useAuth } from './lib/auth'
import { useCollectionSync, useDocFieldSync } from './lib/sync'
import { DEFAULT_THEME, type Theme, applyTheme } from './lib/theme'
import type { Deck } from './lib/decks'
import type { Match } from './lib/matches'
import { useMeta } from './lib/meta'
import { readStored, useStoredState } from './lib/storage'
import { Icon } from './components/ui'
import Home from './views/Home'
import Meta from './views/Meta'
import Decks from './views/Decks'
import DeckDetail from './views/DeckDetail'
import Stats from './views/Stats'
import Account from './views/Account'
import LifeCounter, { GAME_KEY, type GameState, defaultGame, isGameInProgress } from './views/LifeCounter'

type Tab = 'home' | 'meta' | 'game' | 'decks' | 'stats' | 'account'
const TABS = ['home', 'meta', 'game', 'decks'] as const
const ROUTES: Tab[] = [...TABS, 'stats', 'account']

const fromHash = (): { tab: Tab; deck: string | null } => {
  const [tab, deck] = location.hash.slice(1).split('/')
  return { tab: ROUTES.includes(tab as Tab) ? (tab as Tab) : 'home', deck: deck || null }
}

type Route = { tab: Tab; deck: string | null }
const toHash = (r: Route) => (r.deck ? `${r.tab}/${r.deck}` : r.tab)
const isSub = (r: Route) => !!r.deck || r.tab === 'stats' || r.tab === 'account'
const parentOf = (r: Route) => (r.deck ? r.tab : 'home')

export default function App() {
  const { t } = useI18n()
  const [route, setRoute] = useState(fromHash)
  const [decks, setDecks] = useStoredState<Deck[]>('cc.decks', [])
  const [matches, setMatches] = useStoredState<Match[]>('cc.matches', [])
  const [importOpen, setImportOpen] = useState(false)
  const [theme, setTheme] = useStoredState<Theme>('cc.theme', DEFAULT_THEME)
  const { data: meta, status, refresh } = useMeta()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  useCollectionSync(uid, 'decks', decks, setDecks, (l, r) => l.updatedAt > r.updatedAt)
  useCollectionSync(uid, 'matches', matches, setMatches)
  useDocFieldSync(uid, 'theme', theme, setTheme)
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // where history.back() is taking us when we leave a sub-page for a main page
  const pending = useRef<string | null>(null)
  useEffect(() => {
    // opened straight on a sub-page: put its parent underneath, so back still lands there
    const r = fromHash()
    if (isSub(r) && !history.state?.sub) {
      history.replaceState(null, '', `#${parentOf(r)}`)
      history.pushState({ sub: true }, '', `#${toHash(r)}`)
    }
    const onPop = () => {
      if (pending.current) {
        history.replaceState(null, '', pending.current)
        pending.current = null
      }
      setRoute(fromHash())
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.tab, route.deck])

  // Main pages replace each other, so the phone's back button closes the app from any of them.
  // A sub-page (a deck, stats, account) sits one entry above its main page, so back returns there.
  const go = (tab: Tab, deck?: string) => {
    const to = { tab, deck: deck ?? null }
    const hash = `#${toHash(to)}`
    const onSub = !!history.state?.sub
    if (isSub(to)) {
      if (onSub) history.replaceState({ sub: true }, '', hash)
      else history.pushState({ sub: true }, '', hash)
    } else if (onSub) {
      pending.current = hash
      history.back() // drop the sub-page entry; the popstate handler lands on `hash`
      return
    } else history.replaceState(null, '', hash)
    setRoute(fromHash())
  }

  const openDeck = route.deck ? decks.find((d) => d.id === route.deck) : undefined
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
            }}
          />
        )}
        {route.tab === 'stats' && (
          <Stats matches={matches} setMatches={setMatches} decks={decks} metaDecks={meta.decks} onBack={() => go('home')} />
        )}
        {route.tab === 'meta' && <Meta meta={meta} status={status} onRefresh={refresh} />}
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
          <button key={tab} className={route.tab === tab || (tab === 'home' && (route.tab === 'stats' || route.tab === 'account')) ? 'on' : ''} onClick={() => go(tab)}>
            <Icon name={tab} size={22} />
            <span>{t(`nav.${tab}`)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
