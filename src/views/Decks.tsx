import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type Deck, checkDeck, isValid, newId, parseDecklist, sortColors } from '../lib/decks'
import { type MetaDeck, findMetaDeck, normName, winrate } from '../lib/meta'
import { fetchCollection } from '../lib/scryfall'
import { Icon, Pips, Sheet, pct, wrClass } from '../components/ui'

export function commanderNames(deck: Deck) {
  return deck.cards.filter((c) => c.section === 'commander').map((c) => c.name)
}

export function DeckTile({ deck, metaDecks, onClick }: { deck: Deck; metaDecks: MetaDeck[]; onClick: () => void }) {
  const { t } = useI18n()
  const check = checkDeck(deck)
  const art = check.commanders[0]?.info?.art
  const m = findMetaDeck(metaDecks, commanderNames(deck))
  return (
    <button className="deck-tile" onClick={onClick}>
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
      const { found, notFound } = await fetchCollection(cards.map((c) => c.name))
      for (const c of cards) {
        const info = found.get(c.name.toLowerCase())
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
          for (const l of last) {
            const c = cards.find((x) => normName(x.name) === normName(found.get(l.name.toLowerCase())?.name ?? l.name))
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
          <DeckTile key={d.id} deck={d} metaDecks={metaDecks} onClick={() => onOpen(d.id)} />
        ))}
      </div>

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
