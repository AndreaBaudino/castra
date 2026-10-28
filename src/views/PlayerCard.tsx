import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type MetaCommander, type MetaDataset, type MetaEntry, shortName } from '../lib/meta'
import type { Player } from '../lib/circuit'
import { type CardInfo, WUBRG } from '../lib/decks'
import { Icon, Pips, Sheet, pct } from '../components/ui'
import { type Claim, type ClaimLook, customizeClaim } from '../lib/claims'
import { searchCards } from '../lib/scryfall'
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

/** A player's commander chosen as favourite on their page, with how many tournaments they played it. */
export function deckOf(dataset: MetaDataset, entries: MetaEntry[], name: string | null | undefined) {
  const cmd = name ? dataset.commanders.find((c) => c.name === name) : undefined
  const n = cmd ? entries.filter((e) => e.cmd === cmd.id).length : 0
  return cmd && n ? { cmd, n } : undefined
}

/** The profile picture over a card's art (the player's choice, or their most played commander), fading into the page. */
export function PlayerCover({ art, children }: { art?: string; children: React.ReactNode }) {
  if (!art) return <>{children}</>
  return (
    <div className="player-cover">
      <div className="player-cover-art" style={{ backgroundImage: `url("${art}")` }} />
      {children}
    </div>
  )
}

/** "Most played deck" (or the favourite the player chose), after the badges; opens its page. */
export function SignatureDeck({
  signature,
  favorite,
  openCommander,
}: {
  signature?: { cmd: MetaCommander; n: number }
  favorite?: boolean
  openCommander: (name: string) => void
}) {
  const { t } = useI18n()
  if (!signature) return null
  const { cmd, n } = signature
  return (
    <button className="card signature" onClick={() => openCommander(cmd.name)}>
      <span className="signature-art" style={{ backgroundImage: `url("${artUrl(cmd.name)}")` }} />
      <span className="signature-text">
        <span className="muted small">{t(favorite ? 'player.favorite' : 'player.signature')}</span>
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

/** The claimer's sheet to choose the art behind their picture and their favourite deck. */
export function CustomizeSheet({
  open,
  onClose,
  playerKey,
  claim,
  dataset,
  entries,
}: {
  open: boolean
  onClose: () => void
  playerKey: string
  claim: Claim
  dataset: MetaDataset | null
  entries: MetaEntry[]
}) {
  const { t } = useI18n()
  const [look, setLook] = useState<ClaimLook>({})
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CardInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (open) setLook({ coverName: claim.coverName, coverArt: claim.coverArt, deck: claim.deck })
    setQ('')
    setResults([])
    setError(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController()
    const id = setTimeout(() => {
      searchCards(q, ctrl.signal)
        .then((r) => setResults(r.filter((c) => c.art).slice(0, 12)))
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [q])

  const commanders = useMemo(() => {
    if (!dataset) return []
    const by = new Map<number, number>()
    for (const e of entries) if (e.cmd >= 0) by.set(e.cmd, (by.get(e.cmd) ?? 0) + 1)
    return [...by].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ cmd: dataset.commanders[id], n }))
  }, [dataset, entries])
  const auto = dataset ? signatureOf(dataset, entries) : undefined
  const preview = look.coverArt ?? (auto && artUrl(auto.cmd.name))

  const save = async () => {
    setBusy(true)
    setError(false)
    try {
      await customizeClaim(playerKey, look)
      onClose()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('player.customize')}>
      <div className="form">
        <div className="group-title">{t('player.coverTitle')}</div>
        {preview && <div className="cover-preview" style={{ backgroundImage: `url("${preview}")` }} />}
        <div className="chips">
          <button className={!look.coverArt ? 'chip on' : 'chip'} onClick={() => setLook({ ...look, coverName: null, coverArt: null })}>
            {t('player.coverAuto')}
          </button>
          {look.coverName && <span className="chip on">{look.coverName}</span>}
        </div>
        <div className="search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('player.coverSearch')} />
        </div>
        {results.length > 0 && (
          <div className="art-grid">
            {results.map((c) => (
              <button
                key={c.id}
                className={`art-pick ${look.coverArt === c.art ? 'on' : ''}`}
                style={{ backgroundImage: `url("${c.art}")` }}
                onClick={() => setLook({ ...look, coverName: c.name, coverArt: c.art })}
                aria-label={c.name}
              >
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {commanders.length > 0 && (
          <>
            <div className="group-title">{t('player.favoriteTitle')}</div>
            <ul className="card-list">
              <li className={`event-row ${!look.deck ? 'on' : ''}`} onClick={() => setLook({ ...look, deck: null })}>
                <span className="ellipsis grow">{t('player.favoriteAuto')}</span>
                {!look.deck && <Icon name="check" size={16} />}
              </li>
              {commanders.map(({ cmd, n }) => (
                <li key={cmd.id} className={`event-row ${look.deck === cmd.name ? 'on' : ''}`} onClick={() => setLook({ ...look, deck: cmd.name })}>
                  <Pips colors={cmd.colors} size={10} />
                  <span className="ellipsis grow">{shortName(cmd.name)}</span>
                  <span className="muted small">{t('meta.nTournaments', { n })}</span>
                  {look.deck === cmd.name && <Icon name="check" size={16} />}
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <div className="notice warn">{t('player.saveError')}</div>}
        <button className="btn primary" disabled={busy} onClick={save}>
          {t('player.save')}
        </button>
      </div>
    </Sheet>
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
