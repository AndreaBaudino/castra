import { useState } from 'react'
import { useI18n } from '../i18n'
import { Icon, Sheet } from '../components/ui'

// How the meta's numbers are computed, in plain words: opened from the summary on the meta list and from
// a commander's stats.

const SECTIONS = ['source', 'updates', 'share', 'winrate', 'byes', 'missing', 'interval', 'minGames', 'filters'] as const

export function MetaInfoButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="icon-btn info-btn" onClick={() => setOpen(true)} aria-label={t('metaInfo.title')}>
        <Icon name="info" size={16} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('metaInfo.title')}>
        <div className="info-sheet">
          {SECTIONS.map((s) => (
            <section key={s}>
              <h3>{t(`metaInfo.${s}.title`)}</h3>
              <p>{t(`metaInfo.${s}`)}</p>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  )
}
