import { useI18n } from '../i18n'
import { type Deck, deckCover } from '../lib/decks'
import { type Match, fmtRecord, record } from '../lib/matches'
import { type MetaDataset, type MetaDeck, type Season, aggregate, findMetaDeck, shortName, winrate } from '../lib/meta'
import type { AppUser } from '../lib/auth'
import { Icon, pct, wrClass } from '../components/ui'
import { commanderNames } from './Decks'
import { artUrl } from './MetaPages'
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
  const recent = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)

  // Compact, to fit a phone without scrolling: one row each for the stats and the circuit, and strips of art
  // for the meta and the decks.
  return (
    <div className="page home-compact">
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
          <Icon name="game" size={22} />
        </span>
        <span className="hero-text">
          <strong>{gameInProgress ? t('home.resumeGame') : t('home.newGame')}</strong>
          <span>{gameInProgress ? t('home.resumeSub') : t('home.newGameSub')}</span>
        </span>
        <Icon name="chevron" />
      </button>

      <button className="card home-row" onClick={() => go('stats')}>
        <span className="title-live">{t('stats.title')}</span>
        {!matches.length ? (
          <span className="muted small">{t('stats.emptyShort')}</span>
        ) : (
          <span className="home-row-link">
            <b className={wrClass(rec.wr)}>{pct(rec.wr, 0)}</b>
            <span className="muted small">{fmtRecord(rec)}</span>
            <ResultDots matches={matches} n={6} />
            <Icon name="chevron" size={16} />
          </span>
        )}
      </button>
      <CircuitCard compact circuit={circuit} status={circuitStatus} me={circuitMe} openPlayer={openPlayer} findMe={findMe} />

      <section className="card">
        <div className="card-title">
          <span>
            {t('home.metaSnapshot')} {season && <span className="muted small">· {season.toUpperCase()}</span>}
          </span>
          <button className="link" onClick={() => go('meta')}>
            {t('home.seeAll')}
          </button>
        </div>
        <div className="strip">
          {top.map((d, i) => (
            <button key={d.id} className="strip-tile" style={{ backgroundImage: `url("${artUrl(d.name)}")` }} onClick={() => openCommander(d.name)}>
              <span className="strip-rank">{i + 1}</span>
              <span className="strip-text">
                <span className="ellipsis">{shortName(d.name).split(',')[0]}</span>
                <span>
                  {pct(d.share, 0)} · <b className={wrClass(winrate(d))}>{pct(winrate(d), 0)}</b>
                </span>
              </span>
            </button>
          ))}
        </div>
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
          <div className="strip">
            {recent.map((d) => {
              const m = findMetaDeck(metaDecks, commanderNames(d))
              const art = deckCover(d)
              return (
                <button key={d.id} className="strip-tile" style={art ? { backgroundImage: `url("${art}")` } : undefined} onClick={() => openDeck(d.id)}>
                  <span className="strip-text">
                    <span className="ellipsis">{d.name}</span>
                    {m && <b className={wrClass(winrate(m))}>{pct(winrate(m), 0)}</b>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
