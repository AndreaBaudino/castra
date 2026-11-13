import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { Icon, Sheet } from '../components/ui'
import { RankIcon, RankMedal, RankTag } from '../components/Rank'
import {
  BASE,
  type PlayerElo,
  type Rank,
  PODIUM,
  TIERS,
  matchMoves,
  nextStep,
  rankOf,
  rankOfPlayer,
  useElo,
  useRankName,
  winChance,
} from '../lib/elo'
import type { MetaDataset } from '../lib/meta'
import { playerKey } from '../lib/circuit'
import { useStoredState } from '../lib/storage'
import { type CircuitPrefs, placeLabel, SubPageShell, VerifiedTick } from './Circuit'
import { dateLabel, tournamentLabel } from './MetaPages'

// The Elo of docs/elo.md: its ranking in the circuit's rankings, the ranks page, the player's card, the head to head,
// the explanation and the promotion.

const fmt1 = (n: number, lang: string) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const sign = (n: number) => (n > 0 ? 'good-text' : n < 0 ? 'bad-text' : 'muted')

type Elo = NonNullable<ReturnType<typeof useElo>>

function Delta({ n }: { n: number }) {
  const r = Math.round(n)
  return <small className={`elo-delta ${sign(r)}`}>{r > 0 ? `▲ ${r}` : r < 0 ? `▼ ${-r}` : '='}</small>
}

// ---------- the ranking ----------

export function EloRanking({ dataset, prefs, openPlayer, openRanks }: { dataset: MetaDataset | null; prefs: CircuitPrefs; openPlayer: (key: string) => void; openRanks: () => void }) {
  const { t, lang } = useI18n()
  const elo = useElo(dataset)
  const [q, setQ] = useState('')
  const [league, setLeague] = useStoredState('cc.elo.league', '')
  const [onlyFollowed, setOnlyFollowed] = useState(false)
  const [info, setInfo] = useState(false)
  if (!elo) return <p className="empty">{t('elo.none')}</p>
  const leagues = [...new Set([...elo.players.values()].map((p) => p.league).filter(Boolean) as string[])].sort()
  const nq = playerKey(q)
  const keep = (p: PlayerElo) =>
    (!nq || p.key.includes(nq)) && (!league || p.league === league) && (!onlyFollowed || prefs.follow.includes(p.key) || p.key === prefs.me)
  const row = (p: PlayerElo, pos?: number) => {
    const rank = rankOfPlayer(p, elo.ranked)
    return (
      <li key={p.key} className={`meta-row player-row ${p.key === prefs.me ? 'me' : ''}`} onClick={() => openPlayer(p.key)}>
        <div className="meta-main">
          {pos != null && <span className="rank wide">{pos}</span>}
          <div className="meta-name">
            <div className="name-line">
              <span className="ellipsis">{p.name}</span>
              {prefs.claims.get(p.key)?.verified && <VerifiedTick />}
              {p.key === prefs.me && <span className="tag me-tag">{t('circuit.you')}</span>}
            </div>
            <div className="sub-line">
              {rank && <RankTag rank={rank} grey={p.status === 'inactive'} />}
              {p.league && <span className="muted small">· {p.league}</span>}
              <span className="muted small">
                ·{' '}
                {p.status === 'inactive'
                  ? t('elo.lastTournament', { d: dateLabel(p.steps[p.steps.length - 1].t, lang, t) })
                  : t(p.games === 1 ? 'elo.oneGame' : 'elo.nGames', { n: p.games })}
              </span>
            </div>
          </div>
          <span className={`pts elo-pts ${p.status === 'inactive' ? 'muted' : ''}`}>
            <b>{Math.round(p.elo)}</b>
            {p.status === 'inactive' ? (
              p.idle > 0 && <small className="elo-delta bad-text">{t('elo.pause', { n: Math.round(p.idle) })}</small>
            ) : p.status === 'provisional' ? (
              <small className="muted">{t('elo.provisionalTag')}</small>
            ) : (
              <Delta n={p.d30} />
            )}
          </span>
        </div>
      </li>
    )
  }
  const ranked = elo.ranked.filter(keep)
  const provisional = elo.provisional.filter(keep)
  const inactive = elo.inactive.filter(keep)
  return (
    <>
      <div className="elo-head">
        <p className="muted small">{t('elo.intro', { y: dataset!.year })}</p>
        <button className="link-btn small" onClick={() => setInfo(true)}>
          <Icon name="info" size={14} /> {t('elo.howItWorks')}
        </button>
      </div>
      <div className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('circuit.searchPlayer')} />
      </div>
      <div className="filters wrap">
        <select className="select-pill" value={league} onChange={(e) => setLeague(e.target.value)} aria-label={t('circuit.league')}>
          <option value="">{t('circuit.allLeagues')}</option>
          {leagues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button className={`chip ${onlyFollowed ? 'on' : ''}`} onClick={() => setOnlyFollowed(!onlyFollowed)}>
          <Icon name="star" size={13} /> {t('circuit.followed')}
        </button>
        <button className="chip" onClick={openRanks}>
          <RankIcon rank={{ tier: 'centurione', div: 0 }} size={13} /> {t('elo.ranks')}
        </button>
      </div>
      <ol className="meta-list">
        {ranked.map((p) => row(p, elo.ranked.indexOf(p) + 1))}
        {!ranked.length && <li className="empty">{t('meta.noResults')}</li>}
      </ol>
      {provisional.length > 0 && (
        <>
          <div className="group-title">{t('elo.provisional', { n: provisional.length })}</div>
          <p className="muted small">{t('elo.provisionalNote')}</p>
          <ol className="meta-list">{provisional.map((p) => row(p))}</ol>
        </>
      )}
      {inactive.length > 0 && (
        <>
          <div className="group-title">{t('elo.inactive', { n: inactive.length })}</div>
          <p className="muted small">{t('elo.inactiveNote')}</p>
          <ol className="meta-list">{inactive.map((p) => row(p))}</ol>
        </>
      )}
      <EloInfo open={info} onClose={() => setInfo(false)} elo={elo} />
    </>
  )
}

