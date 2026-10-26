import { useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { type Deck, checkDeck, deckCover, isValid, newId, parseDecklist, sortColors } from '../lib/decks'
import { type MetaDeck, findMetaDeck, normName, winrate } from '../lib/meta'
import { fetchCollection, requestKey } from '../lib/scryfall'
import { Icon, Pips, Sheet, pct, wrClass } from '../components/ui'

export function commanderNames(deck: Deck) {
  return deck.cards.filter((c) => c.section === 'commander').map((c) => c.name)
}

/** Tap = onClick, press-and-hold (or right click) = onLongPress. */
function useLongPress(onClick: () => void, onLongPress?: () => void) {
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const start = useRef<[number, number]>([0, 0])
  if (!onLongPress) return { onClick }
  const cancel = () => clearTimeout(timer.current)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false
      start.current = [e.clientX, e.clientY]
      timer.current = window.setTimeout(() => {
        fired.current = true
        navigator.vibrate?.(30)
        onLongPress()
      }, 500)
    },
    // scrolling the list is not a long press
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.abs(e.clientX - start.current[0]) + Math.abs(e.clientY - start.current[1]) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: () => {
      if (!fired.current) onClick()
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      cancel()
      if (!fired.current) onLongPress()
      fired.current = true
    },
  }
}

