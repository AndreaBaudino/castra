import { useState } from 'react'
import { useI18n } from '../i18n'
import { Icon, Sheet } from '../components/ui'

// The numbers and words of the meta and of the circuit, in plain words: the meta's from the summary on the meta
// list and from a commander's stats, the circuit's from the leaderboards and from a player's POTY line.

const META = ['source', 'updates', 'share', 'winrate', 'byes', 'missing', 'interval', 'minGames', 'filters'] as const
const CIRCUIT = ['points', 'poty', 'invited', 'zone', 'levels', 'wld'] as const

function InfoButton({ title, items, label }: { title: string; items: [string, string][]; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={label ? 'info-link' : 'icon-btn info-btn'} onClick={() => setOpen(true)} aria-label={title}>
        <Icon name="info" size={label ? 15 : 16} />
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="info-sheet">
          {items.map(([h, p]) => (
            <section key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  )
}

export function MetaInfoButton() {
  const { t } = useI18n()
  return <InfoButton title={t('metaInfo.title')} items={META.map((s) => [t(`metaInfo.${s}.title`), t(`metaInfo.${s}`)])} />
}

/** `spots`: the players who go to the POTY by ranking. With `withLabel`, a "how it works" link instead of an icon. */
export function CircuitInfoButton({ spots, withLabel }: { spots: number; withLabel?: boolean }) {
  const { t } = useI18n()
  return (
    <InfoButton
      title={t('circuitInfo.title')}
      label={withLabel ? t('circuitInfo.open') : undefined}
      items={CIRCUIT.map((s) => [t(`circuitInfo.${s}.title`), t(`circuitInfo.${s}`, { n: spots })])}
    />
  )
}
