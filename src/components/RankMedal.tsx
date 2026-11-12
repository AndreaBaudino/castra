import { useMemo } from 'react'
import { DEFS, PARTS } from '../lib/medalArt'
import { RANK_ICONS } from '../lib/rankIcons'
import type { Rank, Tier } from '../lib/elo'

// The medal of a rank (docs/elo.md, "Medaglie dei rank"): a disc of the rank's metal with its icon struck in it, and
// the armour each rank adds: plates, pauldrons, leather strips, wings, crest and laurel; the podium has it all, with
// ribbons and stars. Metal pieces get a bevel, light and shadow; leaves, horsehair, leather and cloth stay matte.
// Loaded lazily (see Rank.tsx): the drawing is large.

type Part = 'plate' | 'pauldrons' | 'pteruges' | 'wings' | 'crest' | 'laurel' | 'podium'
const LOOK: Record<Tier, { metal: string; light: string; icon: keyof typeof RANK_ICONS; parts: Part[]; stars?: number }> = {
  tirone: { metal: 'tirone', light: '#E4E4E8', icon: 'Tirone', parts: [] },
  legionario: { metal: 'legionario', light: '#F6D7BC', icon: 'Legionario', parts: ['plate'] },
  decano: { metal: 'decano', light: '#F1F6FA', icon: 'Decano', parts: ['plate', 'pauldrons'] },
  optio: { metal: 'optio', light: '#D3F3E1', icon: 'Optio', parts: ['plate', 'pauldrons', 'pteruges'] },
  centurione: { metal: 'centurione', light: '#D6E7FB', icon: 'Centurione', parts: ['plate', 'pauldrons', 'pteruges', 'wings'] },
  primipilo: { metal: 'primipilo', light: '#FBEBC0', icon: 'Primipilo', parts: ['plate', 'pauldrons', 'pteruges', 'wings', 'crest', 'laurel'] },
  imperatore: { metal: 'oro', light: '#FFF3CC', icon: 'Primipilo', parts: ['plate', 'pauldrons', 'pteruges', 'wings', 'crest', 'laurel', 'podium'], stars: 3 },
  legato: { metal: 'argento', light: '#FFFFFF', icon: 'Primipilo', parts: ['plate', 'pauldrons', 'pteruges', 'wings', 'crest', 'laurel', 'podium'], stars: 2 },
  tribuno: { metal: 'bronzo', light: '#F8D9C2', icon: 'Primipilo', parts: ['plate', 'pauldrons', 'pteruges', 'wings', 'crest', 'laurel', 'podium'], stars: 1 },
}

const still = matchMedia('(prefers-reduced-motion: reduce)')

function medalSvg(rank: Rank, { animated = false, grey = false } = {}) {
  const look = LOOK[rank.tier]
  const has = (p: Part) => look.parts.includes(p)
  const fill = (s: string) => s.split('$G').join(`url(#cm-${grey ? 'grigio' : look.metal})`).split('$L').join(grey ? '#B9B9C0' : look.light)
  const metal = (s: string) => `<g filter="url(#cm-3d)">${fill(s)}</g>`
  const matte = (s: string) => `<g filter="url(#cm-soft)">${fill(s)}</g>`
  const o: string[] = []
  if (has('podium')) o.push(matte(PARTS.ribbon))
  if (has('crest')) o.push(matte(PARTS.crest))
  if (has('wings')) o.push(metal(PARTS[has('podium') ? 'wings3' : has('crest') ? 'wings2' : 'wings1']))
  if (has('pteruges')) o.push(matte(PARTS[has('laurel') ? 'stripsLong' : 'strips']), metal(PARTS[has('laurel') ? 'tipsLong' : 'tips']))
  if (has('pauldrons')) o.push(metal(PARTS.pauldrons))
  if (has('laurel')) o.push(matte(PARTS.laurel))
  if (rank.div) o.push(metal(PARTS[`spikes${rank.div}${has('plate') ? 'p' : 'd'}`]))
  if (has('plate')) o.push(metal(PARTS.plate))
  if (look.stars) o.push(`<g filter="url(#cm-glow)">${fill(PARTS[`glow${look.stars as 1 | 2 | 3}`])}</g>`, metal(PARTS[`stars${look.stars as 1 | 2 | 3}`]))
  o.push(metal(PARTS.disc), metal(PARTS.inner))
  if (animated) o.push(metal('<circle cx="36" cy="36" r="22" fill="url(#cm-sweep)"></circle>'))
  // the icon struck into the metal: a light edge below, the dark relief above
  const icon = RANK_ICONS[look.icon]
  o.push(
    `<g transform="translate(23.75 23.85) scale(1.0417)" fill="#FFFFFF" fill-opacity="0.35"><path fill-rule="evenodd" d="${icon}"></path></g>`,
    `<g transform="translate(23.5 23.5) scale(1.0417)" fill="#16161A" fill-opacity="0.85"><path fill-rule="evenodd" d="${icon}"></path></g>`,
  )
  const defs = animated ? DEFS.split('§').join('') : DEFS.replace(/§[^§]*§/g, '')
  return `<defs>${defs}</defs>${o.join('')}`
}

export default function RankMedal({ rank, size, animated, grey, label }: { rank: Rank; size: number; animated?: boolean; grey?: boolean; label?: string }) {
  const move = !!animated && !still.matches
  const html = useMemo(() => medalSvg(rank, { animated: move, grey }), [rank, move, grey])
  return (
    <svg
      className="rank-medal"
      width={size}
      height={size}
      viewBox="-26 -26 124 124"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