export function DeckTile({
  deck,
  metaDecks,
  onClick,
  onLongPress,
}: {
  deck: Deck
  metaDecks: MetaDeck[]
  onClick: () => void
  onLongPress?: () => void
}) {
  const { t } = useI18n()
  const check = checkDeck(deck)
  const art = deckCover(deck)
  const m = findMetaDeck(metaDecks, commanderNames(deck))
  const press = useLongPress(onClick, onLongPress)
  return (
    <button className="deck-tile" {...press}>
      <div className="deck-art" style={art ? { backgroundImage: `url(${art})` } : undefined} />
      <div className="deck-info">
        <div className="name-line">
          <span className="ellipsis">{deck.name}</span>
        </div>
        <div className="sub-line">
          <Pips colors={sortColors(check.identity)} size={10} />
          <span className={`muted small ${isValid(check) ? '' : 'warn-text'}`}>
            {check.count}/100 {t('decks.cards')}
          </span>
          {deck.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
      {m ? <span className={`wr small-wr ${wrClass(winrate(m))}`}>{pct(winrate(m), 0)}</span> : <Icon name="chevron" size={16} />}
    </button>
  )
}

function ImportSheet({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (d: Deck) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const cards = parseDecklist(text)
    if (!cards.length) return
    setBusy(true)
    setError('')
    try {
      const { found, notFound } = await fetchCollection(cards)
      for (const c of cards) {
        const info = found.get(requestKey(c))
        if (info) {
          c.info = info
          c.name = info.name
        }
      }
      // no explicit commander section: Moxfield's plain-text export puts it last, after a blank line
      if (!cards.some((c) => c.section === 'commander')) {
        const blocks = text.trim().split(/\n\s*\n/)
        const last = blocks.length > 1 ? parseDecklist(blocks[blocks.length - 1]) : []
        if (last.length && last.length <= 2 && last.every((l) => l.qty === 1)) {
          const front = (n: string) => normName(n.split(' // ')[0])
          for (const l of last) {
            const c = cards.find((x) => front(x.name) === front(l.name))
            if (c && /legendary/i.test(c.info?.typeLine ?? '')) c.section = 'commander'
          }
        }
      }
      const now = new Date().toISOString()
      const commander = cards.find((c) => c.section === 'commander')?.name
      onImport({
        id: newId(),
        name: name.trim() || commander || 'Deck',
        tags: tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: '',
        cards,
        createdAt: now,
        updatedAt: now,
      })
      if (notFound.length) alert(`${t('decks.notFound')}: ${notFound.join(', ')}`)
      setName('')
      setText('')
      setTags('')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('decks.import')}>
      <div className="form">
        <label>
          <span>{t('decks.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>{t('decks.paste')}</span>
          <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('decks.pasteHint')} />
        </label>
        <label>
          <span>{t('decks.tags')}</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cEDH, torneo…" />
        </label>
        {error && <div className="notice warn">{error}</div>}
        <button className="btn primary" disabled={busy || !text.trim()} onClick={submit}>
          {busy ? t('decks.importing') : t('decks.doImport')}
        </button>
      </div>
    </Sheet>
  )
}

export default function Decks({
  decks,
  setDecks,
  metaDecks,
  onOpen,
  importOpen,
  setImportOpen,
}: {
  decks: Deck[]
  setDecks: (fn: (d: Deck[]) => Deck[]) => void
  metaDecks: MetaDeck[]
  onOpen: (id: string) => void
  importOpen: boolean
  setImportOpen: (v: boolean) => void
}) {
  const { t } = useI18n()
  const [tag, setTag] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [actions, setActions] = useState<Deck | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const allTags = useMemo(() => [...new Set(decks.flatMap((d) => d.tags))].sort(), [decks])
  const shown = decks
    .filter((d) => !tag || d.tags.includes(tag))
    .filter((d) => !q || normName(d.name + ' ' + commanderNames(d).join(' ')).includes(normName(q)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t('decks.title')}</h1>
        <button className="btn small primary" onClick={() => setImportOpen(true)}>
          <Icon name="plus" size={16} /> {t('decks.import')}
        </button>
      </header>

      {decks.length > 3 && (
        <div className="search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('decks.search')} />
        </div>
      )}

      {allTags.length > 0 && (
        <div className="chips">
          <button className={!tag ? 'chip on' : 'chip'} onClick={() => setTag(null)}>
            {t('decks.all')}
          </button>
          {allTags.map((x) => (
            <button key={x} className={tag === x ? 'chip on' : 'chip'} onClick={() => setTag(x)}>
              {x}
            </button>
          ))}
        </div>
      )}

      {!decks.length && (
        <div className="empty-state">
          <Icon name="decks" size={40} />
          <p>{t('decks.empty')}</p>
          <button className="btn primary" onClick={() => setImportOpen(true)}>
            {t('decks.import')}
          </button>
        </div>
      )}

      <div className="deck-list">
        {shown.map((d) => (
          <DeckTile
            key={d.id}
            deck={d}
            metaDecks={metaDecks}
            onClick={() => onOpen(d.id)}
            onLongPress={() => {
              setRenaming(null)
              setActions(d)
            }}
          />
        ))}
      </div>
      {decks.length > 0 && <p className="muted small center">{t('decks.longPressHint')}</p>}

      <Sheet open={!!actions} onClose={() => setActions(null)} title={actions?.name}>
        {actions && (
          <div className="form">
            {renaming === null ? (
              <>
                <button className="btn ghost" onClick={() => setRenaming(actions.name)}>
                  <Icon name="edit" size={16} /> {t('decks.renameAction')}
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    if (!confirm(t('deck.deleteConfirm'))) return
                    setDecks((ds) => ds.filter((x) => x.id !== actions.id))
                    setActions(null)
                  }}
                >
                  <Icon name="trash" size={16} /> {t('deck.delete')}
                </button>
              </>
            ) : (
              <>
                <label>
                  <span>{t('deck.rename')}</span>
                  <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} />
                </label>
                <button
                  className="btn primary"
                  disabled={!renaming.trim()}
                  onClick={() => {
                    const name = renaming.trim()
                    setDecks((ds) => ds.map((x) => (x.id === actions.id ? { ...x, name, updatedAt: new Date().toISOString() } : x)))
                    setActions(null)
                  }}
                >
                  {t('decks.save')}
                </button>
              </>
            )}
          </div>
        )}
      </Sheet>

      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(d) => {
          setDecks((ds) => [d, ...ds])
          onOpen(d.id)
        }}
      />
    </div>
  )
}