// ---------- the ranks ----------

export function RankPage({ dataset, prefs, onBack, openPlayer }: { dataset: MetaDataset | null; prefs: CircuitPrefs; onBack: () => void; openPlayer: (key: string) => void }) {
  const { t } = useI18n()
  const elo = useElo(dataset)
  const name = useRankName()
  const me = elo && prefs.me ? elo.players.get(prefs.me) : undefined
  const myRank = me && elo ? rankOfPlayer(me, elo.ranked) : null
  const count = (tier: string) => elo?.ranked.filter((p, i) => i >= 3 && rankOf(p.elo).tier === tier).length ?? 0
  const ladder = [...TIERS].reverse()
  return (
    <SubPageShell title={t('elo.ranks')} onBack={onBack}>
      <p className="muted">{t('elo.rankIntro')}</p>
      <div className="group-title">{t('elo.podium')}</div>
      <div className="rank-podium">
        {PODIUM.map((tier, i) => {
          const p = elo?.ranked[i]
          return (
            <button key={tier} className={`card rank-podium-card rank-${tier}`} disabled={!p} onClick={() => p && openPlayer(p.key)}>
              <RankMedal rank={{ tier, div: 0 }} size={112} />
              <span className="rank-tag">{`${i + 1}º · ${name({ tier, div: 0 })}`}</span>
              <b className="ellipsis">{p?.name ?? '—'}</b>
              <span className="muted small mono">{p ? Math.round(p.elo) : ''}</span>
            </button>
          )
        })}
      </div>
      <div className="group-title">{t('elo.ladder')}</div>
      <ul className="card-list rank-ladder">
        {ladder.map((tier) => {
          const i = TIERS.indexOf(tier)
          const mine = myRank?.tier === tier
          const base = 700 + 100 * i
          return (
            <li key={tier} className={mine ? 'me' : ''}>
              <RankMedal rank={{ tier, div: mine ? myRank!.div : 0 }} size={84} />
              <div className="rank-ladder-text">
                <b className={`rank-${tier}`}>
                  {name({ tier, div: 0 })} {mine && <span className="tag me-tag">{t('circuit.you')}</span>}
                </b>
                <span className="mono small">{tier === 'primipilo' ? t('elo.from', { n: 1200 }) : tier === 'tirone' ? t('elo.below', { n: 800 }) : `${base} – ${base + 99}`}</span>
                <span className="muted small">
                  {tier === 'primipilo'
                    ? t('elo.noDivisions')
                    : tier === 'tirone'
                      ? `I < 733 · II 733 · III 767`
                      : `I ${base} · II ${base + 33} · III ${base + 67}${base === BASE ? ` · ${t('elo.start')}` : ''}`}
                </span>
              </div>
              <span className="mono">{count(tier)}</span>
            </li>
          )
        })}
      </ul>
      <p className="muted small">{t('elo.rankNoteProvisional')}</p>
      <p className="muted small">{t('elo.rankNoteInactive')}</p>
      <p className="muted small">{t('elo.rankNotePodium')}</p>
    </SubPageShell>
  )
}

