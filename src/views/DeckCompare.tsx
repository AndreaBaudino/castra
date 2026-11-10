import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { Icon, Sheet } from '../components/ui'
import { type Deck, type DeckCard, GROUP_KEY, GROUP_ORDER, TYPE_ICON, compareDecks, deckCover, groupOf, loadShared } from '../lib/decks'
import { summaryOf } from '../lib/analysis'
import { useWide } from '../lib/wide'
import { useCommanderDecks } from '../lib/publicDecks'
import type { Claim } from '../lib/claims'
import { commanderNames } from './Decks'
import { SubPageShell } from './Circuit'

// A deck in the compare route: "<id>" one of mine, "<owner uid>.<id>" someone else's (public or shared by link)
const sameCommanders = (a: Deck, b: Deck) => commanderNames(a).sort().join() === commanderNames(b).sort().join()
const inCommon = (a: Deck, b: Deck) => {
  const d = compareDecks(a, b)
  return [...d.common.map((c) => c.qty), ...d.changed.map((x) => Math.min(x.a, x.b))].reduce((s, n) => s + n, 0)
}

function DeckPick({ name, sub, cover, side, onPick }: { name: string; sub: string; cover?: string | null; side?: string; onPick: () => void }) {
  return (
    <li className="event-row" onClick={onPick}>
      <span className="pub-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
      <div className="event-main">
        <span className="ellipsis">{name}</span>
        <span className="muted small ellipsis">{sub}</span>
      </div>
      {side && <span className="muted small mono">{side}</span>}
    </li>
  )
}

