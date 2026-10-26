import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { type Deck, newId } from '../lib/decks'
import type { Match, Result } from '../lib/matches'
import { useStoredState } from '../lib/storage'
import { Sheet } from './ui'

export function RecordMatch({
  open,
  onClose,
  onSave,
  decks,
  metaNames,
  suggestedResult,
  durationMin,
  saveLabel,
}: {
  open: boolean
  onClose: () => void
  onSave: (m: Match) => void
  decks: Deck[]
  metaNames: string[]
  suggestedResult?: Result
  durationMin?: number
  saveLabel?: string
}) {
  const { t } = useI18n()
  const [lastDeck, setLastDeck] = useStoredState<string>('cc.lastDeck', '')
  const [kind, setKind] = useStoredState<Match['kind']>('cc.lastKind', 'casual')
  const [result, setResult] = useState<Result | null>(null)
  const [deckId, setDeckId] = useState('')
  const [deckFree, setDeckFree] = useState('')
  const [opponent, setOpponent] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setResult(suggestedResult ?? null)
    setDeckId(decks.some((d) => d.id === lastDeck) ? lastDeck : '')
    setDeckFree('')
    setOpponent('')
    setNotes('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const deck = decks.find((d) => d.id === deckId)
  const deckName = deck?.name ?? deckFree.trim()
  const canSave = !!result && !!deckName

  const save = () => {
    if (!result || !deckName) return
    setLastDeck(deckId)
    onSave({
      id: newId(),
      date: new Date().toISOString(),
      result,
      deckId: deck?.id,
      deckName,
      opponent: opponent.trim(),
      kind,
      durationMin,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('match.title')}>
      <div className="form">
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
          {saveLabel ?? t('match.save')}
        </button>
      </div>
    </Sheet>
  )
}