// ---------- the explanation ----------

export function EloInfo({ open, onClose, elo }: { open: boolean; onClose: () => void; elo: Elo }) {
  const { t } = useI18n()
  // where who arrives today starts: one player in four from the bottom
  const all = [...elo.players.values()].map((p) => p.elo).sort((a, b) => a - b)
  const p25 = Math.round(all[Math.floor((all.length - 1) / 4)] ?? BASE)
  const item = (icon: string, k: 'vs' | 'tournaments' | 'margin' | 'league' | 'rank') => (
    <div className="elo-info-item">
      <Icon name={icon} size={18} />
      <span>
        <b>{t(`elo.info.${k}.title`)}</b> {t(`elo.info.${k}`)}
      </span>
    </div>
  )
  return (
    <Sheet open={open} onClose={onClose} title={t('elo.howItWorks')}>
      <p>{t('elo.info.lead', { n: p25 })}</p>
      {item('stats', 'vs')}
      {item('calendar', 'tournaments')}
      {item('history', 'margin')}
      {item('map', 'league')}
      {item('shield', 'rank')}
    </Sheet>
  )
}

// ---------- the player's card ----------

/** The rank's armour around the avatar on the player's card, animated. */
export function ArmouredAvatar({ rank, grey, children }: { rank: Rank; grey?: boolean; children: React.ReactNode }) {
  const name = useRankName()
  return (
    <span className="armoured">
      <RankMedal rank={rank} size={214} animated={!grey} grey={grey} label={name(rank)} />
      {children}
    </span>
  )
}

