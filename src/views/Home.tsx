import { useI18n } from '../i18n'
import { type Deck, deckCover } from '../lib/decks'
import { type Match, fmtRecord, record } from '../lib/matches'
import { type MetaDataset, type MetaDeck, type Season, aggregate, findMetaDeck, shortName, winrate } from '../lib/meta'
import type { AppUser } from '../lib/auth'
import { Icon, Pips, pct, wrClass } from '../components/ui'
import { useStoredState } from '../lib/storage'
import { commanderNames } from './Decks'
import { artUrl } from './MetaPages'
import { ResultDots } from './Stats'
import { CircuitCard } from './Circuit'
import { InstallBanner } from '../components/AppBanners'
import { Logo } from '../components/Logo'
import type { Circuit } from '../lib/circuit'
import { useWide } from '../lib/wide'

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
  const wide = useWide()
  // the season being played: the one of the latest tournament
  const season = dataset?.tournaments.reduce<{ d: string; s: Season } | null>(
    (best, x) => (x.date && (!best || x.date > best.d) ? { d: x.date, s: x.season } : best),
    null,
  )?.s
  const meta = dataset && season ? aggregate(dataset, { season, kind: '', league: '' }) : null
  // with more than one year of data, which one: "2026 S2"
  const seasonLabel = season ? `${dataset!.years.length > 1 ? `${dataset!.year} ` : ''}${season.toUpperCase()}` : ''
  const top = meta?.decks.slice(0, 5) ?? []
  const rec = record(matches)
  // the meta's top commanders: art tiles (compact) or the list with names, share and winrate
  const [metaView, setMetaView] = useStoredState<'strip' | 'list'>('cc.home.metaView', 'strip')
  const recent = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)

  // Compact, to fit a phone without scrolling: one row each for the stats and the circuit, and strips of art
  // for the meta and the decks.
  return (
    <div className="page home-compact">
      {/* a desktop has the brand, the game button and the account in the side menu */}
      {wide ? (
        <header className="page-head">
          <div>
            {season && <div className="brand-kicker">{t('home.season', { s: seasonLabel })}</div>}
            <h1>{t('nav.home')}</h1>
          </div>
        </header>
      ) : (
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
      )}

      <InstallBanner />
      {banner}

      {!wide && (
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
      )}

      {/* side by side on a desktop */}
      <div className="home-pair">
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
      </div>

      <div className="home-cols">
        <section className="card home-meta">
          <div className="card-title">
            <span>
              {t('home.metaSnapshot')} {season && <span className="muted small">· {seasonLabel}</span>}
            </span>
            <span className="title-actions">
              <span className="seg icon-seg" role="group" aria-label={t('home.metaView')}>
                {(['strip', 'list'] as const).map((v) => (
                  <button key={v} className={metaView === v ? 'on' : ''} onClick={() => setMetaView(v)} aria-label={t(`home.metaView.${v}`)}>
                    <Icon name={v === 'strip' ? 'image' : 'list'} size={14} />
                  </button>
                ))}
              </span>
              <button className="link" onClick={() => go('meta')}>
                {t('home.seeAll')}
              </button>
            </span>
          </div>
          {metaView === 'list' ? (
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
          ) : (
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
          )}
        </section>

        <section className="card home-decks">
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
    </div>
  )
}
