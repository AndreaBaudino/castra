import { useMemo } from 'react'
import { useI18n } from '../i18n'
import { type MetaCommander, type MetaDataset, type MetaEntry, shortName } from '../lib/meta'
import type { Player } from '../lib/circuit'
import { WUBRG } from '../lib/decks'
import { Icon, Pips, pct } from '../components/ui'
import { artUrl, isEvent } from './MetaPages'

// What makes a player's page their own: their picture over their signature commander's art, the badges earned in
// the tournaments, and the colours they play. All computed from the tournament data.

/** The commander a player played most (the latest one on a tie), with how many tournaments. */
export function signatureOf(dataset: MetaDataset, entries: MetaEntry[]) {
  const by = new Map<number, MetaEntry[]>()
  for (const e of entries) if (e.cmd >= 0) by.set(e.cmd, [...(by.get(e.cmd) ?? []), e])
  const last = (list: MetaEntry[]) => list.map((e) => dataset.tournaments[e.t].date ?? '').sort().at(-1) ?? ''
  const best = [...by].sort(([, a], [, b]) => b.length - a.length || last(b).localeCompare(last(a)))[0]
  return best && { cmd: dataset.commanders[best[0]], n: best[1].length }
}

/** The profile picture over the signature commander's art, from its top, fading into the page. */
export function PlayerCover({ signature, children }: { signature?: { cmd: MetaCommander }; children: React.ReactNode }) {
  if (!signature) return <>{children}</>
  return (
    <div className="player-cover">
      <div className="player-cover-art" style={{ backgroundImage: `url("${artUrl(signature.cmd.name)}")` }} />
      {children}
    </div>
  )
}

/** "Most played deck": the signature commander, after the badges; opens its page. */
export function SignatureDeck({
  signature,
  openCommander,
}: {
  signature?: { cmd: MetaCommander; n: number }
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  if (!signature) return null
  const { cmd, n } = signature
  return (
    <button className="card signature" onClick={() => openCommander(cmd.name)}>
      <span className="signature-art" style={{ backgroundImage: `url("${artUrl(cmd.name)}")` }} />
      <span className="signature-text">
        <span className="muted small">{t('player.signature')}</span>
        <span className="name-line">
          <span className="ellipsis">{shortName(cmd.name)}</span>
        </span>
        <span className="sub-line">
          <Pips colors={cmd.colors} size={10} />
          <span className="muted small">{t('meta.nTournaments', { n })}</span>
        </span>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  )
}

interface Badge {
  id: string
  label: string
  gold?: boolean
}

const LOYAL = 10 // tournaments with the same commander
const CHAMELEON = 5 // different commanders
const TRAVELER = 5 // different venues
const FULL_LEAGUE = 4 // a league with at least these stages, all played

export function PlayerBadges({ dataset, entries, player }: { dataset: MetaDataset; entries: MetaEntry[]; player?: Player }) {
  const { t } = useI18n()
  const badges = useMemo(() => {
    const tour = (e: MetaEntry) => dataset.tournaments[e.t]
    const out: Badge[] = []
    const add = (id: string, label: string, gold = false) => out.push({ id, label, gold })
    const eventWins = entries.filter((e) => isEvent(tour(e)) && e.place === 1).length
    const stageWins = entries.filter((e) => !isEvent(tour(e)) && e.place === 1).length
    const top8 = entries.filter((e) => isEvent(tour(e)) && e.place <= 8).length
    if (eventWins) add('eventWins', t('badge.eventWins', { n: eventWins }), true)
    if (stageWins) add('stageWins', t('badge.stageWins', { n: stageWins }), true)
    if (player?.potyInvited) add('poty', t('badge.poty'), true)
    if (top8) add('top8', t('badge.top8', { n: top8 }))
    const unbeaten = entries.filter((e) => e.w != null && e.w - (e.bye ? 1 : 0) > 0 && !e.l).length
    if (unbeaten) add('unbeaten', t('badge.unbeaten', { n: unbeaten }))
    // all the stages of a league, in a season
    const stages = new Map<string, number>()
    for (const x of dataset.tournaments) if (x.kind === 'league') stages.set(`${x.season} ${x.league}`, (stages.get(`${x.season} ${x.league}`) ?? 0) + 1)
    const played = new Map<string, Set<number>>()
    for (const e of entries) {
      const x = tour(e)
      if (x.kind !== 'league') continue
      const k = `${x.season} ${x.league}`
      played.set(k, (played.get(k) ?? new Set()).add(x.stage ?? -1))
    }
    for (const [k, s] of played)
      if ((stages.get(k) ?? 0) >= FULL_LEAGUE && s.size >= stages.get(k)!) {
        const [season, ...league] = k.split(' ')
        add(`full-${k}`, t('badge.fullLeague', { l: `${league.join(' ')} ${season.toUpperCase()}` }))
      }
    const byCmd = new Map<number, number>()
    for (const e of entries) if (e.cmd >= 0) byCmd.set(e.cmd, (byCmd.get(e.cmd) ?? 0) + 1)
    const [loyal, loyalN] = [...byCmd].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0]
    if (loyalN >= LOYAL) add('loyal', t('badge.loyal', { c: shortName(dataset.commanders[loyal].name).split(',')[0] }))
    if (byCmd.size >= CHAMELEON) add('chameleon', t('badge.chameleon', { n: byCmd.size }))
    const venues = new Set(entries.map((e) => tour(e).name)).size
    if (venues >= TRAVELER) add('traveler', t('badge.traveler', { n: venues }))
    return out
  }, [dataset, entries, player, t])
  if (!badges.length) return null
  return (
    <div className="badges">
      {badges.map((b) => (
        <span key={b.id} className={`badge ${b.gold ? 'gold' : ''}`}>
          {b.gold && <Icon name="trophy" size={12} />}
          {b.label}
        </span>
      ))}
    </div>
  )
}

/** How much of each colour the player's decks have: every tournament split among its commander's colours. */
export function PlayerColors({ dataset, entries }: { dataset: MetaDataset; entries: MetaEntry[] }) {
  const { t } = useI18n()
  const shares = useMemo(() => {
    const w: Record<string, number> = {}
    let total = 0
    for (const e of entries) {
      if (e.cmd < 0) continue
      const cs = dataset.commanders[e.cmd].colors.split('').filter((c) => WUBRG.includes(c))
      for (const c of cs.length ? cs : ['C']) w[c] = (w[c] ?? 0) + 1 / (cs.length || 1)
      total++
    }
    return total ? [...WUBRG, 'C'].filter((c) => w[c]).map((c) => ({ c, share: w[c] / total })) : []
  }, [dataset, entries])
  if (!shares.length) return null
  return (
    <section className="card">
      <div className="card-title">{t('player.colors')}</div>
      <div className="color-bar">
        {shares.map(({ c, share }) => (
          <span key={c} className={`pip-${c}`} style={{ flexGrow: share }} />
        ))}
      </div>
      <div className="color-legend">
        {shares.map(({ c, share }) => (
          <span key={c}>
            <Pips colors={c} size={10} /> {pct(share, 0)}
          </span>
        ))}
      </div>
    </section>
  )
}
