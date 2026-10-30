import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { type Deck, newId } from '../lib/decks'
import { type Format, type Match, type Result, playedGames, resultOfScore, scoreOf } from '../lib/matches'
import { useStoredState } from '../lib/storage'
import { readPrefs } from '../lib/prefs'
import { playerKey } from '../lib/circuit'
import { normName } from '../lib/meta'
import { commanderNames } from '../views/Decks'
import { Icon, Sheet } from './ui'

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
  players,
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
  /** circuit players, to pick the opponent from */
  players?: { key: string; name: string }[]
}) {
  const { t } = useI18n()
  const [lastDeck, setLastDeck] = useStoredState<string>('cc.lastDeck', '')
  // what was written when the last match wasn't played with one of the app's decks
  const [lastDeckName, setLastDeckName] = useStoredState<string>('cc.lastDeckName', '')
  // the kind and format of the last match recorded: a new one starts from them, editing an old one leaves them alone
  const [lastKind, setLastKind] = useStoredState<Match['kind']>('cc.lastKind', 'casual')
  const [lastFormat, setLastFormat] = useStoredState<Format>('cc.lastFormat', 'bo1')
  const [kind, setKind] = useState(lastKind)
  const [format, setFormat] = useState(lastFormat)
  const [result, setResult] = useState<Result | null>(null)
  const [games, setGames] = useState<(Result | undefined)[]>([])
  // one field for the deck: free text, or one of the app's decks picked from the suggestions
  const [deckText, setDeckText] = useState('')
  const [deckId, setDeckId] = useState('')
  const [opponent, setOpponent] = useState('')
  const [notes, setNotes] = useState('')
  const [start, setStart] = useState<Match['start'] | null>(null)
  const [oppName, setOppName] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      const known = decks.find((d) => d.id === editing.deckId)
      setFormat(editing.format ?? 'bo1')
      setResult(editing.result)
      // older bo3s only have the score: rebuild the games from it
      const [w, l] = editing.score ?? [0, 0]
      setGames(editing.games ?? [...Array<Result>(w).fill('W'), ...Array<Result>(l).fill('L')])
      setDeckId(known?.id ?? '')
      setDeckText(known?.name ?? editing.deckName)
      setOpponent(editing.opponent)
      setKind(editing.kind)
      setNotes(editing.notes ?? '')
      setStart(editing.start ?? null)
      setOppName(editing.opponentName ?? '')
      return
    }
    // a fixed choice from the account's preferences, otherwise the last one used
    const prefs = readPrefs()
    setFormat(prefs.format !== 'last' ? prefs.format : lastFormat)
    setKind(prefs.kind !== 'last' ? prefs.kind : lastKind)
    setResult(suggestedResult ?? null)
    setGames([])
    const last = decks.find((d) => d.id === lastDeck)
    setDeckId(last?.id ?? '')
    setDeckText(last?.name ?? lastDeckName)
    setOpponent('')
    setNotes('')
    setStart(null)
    setOppName('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // picked from the list, or written exactly as one of the decks is called
  const deck = decks.find((d) => d.id === deckId) ?? decks.find((d) => normName(d.name) === normName(deckText.trim()))
  const deckName = deck?.name ?? deckText.trim()
  const played = playedGames(games)
  const score = scoreOf(played)
  const finalResult = format === 'bo3' ? (played.length ? resultOfScore(score) : null) : result
  // tapping the selected result again clears it
  const setGame = (i: number, r: Result) => setGames((gs) => Object.assign([...gs], { [i]: gs[i] === r ? undefined : r }))
  const canSave = !!finalResult && !!deckName
  const oppPlayer = oppName.trim() ? players?.find((p) => p.key === playerKey(oppName)) : undefined

  const save = () => {
    if (!finalResult || !deckName) return
    if (!editing) {
      setLastDeck(deck?.id ?? '')
      setLastDeckName(deckName)
      setLastKind(kind)
      setLastFormat(format)
    }
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
      start: start ?? undefined,
      opponentName: oppName.trim() || undefined,
      opponentPlayer: oppPlayer?.key,
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
        <div className="field">
          <span>{t(format === 'bo3' ? 'match.startG1' : 'match.start')}</span>
          <div className="seg wide">
            {(['play', 'draw'] as const).map((s) => (
              // tapping the selected one again clears it: often nobody remembers
              <button key={s} className={start === s ? 'on' : ''} onClick={() => setStart(start === s ? null : s)}>
                {t(s === 'play' ? 'match.otp' : 'match.otd')}
              </button>
            ))}
          </div>
        </div>
        <DeckField
          value={deckText}
          decks={decks}
          metaNames={metaNames}
          onType={(v) => {
            setDeckText(v)
            setDeckId('')
          }}
          onPick={(d) => {
            setDeckText(d.name)
            setDeckId(d.id)
          }}
        />
        <label>
          <span>{t('match.opponent')}</span>
          <input value={opponent} onChange={(e) => setOpponent(e.target.value)} list="meta-names" />
        </label>
        <label>
          <span>
            {t('match.oppPlayer')}
            {oppPlayer && (
              <span className="opp-linked">
                {' '}
                <Icon name="check" size={12} /> {t('match.oppInCircuit')}
              </span>
            )}
          </span>
          <input value={oppName} onChange={(e) => setOppName(e.target.value)} list="circuit-players" autoComplete="off" />
        </label>
        <datalist id="circuit-players">
          {players?.map((p) => (
            <option key={p.key} value={p.name} />
          ))}
        </datalist>
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
        {!canSave && <p className="muted small center no-margin">{t(finalResult ? 'match.needDeck' : 'match.needResult')}</p>}
        <button className="btn primary" disabled={!canSave} onClick={save}>
          {editing ? t('match.update') : (saveLabel ?? t('match.save'))}
        </button>
      </div>
    </Sheet>
  )
}

/** "My deck": whatever the player writes, with their decks in the app and the meta's commanders as suggestions. */
function DeckField({
  value,
  decks,
  metaNames,
  onType,
  onPick,
}: {
  value: string
  decks: Deck[]
  metaNames: string[]
  onType: (v: string) => void
  onPick: (d: Deck) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const q = normName(value.trim())
  const mine = decks.filter((d) => !q || normName([d.name, ...commanderNames(d)].join(' ')).includes(q)).slice(0, 5)
  const cmds = q ? metaNames.filter((n) => normName(n).includes(q) && n !== value).slice(0, 5) : []
  const pick = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }
  return (
    <div className="deck-field" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <label>
        <span>{t('match.myDeck')}</span>
        <input
          value={value}
          placeholder={t('match.deckHint')}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onType(e.target.value)
            setOpen(true)
          }}
        />
      </label>
      {open && mine.length + cmds.length > 0 && (
        // keeps the focus in the field, so the tap reaches the button before the list closes
        <ul className="ac-list" onPointerDown={(e) => e.preventDefault()}>
          {mine.length > 0 && <li className="ac-head">{t('match.yourDecks')}</li>}
          {mine.map((d) => (
            <li key={d.id}>
              <button onClick={pick(() => onPick(d))}>
                <b className="ellipsis">{d.name}</b>
                <span className="muted small ellipsis">{commanderNames(d).filter((n) => n !== d.name).join(' / ')}</span>
              </button>
            </li>
          ))}
          {cmds.length > 0 && <li className="ac-head">{t('match.commanders')}</li>}
          {cmds.map((n) => (
            <li key={n}>
              <button onClick={pick(() => onType(n))}>{n}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
