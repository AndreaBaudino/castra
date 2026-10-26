import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { type Deck, newId } from '../lib/decks'
import { type Format, type Match, type Result, resultOfScore } from '../lib/matches'
import { useStoredState } from '../lib/storage'
import { Sheet } from './ui'

// games won - games lost; 1-0, 1-1 and 0-0 happen when time runs out
const BO3_SCORES: [number, number][] = [[2, 0], [2, 1], [1, 0], [1, 1], [0, 0], [0, 1], [1, 2], [0, 2]]

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
  const [score, setScore] = useState<[number, number] | null>(null)
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
      setScore(editing.score ?? null)
      setDeckId(known ? editing.deckId! : '')
      setDeckFree(known ? '' : editing.deckName)
      setOpponent(editing.opponent)
      setKind(editing.kind)
      setNotes(editing.notes ?? '')
      return
    }
    setResult(suggestedResult ?? null)
    setScore(null)
    setDeckId(decks.some((d) => d.id === lastDeck) ? lastDeck : '')
    setDeckFree('')
    setOpponent('')
    setNotes('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const deck = decks.find((d) => d.id === deckId)
  const deckName = deck?.name ?? deckFree.trim()
  const finalResult = format === 'bo3' ? score && resultOfScore(score) : result
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
      score: format === 'bo3' ? score! : undefined,
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
          <div className="field">
            <span>{t('match.score')}</span>
            <div className="score-pick">
              {BO3_SCORES.map((sc) => (
                <button
                  key={sc.join()}
                  className={`res res-${resultOfScore(sc)} ${score?.join() === sc.join() ? 'on' : ''}`}
                  onClick={() => setScore(sc)}
                >
                  {sc.join('-')}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="result-pick">
            {(
              [
                ['W', 'match.win'],
                ['L', 'match.loss'],
                ['D', 'match.draw'],
              ] as const
            ).map(([r, k]) => (
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
