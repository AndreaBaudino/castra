import { useI18n } from '../i18n'
import type { Deck } from '../lib/decks'
import { type Match, fmtRecord, groupBy, record } from '../lib/matches'
import { type MetaDataset, type MetaDeck, type Season, aggregate, shortName, winrate } from '../lib/meta'
import type { AppUser } from '../lib/auth'
import { Icon, Pips, pct, wrClass } from '../components/ui'
import { DeckTile } from './Decks'
import { ResultDots } from './Stats'
import { CircuitCard } from './Circuit'
import { InstallBanner } from '../components/AppBanners'
import { Logo } from '../components/Logo'
import type { Circuit } from '../lib/circuit'

export default function Home({
  banner,
  dataset,
  metaDecks,
  decks,
  matches,
  gameInProgress,
  go,
  user,
  openDeck,
  importDeck,
  circuit,
  circuitStatus,
  circuitMe,
  openPlayer,
  findMe,
  openCommander,
}: {
  banner?: React.ReactNode
  dataset: MetaDataset | null
  metaDecks: MetaDeck[] // the whole year, for the winrate on the deck tiles
  decks: Deck[]
  matches: Match[]
  gameInProgress: boolean
  go: (tab: 'meta' | 'game' | 'decks' | 'stats' | 'account') => void
  user: AppUser | null
  openDeck: (id: string) => void
  importDeck: () => void
  circuit: Circuit | null
  circuitStatus: 'idle' | 'loading' | 'error'
  circuitMe: string | null
  openPlayer: (key: string) => void
  findMe: () => void
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  // the season being played: the one of the latest tournament
  const season = dataset?.tournaments.reduce<{ d: string; s: Season } | null>(
    (best, x) => (x.date && (!best || x.date > best.d) ? { d: x.date, s: x.season } : best),
    null,
  )?.s
  const meta = dataset && season ? aggregate(dataset, { season, kind: '', league: '' }) : null
  const top = meta?.decks.slice(0, 5) ?? []
  const rec = record(matches)
  const topDecks = groupBy(matches, (m) => decks.find((d) => d.id === m.deckId)?.name ?? m.deckName).slice(0, 3)
  const recent = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)

  return (
    <div className="page">
      <header className="page-head brand">
        <div className="brand-mark">
          <Logo />
          <div>
            <div className="brand-kicker">Centurion Commander</div>
            <h1>Castra</h1>
          </div>
        </div>
        <div className="head-right">
          <button className="account-btn" onClick={() => go('account')} aria-label={t('auth.title')}>
            {user?.photo ? (
              <img src={user.photo} alt="" referrerPolicy="no-referrer" />
            ) : user ? (
              <span className="avatar">{(user.name ?? user.email ?? '?')[0].toUpperCase()}</span>
            ) : (
              <Icon name="user" />
            )}
          </button>
        </div>
      </header>

      <InstallBanner />
      {banner}

      <button className="hero-btn" onClick={() => go('game')}>
        <span className="hero-icon">
          <Icon name="game" size={26} />
        </span>
        <span className="hero-text">
          <strong>{gameInProgress ? t('home.resumeGame') : t('home.newGame')}</strong>
          <span>{gameInProgress ? t('home.resumeSub') : t('home.newGameSub')}</span>
        </span>
        <Icon name="chevron" />
      </button>

      <section className="card">
        <div className="card-title">
          {t('stats.title')}
          <button className="link" onClick={() => go('stats')}>
            {t('stats.details')}
          </button>
        </div>
        {!matches.length ? (
          <p className="muted small no-margin">{t('stats.empty')}</p>
        ) : (
          <>
            <div className="stats3 compact">
              <div>
                <div className="stat-num">{rec.games}</div>
                <div className="stat-label">{t('stats.games')}</div>
              </div>
              <div>
                <div className="stat-num">{fmtRecord(rec)}</div>
                <div className="stat-label">{t('stats.record')}</div>
              </div>
              <div>
                <div className={`stat-num ${wrClass(rec.wr)}`}>{pct(rec.wr, 0)}</div>
                <div className="stat-label">{t('stats.wr')}</div>
              </div>
            </div>
            <ResultDots matches={matches} />
            <ol className="mini-list">
              {topDecks.map((g) => (
                <li key={g.name}>
                  <span className="ellipsis grow">{g.name}</span>
                  <span className="muted small">{fmtRecord(g.rec)}</span>
                  <span className={`wr small-wr ${wrClass(g.rec.wr)}`}>{pct(g.rec.wr, 0)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <CircuitCard circuit={circuit} status={circuitStatus} me={circuitMe} openPlayer={openPlayer} findMe={findMe} />

      <section className="card">
        <div className="card-title">
          {t('home.metaSnapshot')}
          <button className="link" onClick={() => go('meta')}>
            {t('home.seeAll')}
          </button>
        </div>
        {meta && season && (
          <>
            <div className="muted small">{t('home.metaSeason', { s: season.toUpperCase(), n: meta.tournaments, e: meta.entries })}</div>
            <ol className="mini-list">
              {top.map((d, i) => (
                <li key={d.id} className="clickable" onClick={() => openCommander(d.name)}>
                  <span className="rank">{i + 1}</span>
                  <span className="ellipsis grow">{shortName(d.name)}</span>
                  <Pips colors={d.colors} size={9} />
                  <span className="small muted">{pct(d.share, 0)}</span>
                  <span className={`wr small-wr ${wrClass(winrate(d))}`}>{pct(winrate(d), 0)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          {t('home.myDecks')}
          {decks.length > 0 && (
            <button className="link" onClick={() => go('decks')}>
              {t('home.seeAll')}
            </button>
          )}
        </div>
        {!decks.length ? (
          <div className="empty-inline">
            <p className="muted small">{t('home.noDecks')}</p>
            <button className="btn small primary" onClick={importDeck}>
              <Icon name="plus" size={16} /> {t('home.importDeck')}
            </button>
          </div>
        ) : (
          <div className="deck-list flush">
            {recent.map((d) => (
              <DeckTile key={d.id} deck={d} metaDecks={metaDecks} onClick={() => openDeck(d.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
