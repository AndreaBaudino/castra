import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { type Deck, newId } from '../lib/decks'
import { type Format, type Match, type Result, playedGames, resultOfScore, scoreOf } from '../lib/matches'
import { useStoredState } from '../lib/storage'
import { readPrefs } from '../lib/prefs'
import { Sheet } from './ui'

const RESULTS = [
  ['W', 'match.win'],
  ['L', 'match.loss'],
  ['D', 'match.draw'],
] as const

export function RecordMatch({
  open,
  onClose,
  onSave,
  decks,
  metaNames,
  suggestedResult,
  durationMin,
  saveLabel,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSave: (m: Match) => void
  decks: Deck[]
  metaNames: string[]
  suggestedResult?: Result
  durationMin?: number
  saveLabel?: string
  /** an existing match to edit instead of recording a new one */
  editing?: Match
}) {
  const { t } = useI18n()
  const [lastDeck, setLastDeck] = useStoredState<string>('cc.lastDeck', '')
  const [kind, setKind] = useStoredState<Match['kind']>('cc.lastKind', 'casual')
  const [format, setFormat] = useStoredState<Format>('cc.lastFormat', 'bo1')
  const [result, setResult] = useState<Result | null>(null)
  const [games, setGames] = useState<(Result | undefined)[]>([])
  const [deckId, setDeckId] = useState('')
  const [deckFree, setDeckFree] = useState('')
  const [opponent, setOpponent] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      const known = decks.some((d) => d.id === editing.deckId)
      setFormat(editing.format ?? 'bo1')
      setResult(editing.result)
      // older bo3s only have the score: rebuild the games from it
      const [w, l] = editing.score ?? [0, 0]
      setGames(editing.games ?? [...Array<Result>(w).fill('W'), ...Array<Result>(l).fill('L')])
      setDeckId(known ? editing.deckId! : '')
      setDeckFree(known ? '' : editing.deckName)
      setOpponent(editing.opponent)
      setKind(editing.kind)
      setNotes(editing.notes ?? '')
      return
    }
    // a fixed choice from the account's preferences, otherwise the last one used
    const prefs = readPrefs()
    if (prefs.format !== 'last') setFormat(prefs.format)
    if (prefs.kind !== 'last') setKind(prefs.kind)
    setResult(suggestedResult ?? null)
    setGames([])
    setDeckId(decks.some((d) => d.id === lastDeck) ? lastDeck : '')
    setDeckFree('')
    setOpponent('')
    setNotes('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const deck = decks.find((d) => d.id === deckId)
  const deckName = deck?.name ?? deckFree.trim()
  const played = playedGames(games)
  const score = scoreOf(played)
  const finalResult = format === 'bo3' ? (played.length ? resultOfScore(score) : null) : result
  // tapping the selected result again clears it
  const setGame = (i: number, r: Result) => setGames((gs) => Object.assign([...gs], { [i]: gs[i] === r ? undefined : r }))
  const canSave = !!finalResult && !!deckName

  const save = () => {
    if (!finalResult || !deckName) return
    if (!editing) setLastDeck(deckId)
    onSave({
      ...editing,
      id: editing?.id ?? newId(),
      date: editing?.date ?? new Date().toISOString(),
      result: finalResult,
      format,
      games: format === 'bo3' ? played : undefined,
      score: format === 'bo3' ? score : undefined,
      deckId: deck?.id,
      deckName,
      opponent: opponent.trim(),
      kind,
      durationMin: editing ? editing.durationMin : durationMin,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={t(editing ? 'match.editTitle' : 'match.title')}>
      <div className="form">
        <div className="seg wide">
          {(['bo1', 'bo3'] as const).map((f) => (
            <button key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>
              {f === 'bo1' ? 'Bo1' : 'Bo3'}
            </button>
          ))}
        </div>
        {format === 'bo3' ? (
          <div className="bo3">
            <div className="field">
              <span>
                {t('match.result')}
                {played.length > 0 && <strong className={`bo3-score res-text-${finalResult}`}> {score.join('-')}</strong>}
              </span>
            </div>
            {[0, 1, 2].map((i) => {
              // a game can be set once the previous ones are and the match isn't decided yet
              const open = i <= played.length && (i === played.length ? !(score[0] === 2 || score[1] === 2) : true)
              return (
                <div key={i} className={`field ${open ? '' : 'off'}`}>
                  <span>Game {i + 1}</span>
                  <div className="seg wide game-seg">
                    {RESULTS.map(([r, k]) => (
                      <button
                        key={r}
                        disabled={!open}
                        className={`res-${r} ${open && games[i] === r ? 'on' : ''}`}
                        onClick={() => setGame(i, r)}
                      >
                        {t(k)}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="result-pick">
            {RESULTS.map(([r, k]) => (
              <button key={r} className={`res res-${r} ${result === r ? 'on' : ''}`} onClick={() => setResult(r)}>
                {t(k)}
              </button>
            ))}
          </div>
        )}
        <label>
          <span>{t('match.myDeck')}</span>
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            <option value="">{t('match.noDeck')}</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {!deckId && (
          <label>
            <span>{t('match.deckFree')}</span>
            <input value={deckFree} onChange={(e) => setDeckFree(e.target.value)} list="meta-names" />
          </label>
        )}
        <label>
          <span>{t('match.opponent')}</span>
          <input value={opponent} onChange={(e) => setOpponent(e.target.value)} list="meta-names" />
        </label>
        <datalist id="meta-names">
          {metaNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="field">
          <span>{t('match.kind')}</span>
          <div className="seg wide">
            {(['tournament', 'casual'] as const).map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {t(k === 'tournament' ? 'match.tournament' : 'match.casual')}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span>{t('match.notes')}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!canSave} onClick={save}>
          {editing ? t('match.update') : (saveLabel ?? t('match.save'))}
        </button>
      </div>
    </Sheet>
  )
}
