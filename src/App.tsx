import { useEffect, useState } from 'react'
import { useI18n } from './i18n'
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
import LifeCounter, { GAME_KEY, type GameState, defaultGame, isGameInProgress } from './views/LifeCounter'

type Tab = 'home' | 'meta' | 'game' | 'decks' | 'stats'
const TABS: Exclude<Tab, 'stats'>[] = ['home', 'meta', 'game', 'decks']
const ROUTES: Tab[] = [...TABS, 'stats']

const fromHash = (): { tab: Tab; deck: string | null } => {
  const [tab, deck] = location.hash.slice(1).split('/')
  return { tab: ROUTES.includes(tab as Tab) ? (tab as Tab) : 'home', deck: deck || null }
}

export default function App() {
  const { t } = useI18n()
  const [route, setRoute] = useState(fromHash)
  const [decks, setDecks] = useStoredState<Deck[]>('cc.decks', [])
  const [matches, setMatches] = useStoredState<Match[]>('cc.matches', [])
  const [importOpen, setImportOpen] = useState(false)
  const { data: meta, status, refresh } = useMeta()

  useEffect(() => {
    const onHash = () => setRoute(fromHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.tab, route.deck])

  const go = (tab: Tab, deck?: string) => {
    location.hash = deck ? `${tab}/${deck}` : tab
  }

  if (route.tab === 'game')
    return (
      <LifeCounter
        onExit={() => go('home')}
        decks={decks}
        metaNames={meta.decks.map((d) => d.name)}
        onSaveMatch={(m) => setMatches((ms) => [m, ...ms])}
      />
    )

  const openDeck = route.deck ? decks.find((d) => d.id === route.deck) : undefined
  const gameInProgress = isGameInProgress(readStored<GameState>(GAME_KEY, defaultGame()))

  return (
    <div className="app">
      <main>
        {route.tab === 'home' && (
          <Home
            meta={meta}
            decks={decks}
            matches={matches}
            gameInProgress={gameInProgress}
            go={(tab) => go(tab)}
            openDeck={(id) => go('decks', id)}
            importDeck={() => {
              setImportOpen(true)
              go('decks')
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
              onBack={() => history.back()}
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
          <button key={tab} className={route.tab === tab || (tab === 'home' && route.tab === 'stats') ? 'on' : ''} onClick={() => go(tab)}>
            <Icon name={tab} size={22} />
            <span>{t(`nav.${tab}`)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