export function EloCard({
  dataset,
  playerKey: key,
  prefs,
  openRanks,
  openTournament,
}: {
  dataset: MetaDataset
  playerKey: string
  prefs: CircuitPrefs
  openRanks: () => void
  openTournament: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const elo = useElo(dataset)
  const name = useRankName()
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [info, setInfo] = useState(false)
  const p = elo?.players.get(key)
  if (!elo || !p) return null
  const rank = rankOfPlayer(p, elo.ranked)
  const next = rank && p.status !== 'inactive' && !PODIUM.includes(rank.tier) ? nextStep(p.elo) : null
  const pos = elo.ranked.indexOf(p)
  const steps = [...p.steps].reverse()
  const shown = all ? steps : steps.slice(0, 4)
  return (
    <section className="card elo-card">
      <div className="card-title">
        {t('elo.title')}
        <button className="icon-btn" onClick={() => setInfo(true)} aria-label={t('elo.howItWorks')}>
          <Icon name="info" size={17} />
        </button>
      </div>
      <div className="elo-big">
        <b>{Math.round(p.elo)}</b>
        <Delta n={p.d30} />
        <span className="muted small">{t('elo.in30')}</span>
      </div>
      {rank ? (
        <button className="elo-rank-line" onClick={openRanks}>
          <span className="elo-rank-row">
            <RankTag rank={rank} grey={p.status === 'inactive'} />
            {next && <span className="muted small">{t('elo.toNext', { n: next.points, r: name(next.rank) })}</span>}
          </span>
          {next && (
            <span className="elo-bar">
              <span className={`rank-bg-${rank.tier}`} style={{ width: `${Math.round(next.done * 100)}%` }} />
            </span>
          )}
        </button>
      ) : (
        <p className="muted small">{t('elo.provisionalCard')}</p>
      )}
      {p.status === 'inactive' && <p className="muted small">{t('elo.inactiveCard', { n: Math.round(p.idle) })}</p>}
      <div className="stats3 compact">
        <div>
          <div className="stat-num">{pos >= 0 ? placeLabel(pos + 1, lang) : '—'}</div>
          <div className="stat-label">{pos >= 0 ? t('elo.of', { n: elo.ranked.length }) : t(p.status === 'inactive' ? 'elo.inactiveTag' : 'elo.provisionalTag')}</div>
        </div>
        <div>
          <div className="stat-num">{p.games}</div>
          <div className="stat-label">{t('elo.games')}</div>
        </div>
        <div>
          <div className="stat-num">±{Math.round(p.rd)}</div>
          <div className="stat-label">{t('elo.margin')}</div>
        </div>
      </div>
      <EloChart p={p} />
      <div className="card-title">{t('elo.tournaments')}</div>
      <ul className="elo-steps">
        {shown.map((s) => {
          const total = s.move + s.league - s.idle
          const matches = dataset.playerMatches.filter((m) => m.t === s.t.index && (m.a === s.entry || m.b === s.entry) && m.move)
          const e = dataset.entries[s.entry]
          return (
            <li key={s.entry}>
              <button className="elo-step" onClick={() => (matches.length ? setOpen(open === s.entry ? null : s.entry) : openTournament(s.t.id))}>
                <span className="elo-step-main">
                  <b>{tournamentLabel(s.t, t)}</b>
                  {matches.length > 0 && <span className="tag castra-tag">Castra</span>}
                  <span className="muted small">
                    {dateLabel(s.t, lang, t)} · {t('elo.placeOf', { p: placeLabel(e.place, lang), n: s.t.players })}
                  </span>
                  {(Math.abs(s.league) >= 0.05 || s.idle > 0) && (
                    <span className="muted small">
                      {t('elo.part.tournament')} <span className={sign(s.move)}>{fmt1(s.move, lang)}</span>
                      {Math.abs(s.league) >= 0.05 && (
                        <>
                          {' '}· {t('elo.part.league')} <span className={sign(s.league)}>{fmt1(s.league, lang)}</span>
                        </>
                      )}
                      {s.idle > 0 && (
                        <>
                          {' '}· {t('elo.part.pause')} <span className="bad-text">{fmt1(-s.idle, lang)}</span>
                        </>
                      )}
                    </span>
                  )}
                  {s.rankChange && (
                    <span className={`elo-change ${s.rankChange.up ? `rank-${s.rankChange.to.tier}` : 'grey'}`}>
                      <RankIcon rank={s.rankChange.to} size={14} grey={!s.rankChange.up} />
                      {t(s.rankChange.up ? (key === prefs.me ? 'elo.upMe' : 'elo.up') : 'elo.down', { r: name(s.rankChange.to) })}
                    </span>
                  )}
                </span>
                <span className={`mono ${sign(total)}`}>{fmt1(total, lang)}</span>
                <span className="mono">{Math.round(s.after)}</span>
              </button>
              {open === s.entry && (
                <ul className="elo-matches">
                  {matches.map((m) => {
                    const mineA = m.a === s.entry
                    const opp = dataset.entries[mineA ? m.b : m.a]
                    const oppRow = dataset.elo!.rows[mineA ? m.b : m.a]
                    const [w, l] = mineA ? [m.wa, m.wb] : [m.wb, m.wa]
                    const mv = m.move![mineA ? 0 : 1]
                    return (
                      <li key={`${m.a}-${m.b}-${m.round}`}>
                        <span className="muted mono small">T{m.round}</span>
                        <span className="ellipsis">
                          {opp.player} <span className="muted mono small">{oppRow ? Math.round(oppRow.start) : ''}</span>
                        </span>
                        <span className="mono small">{`${w > l ? 'V' : w < l ? 'S' : 'P'} ${w}-${l}`}</span>
                        <span className={`mono ${sign(mv)}`}>{fmt1(mv, lang)}</span>
                      </li>
                    )
                  })}
                  <li className="muted small">{t('elo.startedFrom', { n: Math.round(s.start) })}</li>
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {steps.length > 4 && (
        <button className="link-btn small" onClick={() => setAll(!all)}>
          {t(all ? 'elo.fewer' : 'elo.allTournaments', { n: steps.length })}
        </button>
      )}
      <p className="muted small">{t('elo.howCounted')}</p>
      <EloInfo open={info} onClose={() => setInfo(false)} elo={elo} />
    </section>
  )
}

/** A phone's circuit tab: the Elo in one line, the whole card is in its own tab. */
export function EloLine({ dataset, playerKey: key, onOpen }: { dataset: MetaDataset; playerKey: string; onOpen: () => void }) {
  const { t } = useI18n()
  const elo = useElo(dataset)
  const p = elo?.players.get(key)
  if (!elo || !p) return null
  const rank = rankOfPlayer(p, elo.ranked)
  return (
    <section className="card">
      <button className="elo-line" onClick={onOpen}>
        <span className="elo-big">
          <span className="muted">{t('elo.title')}</span>
          <b>{Math.round(p.elo)}</b>
          <Delta n={p.d30} />
        </span>
        {rank && <RankTag rank={rank} grey={p.status === 'inactive'} />}
        <Icon name="chevron" size={18} />
      </button>
    </section>
  )
}

function EloChart({ p }: { p: PlayerElo }) {
  const { lang } = useI18n()
  if (p.steps.length < 2) return null
  const pts = [{ day: `${p.steps[0].day.slice(0, 4)}-01-01`, v: p.steps[0].start }, ...p.steps.map((s) => ({ day: s.day, v: s.after }))]
  const W = 320, H = 110, L = 34, T = 8, B = 96
  const y0 = Date.parse(`${pts[0].day.slice(0, 4)}-01-01`)
  const x = (d: string) => L + ((Date.parse(d) - y0) / (365 * 864e5)) * (W - L - 4)
  const lo = Math.floor(Math.min(...pts.map((q) => q.v)) / 100) * 100
  const hi = Math.ceil(Math.max(...pts.map((q) => q.v)) / 100) * 100 || lo + 100
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T)
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.day).toFixed(1)},${y(q.v).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const grid = []
  for (let v = lo; v <= hi; v += 100) grid.push(v)
  return (
    <svg className="elo-chart" viewBox={`0 0 ${W} ${H + 12}`} role="img" aria-label={`Elo ${Math.round(pts[0].v)} → ${Math.round(last.v)}`}>
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" className="axis">
            {v}
          </text>
        </g>
      ))}
      <path d={`${line} L${x(last.day).toFixed(1)},${B} L${L},${B} Z`} className="area" />
      <path d={line} className="line" />
      <circle cx={x(last.day)} cy={y(last.v)} r={3.5} className="dot" />
      {[0, 3, 6, 9].map((m) => (
        <text key={m} x={x(`${pts[0].day.slice(0, 4)}-${String(m + 1).padStart(2, '0')}-01`)} y={H + 8} className="axis">
          {new Date(2000, m, 1).toLocaleDateString(lang, { month: 'short' })}
        </text>
      ))}
    </svg>
  )
}

// ---------- the head to head ----------

export function EloCompare({ dataset, a, b, nameA, nameB }: { dataset: MetaDataset | null; a: string; b: string; nameA: string; nameB: string }) {
  const { t, lang } = useI18n()
  const elo = useElo(dataset)
  const pa = elo?.players.get(a)
  const pb = elo?.players.get(b)
  if (!elo || !pa || !pb) return null
  const chance = winChance(pa, pb)
  const [aw, al] = matchMoves(pa, pb)
  const [bw, bl] = matchMoves(pb, pa)
  const first = (n: string) => n.split(' ').slice(-1)[0]
  const pctA = Math.round(chance * 100)
  return (
    <section className="card elo-compare">
      <div className="card-title">{t('elo.ifMet')}</div>
      <div className="elo-odds mono">
        <span className="cmp-a">{pctA}%</span>
        <span className="cmp-b">{100 - pctA}%</span>
      </div>
      <div className="elo-odds-bar">
        <span className="cmp-a-bg" style={{ width: `${pctA}%` }} />
        <span className="cmp-b-bg" />
      </div>
      <p className="small">
        {t('elo.chance', {
          a: first(chance >= 0.5 ? nameA : nameB),
          b: first(chance >= 0.5 ? nameB : nameA),
          n: Math.max(pctA, 100 - pctA),
          d: Math.round(Math.abs(pa.elo - pb.elo)),
        })}
      </p>
      <div className="elo-moves">
        <span>{t('elo.ifWins', { name: first(nameA) })}</span>
        <span className="mono good-text">{fmt1(aw, lang)}</span>
        <span className="mono bad-text">{fmt1(bl, lang)}</span>
        <span>{t('elo.ifWins', { name: first(nameB) })}</span>
        <span className="mono bad-text">{fmt1(al, lang)}</span>
        <span className="mono good-text">{fmt1(bw, lang)}</span>
      </div>
      <p className="muted small">{t('elo.perStage', { a: first(nameA), b: first(nameB) })}</p>
    </section>
  )
}

/** The Elo's rows of the head-to-head table: the Elo, the rank, the margin. */
export function EloCompareRows({ dataset, a, b }: { dataset: MetaDataset | null; a: string; b: string }) {
  const { t } = useI18n()
  const elo = useElo(dataset)
  const pa = elo?.players.get(a)
  const pb = elo?.players.get(b)
  if (!elo || !pa || !pb) return null
  const ra = rankOfPlayer(pa, elo.ranked)
  const rb = rankOfPlayer(pb, elo.ranked)
  return (
    <>
      <div className="h2h-row">
        <b className={pa.elo > pb.elo ? 'win side-a' : ''}>{Math.round(pa.elo)}</b>
        <span className="muted small">Elo</span>
        <b className={pb.elo > pa.elo ? 'win side-b' : ''}>{Math.round(pb.elo)}</b>
      </div>
      <div className="h2h-row">
        <span>{ra ? <RankTag rank={ra} grey={pa.status === 'inactive'} /> : '—'}</span>
        <span className="muted small">{t('elo.rank')}</span>
        <span>{rb ? <RankTag rank={rb} grey={pb.status === 'inactive'} /> : '—'}</span>
      </div>
      <div className="h2h-row">
        <b>±{Math.round(pa.rd)}</b>
        <span className="muted small">{t('elo.marginElo')}</span>
        <b>±{Math.round(pb.rd)}</b>
      </div>
    </>
  )
}

// ---------- the promotion ----------

/**
 * Once, the first time the app opens after the night that brought the linked player up a rank or a division: the new
 * medal, the tournament that did it, the points to the next step. Remembers the last rank seen in cc.elo.seen.
 */
export function Promotion({ dataset, me, openRanks }: { dataset: MetaDataset | null; me: string | null; openRanks: () => void }) {
  const { t, lang } = useI18n()
  const elo = useElo(dataset)
  const name = useRankName()
  const [seen, setSeen] = useStoredState<string | null>('cc.elo.seen', null)
  const p = me ? elo?.players.get(me) : undefined
  const rank = p && elo ? rankOfPlayer(p, elo.ranked) : null
  const id = rank && p ? `${dataset!.year}:${rank.tier}:${rank.div}` : null
  const last = p?.steps[p.steps.length - 1]
  // only a step up at the latest tournament, and never the first time ever (nothing to compare with)
  const show = !!id && seen !== null && seen !== id && !!last?.rankChange?.up && p!.status === 'ranked'
  const close = () => setSeen(id)
  // the first time: nothing to compare with, the rank is just remembered
  useEffect(() => {
    if (id && seen === null) setSeen(id)
  }, [id, seen, setSeen])
  if (!show || !rank || !last) return null
  const next = nextStep(p!.elo)
  return (
    <Sheet open onClose={close}>
      <div className={`promotion rank-${rank.tier}`}>
        <span className="group-title">{t('elo.promo.kicker')}</span>
        <RankMedal rank={rank} size={260} animated label={name(rank)} />
        <h2>
          {t('elo.promo.title')} <span className={`rank-${rank.tier}`}>{name(rank)}</span>
        </h2>
        <p>
          {t('elo.promo.thanks', { t: tournamentLabel(last.t, t), p: placeLabel(dataset!.entries[last.entry].place, lang), m: fmt1(last.move, lang) })}{' '}
          <b>{t('elo.promo.honor', { r: name(rank) })}</b>
        </p>
        {next && (
          <div className="card">
            <span className="elo-rank-row">
              <span>
                Elo <b className="mono">{Math.round(p!.elo)}</b>
              </span>
              <span className="muted small">{t('elo.toNext', { n: next.points, r: name(next.rank) })}</span>
            </span>
            <span className="elo-bar">
              <span className={`rank-bg-${rank.tier}`} style={{ width: `${Math.round(next.done * 100)}%` }} />
            </span>
          </div>
        )}
        <button className="btn primary" onClick={close}>
          {t('elo.promo.continue')}
        </button>
        <button
          className="link-btn"
          onClick={() => {
            close()
            openRanks()
          }}
        >
          {t('elo.seeRanks')}
        </button>
      </div>
    </Sheet>
  )
}
