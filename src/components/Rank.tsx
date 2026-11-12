import { lazy, Suspense } from 'react'
import { RANK_ICONS } from '../lib/rankIcons'
import { type Rank, type Tier, useRankName } from '../lib/elo'

// The ranks of docs/elo.md: the icon (everywhere) and the name; the medal is heavier and loads only where it shows.

const ICON: Record<Tier, keyof typeof RANK_ICONS> = {
  tirone: 'Tirone',
  legionario: 'Legionario',
  decano: 'Decano',
  optio: 'Optio',
  centurione: 'Centurione',
  primipilo: 'Primipilo',
  imperatore: 'Podio',
  legato: 'Podio',
  tribuno: 'Podio',
}

/** The rank's icon in its colour (grey for the inactive). */
export function RankIcon({ rank, size = 16, grey }: { rank: Rank; size?: number; grey?: boolean }) {
  return (
    <svg className={`rank-icon ${grey ? 'grey' : `rank-${rank.tier}`}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor" d={RANK_ICONS[ICON[rank.tier]]} />
    </svg>
  )
}

/** Icon and name of a rank, in its colour. */
export function RankTag({ rank, grey }: { rank: Rank; grey?: boolean }) {
  const name = useRankName()
  return (
    <span className={`rank-tag ${grey ? 'grey' : `rank-${rank.tier}`}`}>
      <RankIcon rank={rank} grey={grey} size={14} />
      {name(rank)}
    </span>
  )
}

const MedalArt = lazy(() => import('./RankMedal'))

/** The rank's medal with its armour (docs/elo.md), animated only where asked and if the phone allows motion. */
export function RankMedal(props: { rank: Rank; size: number; animated?: boolean; grey?: boolean; label?: string }) {
  return (
    <Suspense fallback={<span className="rank-medal" style={{ width: props.size, height: props.size }} />}>
      <MedalArt {...props} />
    </Suspense>
  )
}
