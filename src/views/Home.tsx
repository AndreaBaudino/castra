import { useI18n } from '../i18n'
import type { Deck } from '../lib/decks'
import { type Match, fmtRecord, groupBy, record } from '../lib/matches'
import { type MetaData, winrate } from '../lib/meta'
import { Icon, Pips, pct, wrClass } from '../components/ui'
import { DeckTile } from './Decks'
import { metaSummary } from './Meta'
import { ResultDots } from './Stats'

export default function Home({
  meta,
  decks,
  matches,
  gameInProgress,
  go,
  openDeck,
  importDeck,
}: {
  meta: MetaData
  decks: Deck[]
  matches: Match[]
  gameInProgress: boolean
  go: (tab: 'meta' | 'game' | 'decks' | 'stats') => void
  openDeck: (id: string) => void
  importDeck: () => void
}) {
  const { t, lang, setLang } = useI18n()
  const top = meta.decks
    .filter((d) => d.games >= 10)
    .sort((a, b) => winrate(b) - winrate(a))
    .slice(0, 5)
  const s = metaSummary(meta.decks, 10)
  const rec = record(matches)
  const topDecks = groupBy(matches, (m) => decks.find((d) => d.id === m.deckId)?.name ?? m.deckName).slice(0, 3)
  const recent = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)

  return (
    <div className="page">
      <header className="page-head brand">
        <div>
          <div className="brand-kicker">Centurion Commander</div>
          <h1>Castra</h1>
        </div>
        <div className="seg lang" aria-label={t('common.lang')}>
          {(['it', 'en'] as const).map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

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

      <section className="card">
        <div className="card-title">
          {t('home.metaSnapshot')}
          <button className="link" onClick={() => go('meta')}>
            {t('home.seeAll')}
          </button>
        </div>
        {meta.demo && <div className="muted small demo-tag">DEMO</div>}
        <div className="stats3 compact">
          <div>
            <div className="stat-num">{meta.decks.length}</div>
            <div className="stat-label">{t('meta.decks')}</div>
          </div>
          <div>
            <div className="stat-num">{s.games}</div>
            <div className="stat-label">{t('meta.games')}</div>
          </div>
          <div>
            <div className="stat-num">{pct(s.avgWr, 0)}</div>
            <div className="stat-label">{t('meta.avgWr')}</div>
          </div>
        </div>
        <ol className="mini-list">
          {top.map((d, i) => (
            <li key={d.name}>
              <span className="rank">{i + 1}</span>
              <span className="ellipsis grow">{d.name}</span>
              <Pips colors={d.colors} size={9} />
              <span className={`wr small-wr ${wrClass(winrate(d))}`}>{pct(winrate(d), 0)}</span>
            </li>
          ))}
        </ol>
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
              <DeckTile key={d.id} deck={d} metaDecks={meta.decks} onClick={() => openDeck(d.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