/** "Compare with…": the other decks with the same commander first (mine, then the verified players' public ones), then the rest of mine. */
export function CompareSheet({
  deck,
  decks,
  claims,
  uid,
  withPublic,
  onPick,
  onClose,
}: {
  deck: Deck | null
  decks: Deck[]
  claims: Map<string, Claim>
  uid: string | null
  withPublic: boolean // from one of mine: the public decks too; from someone else's, only mine
  onPick: (ref: string) => void
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
  const { decks: pub } = useCommanderDecks(deck && withPublic ? commanderNames(deck).join(' / ') : '', claims)
  if (!deck) return null
  const others = decks.filter((d) => d.id !== deck.id)
  const same = others.filter((d) => sameCommanders(d, deck))
  const rest = others.filter((d) => !same.includes(d))
  const pubs = withPublic ? pub.filter((p) => p.uid !== uid) : []
  return (
    <Sheet open onClose={onClose} title={t('cmp.pick')}>
      {!others.length && !pubs.length && <p className="muted">{t('cmp.noDecks')}</p>}
      {(same.length > 0 || pubs.length > 0) && (
        <>
          <div className="group-title muted">{t('cmp.same')}</div>
          <ul className="card-list">
            {same.map((d) => (
              <DeckPick key={d.id} name={d.name} sub={`${t('cmp.mine')} · ${day(d.updatedAt)}`} cover={deckCover(d)} side={t('cmp.inCommon', { n: inCommon(deck, d) })} onPick={() => onPick(d.id)} />
            ))}
            {pubs.map((p) => (
              <DeckPick key={p.uid + p.deck} name={p.name} sub={`${claims.get(p.player)?.name ?? p.player} · ${t('cmp.public')}`} cover={p.cover} onPick={() => onPick(`${p.uid}.${p.deck}`)} />
            ))}
          </ul>
        </>
      )}
      {rest.length > 0 && (
        <>
          <div className="group-title muted">{t(same.length || pubs.length ? 'cmp.others' : 'cmp.mineAll')}</div>
          <ul className="card-list">
            {rest.map((d) => (
              <DeckPick key={d.id} name={d.name} sub={`${commanderNames(d).join(' / ') || '—'} · ${day(d.updatedAt)}`} cover={deckCover(d)} onPick={() => onPick(d.id)} />
            ))}
          </ul>
        </>
      )}
      {withPublic && <p className="muted small group-note">{t('cmp.note')}</p>}
    </Sheet>
  )
}

function Groups({ cards, openCard }: { cards: DeckCard[]; openCard: (name: string) => void }) {
  const { t } = useI18n()
  const by = new Map<string, DeckCard[]>()
  for (const c of cards) by.set(groupOf(c), [...(by.get(groupOf(c)) ?? []), c])
  return GROUP_ORDER.filter((g) => by.has(g)).map((g) => {
    const list = by.get(g)!.sort((a, b) => (a.info?.cmc ?? 0) - (b.info?.cmc ?? 0) || a.name.localeCompare(b.name))
    return (
      <section key={g} className="group">
        <div className="group-title cmp-group">
          {TYPE_ICON[g] && <Icon name={TYPE_ICON[g]} size={14} />}
          {t(GROUP_KEY[g])} <span className="muted">{list.reduce((s, c) => s + c.qty, 0)}</span>
        </div>
        <ul className="card-list">
          {list.map((c) => (
            <li key={c.name} className="card-row">
              <button className="card-row-main" onClick={() => openCard(c.name)}>
                <span className="qty">{c.qty}</span>
                <span className="ellipsis">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  })
}

/** Two decks side by side: the cards only in one, the ones in both (those in a different number first). */
export default function DeckCompare({
  refs,
  decks,
  authorOf,
  onBack,
  onSwap,
  openCard,
}: {
  refs: string[]
  decks: Deck[]
  authorOf: (uid: string, name?: string) => { name: string } | undefined
  onBack: () => void
  onSwap: () => void
  openCard: (name: string) => void
}) {
  const { t, lang } = useI18n()
  const wide = useWide()
  const [tab, setTab] = useState<'a' | 'b' | 'common'>('a')
  // someone else's deck, read once: undefined while loading, null when gone or private
  const [loaded, setLoaded] = useState<Record<string, Deck | null>>({})
  useEffect(() => {
    for (const r of refs)
      if (r.includes('.') && !(r in loaded)) {
        const [owner, id] = r.split('.')
        loadShared(owner, id).then(
          (d) => setLoaded((l) => ({ ...l, [r]: d })),
          () => setLoaded((l) => ({ ...l, [r]: null })),
        )
      }
  }, [refs.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const pair = refs.map((r) => (r.includes('.') ? loaded[r] : (decks.find((d) => d.id === r) ?? null)))
  const [a, b] = pair
  const diff = useMemo(() => (a && b ? compareDecks(a, b) : null), [a, b])
  if (!a || !b || !diff)
    return (
      <SubPageShell title={t('cmp.title')} onBack={onBack}>
        {pair.some((d) => d === null) && (
          <div className="empty-state">
            <Icon name="decks" size={40} />
            <p>{t('deck.missing')}</p>
          </div>
        )}
      </SubPageShell>
    )

  const sum = (cs: DeckCard[]) => cs.reduce((s, c) => s + c.qty, 0)
  const nA = sum(diff.onlyA)
  const nB = sum(diff.onlyB)
  const nC = sum(diff.common) + diff.changed.reduce((s, x) => s + Math.min(x.a, x.b), 0)
  const [sa, sb] = [summaryOf(a), summaryOf(b)]
  const num = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 2 })
  const chip = (d: Deck, side: 'A' | 'B', ref: string) => (
    <div className="cmp-deck">
      <span className={`cmp-badge ${side.toLowerCase()}`}>{side}</span>
      <span className="pub-cover" style={deckCover(d) ? { backgroundImage: `url(${deckCover(d)})` } : undefined} />
      <div className="event-main">
        <span className="ellipsis strong">{d.name}</span>
        <span className="muted small ellipsis">{ref.includes('.') ? (authorOf(ref.split('.')[0], d.author)?.name ?? '') : t('cmp.mine')}</span>
      </div>
    </div>
  )
  const changed = new Map(diff.changed.map((x) => [x.card.name, x]))
  const common = (
    <>
      {diff.changed.length > 0 && (
        <section className="group">
          <div className="group-title">
            {t('cmp.changed')} <span className="muted">{diff.changed.length}</span>
          </div>
          <ul className="card-list">
            {diff.changed.map(({ card, a, b }) => (
              <li key={card.name} className="card-row">
                <button className="card-row-main" onClick={() => openCard(card.name)}>
                  <span className="ellipsis">{card.name}</span>
                  <span className="mono small muted">
                    {a} → <b className="cmp-to">{b}</b>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Groups cards={diff.common.filter((c) => !changed.has(c.name))} openCard={openCard} />
    </>
  )
  const head = (side: 'A' | 'B', n: number) => (
    <div className="cmp-col-head">
      <span className={`cmp-badge ${side.toLowerCase()}`}>{side}</span>
      {t(side === 'A' ? 'cmp.onlyA' : 'cmp.onlyB')} <span className="muted">{n}</span>
    </div>
  )

  return (
    <SubPageShell title={t('cmp.title')} onBack={onBack}>
      {/* the two decks and the tabs stay under the bar: which side the cards are is always in sight */}
      <div className="cmp-top">
        <div className="cmp-decks">
          {chip(a, 'A', refs[0])}
          <button className="icon-btn" onClick={onSwap} aria-label={t('cmp.swap')} title={t('cmp.swap')}>
            <Icon name="swap" size={18} />
          </button>
          {chip(b, 'B', refs[1])}
        </div>
        <div className="cmp-sum muted small">
          <span>{t('cmp.inCommon', { n: nC })}</span>
          <span>{t('cmp.sumA', { n: nA })}</span>
          <span>{t('cmp.sumB', { n: nB })}</span>
        </div>
        {!wide && (
          <div className="seg wide">
            {(
              [
                ['a', 'cmp.onlyA', nA],
                ['b', 'cmp.onlyB', nB],
                ['common', 'cmp.common', nC],
              ] as const
            ).map(([k, key, n]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {t(key)} <span className="muted">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {wide ? (
        <>
          <div className="cmp-cols">
            <div className="cmp-col">
              {head('A', nA)}
              <Groups cards={diff.onlyA} openCard={openCard} />
            </div>
            <div className="cmp-col">
              {head('B', nB)}
              <Groups cards={diff.onlyB} openCard={openCard} />
            </div>
          </div>
          <div className="cmp-col-head">
            {t('cmp.common')} <span className="muted">{nC}</span>
          </div>
          <div className="deck-groups list">{common}</div>
        </>
      ) : (
        <>
          {tab === 'common' ? common : <Groups cards={tab === 'a' ? diff.onlyA : diff.onlyB} openCard={openCard} />}
        </>
      )}
      <div className="deck-bar">
        <div className="deck-bar-info cmp-bar">
          <span>
            <span className="muted">{t('cmp.avg')}</span> <span className="mono">{num(sa.avgNoLands)} → <b>{num(sb.avgNoLands)}</b></span>
          </span>
          <span>
            <span className="muted">{t('cmp.lands')}</span> <span className="mono">{sa.lands} → <b>{sb.lands}</b></span>
          </span>
        </div>
      </div>
    </SubPageShell>
  )
}
