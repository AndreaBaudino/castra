import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import type { Deck } from '../lib/decks'
import { type Match, fmtRecord, groupBy, record } from '../lib/matches'
import { type MetaDeck, normName, winrate } from '../lib/meta'
import { Icon, pct, wrClass } from '../components/ui'
import { RecordMatch } from '../components/RecordMatch'

type Filter = 'all' | Match['kind']

export function ResultDots({ matches, n = 10 }: { matches: Match[]; n?: number }) {
  const last = [...matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
  return (
    <span className="res-dots">
      {last.map((m) => (
        <span key={m.id} className={`res-dot res-${m.result}`} title={m.result} />
      ))}
    </span>
  )
}

export default function Stats({
  matches,
  setMatches,
  decks,
  metaDecks,
  onBack,
}: {
  matches: Match[]
  setMatches: (fn: (m: Match[]) => Match[]) => void
  decks: Deck[]
  metaDecks: MetaDeck[]
  onBack: () => void
}) {
  const { t, lang } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const shown = useMemo(
    () => matches.filter((m) => filter === 'all' || m.kind === filter).sort((a, b) => b.date.localeCompare(a.date)),
    [matches, filter],
  )
  const rec = record(shown)
  // group by the current deck name when the deck still exists, so renames don't split the stats
  const byDeck = groupBy(shown, (m) => decks.find((d) => d.id === m.deckId)?.name ?? m.deckName)
  const byOpp = groupBy(shown, (m) => m.opponent)
  const metaWr = (name: string) => metaDecks.find((d) => normName(d.name) === normName(name))

  return (
    <div className="page">
      <header className="page-head">
        <div className="head-left">
          <button className="icon-btn" onClick={onBack} aria-label="back">
            <Icon name="back" />
          </button>
          <h1>{t('stats.title')}</h1>
        </div>
        <button className="btn small primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> {t('stats.add')}
        </button>
      </header>

      <div className="seg wide">
        {(['all', 'tournament', 'casual'] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {t(f === 'all' ? 'stats.all' : f === 'tournament' ? 'match.tournament' : 'match.casual')}
          </button>
        ))}
      </div>

      {!shown.length ? (
        <div className="empty-state">
          <Icon name="stats" size={40} />
          <p>{t('stats.empty')}</p>
        </div>
      ) : (
        <>
          <section className="card">
            <div className="stats3">
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
            <div className="kv">
              <span>{t('stats.last')}</span>
              <ResultDots matches={shown} />
            </div>
          </section>

          <section className="group">
            <div className="group-title">{t('stats.byDeck')}</div>
            <ul className="card-list">
              {byDeck.map((g) => {
                const m = metaWr(g.name)
                return (
                  <li key={g.name} className="stat-row">
                    <span className="ellipsis grow">{g.name}</span>
                    {m && <span className="muted small">{t('stats.vsMeta', { wr: pct(winrate(m), 0) })}</span>}
                    <span className="muted small rec">{fmtRecord(g.rec)}</span>
                    <span className={`wr small-wr ${wrClass(g.rec.wr)}`}>{pct(g.rec.wr, 0)}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="group">
            <div className="group-title">{t('stats.byOpponent')}</div>
            <ul className="card-list">
              {byOpp.map((g) => (
                <li key={g.name} className="stat-row">
                  <span className="ellipsis grow">{g.name}</span>
                  <span className="muted small rec">{fmtRecord(g.rec)}</span>
                  <span className={`wr small-wr ${wrClass(g.rec.wr)}`}>{pct(g.rec.wr, 0)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="group">
            <div className="group-title">{t('stats.history')}</div>
            <ul className="card-list">
              {shown.map((m) => (
                <li key={m.id} className="stat-row history">
                  <span className={`res-badge res-${m.result}`}>{m.result}</span>
                  <span className="grow hist-main">
                    <span className="ellipsis">
                      {decks.find((d) => d.id === m.deckId)?.name ?? m.deckName} <span className="muted">vs</span> {m.opponent || '—'}
                    </span>
                    <span className="muted small">
                      {new Date(m.date).toLocaleDateString(lang)} · {t(m.kind === 'tournament' ? 'match.tournament' : 'match.casual')}
                      {m.durationMin ? ` · ${m.durationMin}′` : ''}
                      {m.notes ? ` · ${m.notes}` : ''}
                    </span>
                  </span>
                  <button
                    className="icon-btn"
                    aria-label="delete"
                    onClick={() => confirm(t('stats.deleteConfirm')) && setMatches((ms) => ms.filter((x) => x.id !== m.id))}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <RecordMatch
        open={adding}
        onClose={() => setAdding(false)}
        decks={decks}
        metaNames={metaDecks.map((d) => d.name)}
        onSave={(m) => {
          setMatches((ms) => [m, ...ms])
          setAdding(false)
        }}
      />
    </div>
  )
}
