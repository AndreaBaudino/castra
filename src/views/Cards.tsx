import { Fragment, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { CardInfo } from '../lib/decks'
import {
  type CardDetails as Details,
  type CardFace,
  type Ruling,
  fetchCardDetails,
  fetchItalian,
  fetchRulings,
  searchCards,
  symbolUrl,
} from '../lib/scryfall'
import { type Errata, RECENT_CARDS_KEY, addRecent, diffWords, fetchErrata } from '../lib/cards'
import { legalityOf, useBanlist } from '../lib/banlist'
import { type MetaDeck, findMetaDeck, winrate } from '../lib/meta'
import { useStoredState } from '../lib/storage'
import { Icon, Sheet, pct, wrClass } from '../components/ui'
import { SubPageShell } from './Circuit'
import { useWide } from '../lib/wide'

// ---------- search ----------

/** Search box, recent searches and results as card images. */
function CardSearch({ onPick, current, autoFocus }: { onPick: (name: string) => void; current?: string; autoFocus?: boolean }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CardInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useStoredState<string[]>(RECENT_CARDS_KEY, [])

  useEffect(() => {
    const ctrl = new AbortController()
    const id = setTimeout(() => {
      setLoading(true)
      searchCards(q, ctrl.signal)
        .then(setResults)
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 300)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [q])

  const pick = (name: string) => {
    setRecent((r) => addRecent(r, name))
    onPick(name)
  }
  const searching = q.trim().length >= 2

  return (
    <>
      <div className="search sticky-search">
        <Icon name="search" size={18} />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cards.search')} enterKeyHint="search" />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label={t('cards.clear')}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {!searching &&
        (recent.length ? (
          <section className="recent-cards">
            <div className="group-title">{t('cards.recent')}</div>
            <div className="chips wrap">
              {recent.map((n) => (
                <button key={n} className={`chip ${n === current ? 'on' : ''}`} onClick={() => pick(n)}>
                  {n}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <p className="muted small">{t('cards.hint')}</p>
        ))}
      {searching && loading && !results.length && <div className="muted small center pad">…</div>}
      {searching && !loading && !results.length && <div className="muted small center pad">{t('cards.noResults')}</div>}
      {searching && (
        <div className="result-grid">
          {results.map((c) => (
            <button key={c.id} className={`result ${c.name === current ? 'on' : ''}`} onClick={() => pick(c.name)}>
              {c.image ? <img src={c.image} alt={c.name} loading="lazy" /> : <span className="card-ph">{c.name}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/** The Cards page: the search (on a desktop, the list beside the open card). */
export function CardsSearchPage({ current, onOpen, onBack }: { current?: string; onOpen: (name: string) => void; onBack: () => void }) {
  const { t } = useI18n()
  const wide = useWide()
  return (
    <div className="page">
      <header className="page-head">
        <div className="head-left">
          {/* not a tab on a phone: back to the home, where the search starts */}
          {!wide && (
            <button className="icon-btn" onClick={onBack} aria-label="back">
              <Icon name="back" />
            </button>
          )}
          <h1>{t('cards.title')}</h1>
        </div>
      </header>
      <CardSearch onPick={onOpen} current={current} autoFocus={!current} />
    </div>
  )
}

/** One card's page, opened from the search. */
export function CardPage({
  name,
  metaDecks,
  onBack,
  openCommander,
}: {
  name: string
  metaDecks: MetaDeck[]
  onBack: () => void
  openCommander: (name: string) => void
}) {
  return (
    <SubPageShell title={name} onBack={onBack}>
      <CardDetails key={name} name={name} metaDecks={metaDecks} openCommander={openCommander} />
    </SubPageShell>
  )
}

/** During a game: search a card and read it without leaving the life counter. */
export function CardLookupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setName(null)
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title={name ?? t('cards.title')}>
      {name ? (
        <>
          <button className="btn ghost full" onClick={() => setName(null)}>
            <Icon name="back" size={16} /> {t('cards.backToSearch')}
          </button>
          <CardDetails key={name} name={name} />
        </>
      ) : (
        <CardSearch onPick={setName} autoFocus />
      )}
    </Sheet>
  )
}

// ---------- the card ----------

/** Card text with Scryfall's mana and tap symbols in place of {T}, {2}{U}… */
function CardText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{[^}]+\})/).map((part, k) =>
        /^\{[^}]+\}$/.test(part) ? (
          <img key={k} className="card-sym" src={symbolUrl(part)} alt={part} loading="lazy" />
        ) : (
          <Fragment key={k}>{part}</Fragment>
        ),
      )}
    </>
  )
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'done'; value: T }

/** Fetches once per card; `null` means there's nothing (no Italian printing, no errata). */
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Load<T> {
  const [res, setRes] = useState<Load<T>>({ state: 'loading' })
  useEffect(() => {
    const ctrl = new AbortController()
    setRes({ state: 'loading' })
    load(ctrl.signal)
      .then((value) => !ctrl.signal.aborted && setRes({ state: 'done', value }))
      .catch(() => !ctrl.signal.aborted && setRes({ state: 'error' }))
    return () => ctrl.abort()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return res
}

const isCommanderCard = (d: Details) =>
  /\blegendary\b.*\b(creature|vehicle|spacecraft)\b/i.test(d.faces[0].typeLine) || d.faces.some((f) => /can be your commander/i.test(f.text))

/** Everything about one card: image, Oracle text (or the Italian one), Centurion legality, errata and rulings. */
export function CardDetails({ name, metaDecks, openCommander }: { name: string; metaDecks?: MetaDeck[]; openCommander?: (name: string) => void }) {
  const { t, lang } = useI18n()
  const card = useLoad((signal) => fetchCardDetails(name, signal), [name])
  useBanlist() // a newer banlist changes the legality
  const details = card.state === 'done' ? card.value : undefined
  const italian = useLoad((signal) => (details ? fetchItalian(details.name, signal).then((v) => v ?? null) : Promise.resolve(null)), [details?.id])
  const errata = useLoad(() => (details ? fetchErrata(details.oracleId) : Promise.resolve(null)), [details?.oracleId])
  const rulings = useLoad((signal) => (details ? fetchRulings(details.id, signal) : Promise.resolve([])), [details?.id])
  const [textLang, setTextLang] = useStoredState<'en' | 'it'>('cc.cards.textLang', lang === 'it' ? 'it' : 'en')
  const [side, setSide] = useState(0)
  const [errataOpen, setErrataOpen] = useState(false)

  if (card.state === 'loading') return <div className="muted small center pad">…</div>
  if (card.state === 'error' || !details) return <div className="notice warn">{t(card.state === 'error' ? 'cards.loadError' : 'cards.notFound')}</div>

  const it = italian.state === 'done' ? italian.value : null
  const showIt = textLang === 'it' && !!it
  // double-faced cards have an image per face; split, adventure and flip cards one for the whole card
  const images = details.faces.map((f) => f.image).filter(Boolean) as string[]
  const image = images.length > 1 ? images[side % images.length] : (details.image ?? images[0])
  const legality = details.notLegal ? 'notLegal' : legalityOf(details.name, details.faces.map((f) => f.typeLine).join(' '))
  const meta = metaDecks && openCommander && isCommanderCard(details) ? findMetaDeck(metaDecks, [details.name]) : undefined

  return (
    <div className="card-view">
      <div className="card-view-img">
        {image && <img src={image} alt={details.name} />}
        {images.length > 1 && (
          <button className="btn small ghost" onClick={() => setSide((s) => s + 1)}>
            <Icon name="swap" size={16} /> {t('cards.flip')}
          </button>
        )}
      </div>

      <div className="card-view-body">
        <div className="chips static">
          <span className={`tag big ${legality === 'legal' ? 'ok-tag' : legality === 'banned' || legality === 'notLegal' ? 'ban-tag' : 'warn'}`}>
            {t(`cards.legality.${legality}`)}
          </span>
        </div>

        <section className="card">
          <div className="card-title">
            {t(showIt ? 'cards.italian' : 'cards.oracle')}
            {it && (
              <span className="seg" role="group" aria-label={t('cards.textLang')}>
                {(['it', 'en'] as const).map((l) => (
                  <button key={l} className={textLang === l ? 'on' : ''} onClick={() => setTextLang(l)}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </span>
            )}
          </div>
          {details.faces.map((f, k) => (
            <FaceText key={k} face={f} italian={showIt ? it[k] : undefined} />
          ))}
          {showIt && <p className="muted small no-margin">{t('cards.itNote')}</p>}
        </section>

        {errata.state === 'done' && errata.value && (
          <ErrataCard errata={errata.value} faces={details.faces} open={errataOpen} setOpen={setErrataOpen} />
        )}

        <RulingsCard rulings={rulings} />

        {meta && (
          <button className="card home-row" onClick={() => openCommander!(meta.name)}>
            <span className="title-live">{t('cards.inMeta')}</span>
            <span className="home-row-link">
              <span className="muted small">{pct(meta.share)}</span>
              <b className={wrClass(winrate(meta))}>{pct(winrate(meta), 0)}</b>
              <Icon name="chevron" size={16} />
            </span>
          </button>
        )}

        <a className="btn ghost" href={details.scryfallUri} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} /> {t('cards.scryfall')}
        </a>
      </div>
    </div>
  )
}

function FaceText({ face, italian }: { face: CardFace; italian?: Pick<CardFace, 'name' | 'typeLine' | 'text'> }) {
  const shown = italian ?? face
  return (
    <div className="card-face">
      <div className="face-head">
        <strong>{shown.name}</strong>
        {face.manaCost && (
          <span className="face-cost">
            <CardText text={face.manaCost} />
          </span>
        )}
      </div>
      <div className="muted small">{shown.typeLine}</div>
      {shown.text && (
        <p className="oracle-text">
          <CardText text={shown.text} />
        </p>
      )}
      {face.stats && <div className="face-stats">{face.stats}</div>}
    </div>
  )
}

const sameType = (a: string, b: string) => a.replace(/[—–-]/g, '-').toLowerCase() === b.replace(/[—–-]/g, '-').toLowerCase()

function ErrataCard({ errata, faces, open, setOpen }: { errata: Errata; faces: CardFace[]; open: boolean; setOpen: (v: boolean) => void }) {
  const { t } = useI18n()
  const year = errata.date.slice(0, 4)
  // each printed face next to today's face of the same name (adventures print both halves in one text)
  const pairs = errata.faces
    .map((p, k) => ({ p, now: faces.find((f) => f.name === p.name) ?? faces[k] }))
    .filter(({ p, now }) => now && (p.text !== now.text || !sameType(p.type, now.typeLine)))
  return (
    <section className={`card collapsible errata-card ${open ? 'open' : ''}`}>
      <button className="collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="card-title">{t('cards.errata')}</span>
        {!open && <span className="muted small ellipsis collapse-sum">{t('cards.errataSum', { set: errata.setName, y: year })}</span>}
        <span className="chev">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <>
          <p className="muted small no-margin">{t('cards.errataNote')}</p>
          {pairs.map(({ p, now }, k) => {
            const text = diffWords(p.text, now!.text)
            const type = !sameType(p.type, now!.typeLine) && diffWords(p.type, now!.typeLine)
            return (
              <div key={k} className="errata-pair">
                {pairs.length > 1 && <strong>{p.name}</strong>}
                <div className="errata-block">
                  <div className="group-title">{t('cards.printed', { set: errata.setName, y: year })}</div>
                  {type && <div className="small">{type.before.map(diffPart('diff-old'))}</div>}
                  <p className="oracle-text">{text.before.map(diffPart('diff-old'))}</p>
                </div>
                <div className="errata-block">
                  <div className="group-title">{t('cards.today')}</div>
                  {type && <div className="small">{type.after.map(diffPart('diff-new'))}</div>}
                  <p className="oracle-text">{text.after.map(diffPart('diff-new'))}</p>
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}

const diffPart = (cls: string) => (part: { text: string; changed?: boolean }, k: number) =>
  part.changed ? (
    <mark key={k} className={cls}>
      <CardText text={part.text} />
    </mark>
  ) : (
    <CardText key={k} text={part.text} />
  )

function RulingsCard({ rulings }: { rulings: Load<Ruling[]> }) {
  const { t, lang } = useI18n()
  const fmt = (d: string) => new Date(d).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <section className="card">
      <div className="card-title">
        {t('cards.rulings')}
        {rulings.state === 'done' && rulings.value.length > 0 && <span className="muted small">{t('cards.rulingsCount', { n: rulings.value.length })}</span>}
      </div>
      {rulings.state === 'loading' && <div className="muted small">…</div>}
      {rulings.state === 'error' && <div className="muted small">{t('cards.rulingsError')}</div>}
      {rulings.state === 'done' &&
        (rulings.value.length ? (
          <ul className="ruling-list">
            {rulings.value.map((r, k) => (
              <li key={k}>
                <span className="muted small">{fmt(r.date)}</span>
                <p>
                  <CardText text={r.text} />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted small">{t('cards.rulingsNone')}</div>
        ))}
    </section>
  )
}
