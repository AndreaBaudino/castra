import { Fragment, useMemo } from 'react'
import { useI18n } from '../i18n'
import { BAN_LISTS, type BanList, banCheck, banCount, cardKey, dismissBanlistChanges, useBanlistChanges } from '../lib/banlist'
import type { Deck } from '../lib/decks'
import { Icon } from '../components/ui'

// On the home, when a new banlist has arrived: what changed since the one the user knew, and their decks that now
// hold a card it bans. Stays until closed, gathering the updates that come in the meantime.

export function BanlistNoticeCard({ decks, openDeck, openCard }: { decks: Deck[]; openDeck: (id: string) => void; openCard: (name: string) => void }) {
  const { t, lang } = useI18n()
  const changes = useBanlistChanges()
  // decks with a card this update bans (as commander or partner too): those that need a change
  const hit = useMemo(() => {
    if (!changes) return []
    const now = new Set(BAN_LISTS.flatMap((k) => changes.added[k]).map(cardKey))
    return decks
      .map((d) => {
        const b = banCheck(d.cards)
        const fresh = [...new Set([...b.banned, ...b.asCommander, ...b.asPartner].filter((n) => now.has(cardKey(n))))]
        return { d, fresh, all: banCount(b) }
      })
      .filter((x) => x.fresh.length)
  }, [changes, decks])
  if (!changes) return null

  const groups = BAN_LISTS.flatMap((k: BanList) => [
    { key: `+${k}`, label: t(`banlist.notice.added.${k}`), cards: changes.added[k], bad: true },
    { key: `-${k}`, label: t(`banlist.notice.removed.${k}`), cards: changes.removed[k], bad: false },
  ]).filter((g) => g.cards.length)
  const day = changes.announcement && new Date(changes.announcement.date).toLocaleDateString(lang, { day: 'numeric', month: 'long' })

  return (
    <section className={`card notice-card ${hit.length ? 'down' : ''}`} role="status">
      <div className="card-title">
        <span className="title-live">
          <Icon name="ban" size={16} /> {day ? t('banlist.notice.titleDay', { d: day }) : t('banlist.notice.title')}
        </span>
        <button className="icon-btn" onClick={dismissBanlistChanges} aria-label="close">
          <Icon name="close" size={18} />
        </button>
      </div>
      <ul className="mini-list ban-notice">
        {groups.map((g) => (
          <li key={g.key}>
            <span className={g.bad ? 'bad-text' : 'good-text'}>{g.label}</span>
            <span>
              {g.cards.map((n, i) => (
                <Fragment key={n}>
                  {i > 0 && ', '}
                  <button className="link-inline" onClick={() => openCard(n)}>
                    {n.split(' // ')[0]}
                  </button>
                </Fragment>
              ))}
            </span>
          </li>
        ))}
        {hit.map(({ d, fresh, all }) => (
          <li key={d.id} className="clickable ban-deck" onClick={() => openDeck(d.id)}>
            <Icon name="decks" size={16} />
            <span className="grow">
              {t('banlist.notice.deck', { d: d.name })}
              <span className="muted small"> · {fresh.map((n) => n.split(' // ')[0]).join(', ')}</span>
              {all > fresh.length && <span className="muted small"> · {t('banlist.notice.deckMore', { n: all })}</span>}
            </span>
            <Icon name="chevron" size={16} />
          </li>
        ))}
      </ul>
      {changes.announcement && (
        <a className="link" href={changes.announcement.url} target="_blank" rel="noopener noreferrer">
          {t('banlist.notice.read')}
        </a>
      )}
    </section>
  )
}
