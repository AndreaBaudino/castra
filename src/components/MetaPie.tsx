import { useState } from 'react'
import { useI18n } from '../i18n'
import { shortName } from '../lib/meta'
import { Icon, pct } from './ui'

export interface PieItem {
  name: string // the commander
  count: number // decks registered with it
}

// past this many slices the colours would no longer tell them apart (--pie-1 … --pie-8 in index.css)
const COLORS = 8
const R = 54
const C = 2 * Math.PI * R
const GAP = 2

/**
 * The meta as a doughnut: one slice per commander, the biggest in their own colour.
 * - `min`: only the commanders with at least this share get a slice, `max` at most; the rest is one grey "others"
 * - `all`: every commander gets a slice, those past the first `max` in grey; the legend lists them on demand
 * Tapping a slice (or hovering it, or its legend row, with a mouse) shows its share in the middle; a legend row
 * opens the commander.
 */
export function MetaPie({
  items,
  max = COLORS,
  min = 0,
  all = false,
  counts = false,
  center,
  onOpen,
  size = 132,
}: {
  items: PieItem[] // the biggest first
  max?: number // slices in colour, up to COLORS
  min?: number
  all?: boolean
  counts?: boolean // show the number of decks beside the share
  center: { value: string | number; label: string }
  onOpen: (name: string) => void
  size?: number
}) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const total = items.reduce((s, x) => s + x.count, 0)
  if (!total) return null

  const named = items.filter((x) => all || x.count / total >= min).slice(0, Math.min(max, COLORS))
  const rest = items.slice(named.length)
  const restCount = rest.reduce((s, x) => s + x.count, 0)
  // the slices, clockwise from the top: the named ones, then every other one (all) or a single "others"
  const slices = [
    ...named.map((x, i) => ({ ...x, color: `var(--pie-${i + 1})` })),
    ...(all
      ? rest.map((x, i) => ({ ...x, color: `var(--pie-rest${i % 2 ? '-2' : ''})` }))
      : restCount
        ? [{ name: '', count: restCount, color: 'var(--pie-rest)' }]
        : []),
  ]
  const othersLabel = t('meta.pieOthers', { n: rest.length })
  const label = (i: number) => (slices[i].name ? shortName(slices[i].name) : othersLabel)
  const active = hover ?? picked
  let start = 0
  const arcs = slices.map((s, i) => {
    const len = (s.count / total) * C
    const arc = { dash: Math.max(len - GAP, 0.5), off: -(start + GAP / 2), color: s.color, dim: active != null && active !== i }
    start += len
    return arc
  })
  const mouse = (e: React.PointerEvent) => e.pointerType === 'mouse'

  const row = (x: PieItem, i: number, color: string) => (
    <li key={x.name}>
      <button
        className={active === i ? 'on' : ''}
        onClick={() => onOpen(x.name)}
        onPointerEnter={(e) => mouse(e) && setHover(i)}
        onPointerLeave={() => setHover(null)}
      >
        <span className="swatch" style={{ background: color }} />
        <span className="ellipsis grow">{shortName(x.name)}</span>
        {counts && <span className="muted small">×{x.count}</span>}
        <b>{pct(x.count / total)}</b>
      </button>
    </li>
  )

  return (
    <div className="pie">
      <div className="pie-chart" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 140 140"
          role="img"
          aria-label={`${t('meta.share')}: ${slices
            .slice(0, named.length + 1)
            .map((_, i) => `${label(i)} ${pct(slices[i].count / total)}`)
            .join(', ')}`}
        >
          <g transform="rotate(-90 70 70)">
            {arcs.map((a, i) => (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={R}
                stroke={a.color}
                strokeDasharray={`${a.dash} ${C - a.dash}`}
                strokeDashoffset={a.off}
                className={a.dim ? 'dim' : ''}
                onClick={() => setPicked(picked === i ? null : i)}
                onPointerEnter={(e) => mouse(e) && setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pie-center">
          <b>{active != null ? pct(slices[active].count / total) : center.value}</b>
          <span>{active != null ? label(active) : center.label}</span>
        </div>
      </div>

      <ul className="pie-legend">
        {named.map((x, i) => row(x, i, `var(--pie-${i + 1})`))}
        {restCount > 0 && (
          <li>
            {all ? (
              <button onClick={() => setOpen(!open)} aria-expanded={open}>
                <span className="swatch" style={{ background: 'var(--pie-rest)' }} />
                <span className="ellipsis grow muted">{othersLabel}</span>
                <b>{pct(restCount / total)}</b>
                <span className={`chev ${open ? 'up' : ''}`}>
                  <Icon name="chevron" size={14} />
                </span>
              </button>
            ) : (
              <button
                className={active === named.length ? 'on' : ''}
                onClick={() => setPicked(picked === named.length ? null : named.length)}
                onPointerEnter={(e) => mouse(e) && setHover(named.length)}
                onPointerLeave={() => setHover(null)}
              >
                <span className="swatch" style={{ background: 'var(--pie-rest)' }} />
                <span className="ellipsis grow muted">{othersLabel}</span>
                <b>{pct(restCount / total)}</b>
              </button>
            )}
          </li>
        )}
        {all && open && rest.map((x, i) => row(x, named.length + i, `var(--pie-rest${i % 2 ? '-2' : ''})`))}
      </ul>
    </div>
  )
}
