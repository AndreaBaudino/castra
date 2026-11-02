import { useState } from 'react'
import { useI18n } from '../i18n'
import { DUNGEONS, DUNGEON_IDS, type DungeonRun, lastRoom, nextRooms } from '../lib/dungeons'
import { haptic } from '../lib/prefs'

/** The dungeon card of a player, with both players' markers on it: tap a dashed room to move the selected one. */
export function DungeonSheet({
  who,
  runs,
  set,
  onClose,
}: {
  who: 0 | 1
  runs: [DungeonRun, DungeonRun]
  set: (p: 0 | 1, run: DungeonRun) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [sel, setSel] = useState(who)
  const run = runs[sel]
  const dungeon = DUNGEONS[run.d]
  const here = run.path[run.path.length - 1]
  const ended = here === lastRoom(run.d)
  const next = ended ? [] : nextRooms(run)

  const enter = (i: number) => {
    haptic()
    set(sel, { ...run, path: [...run.path, i], done: run.done + (i === lastRoom(run.d) ? 1 : 0) })
  }
  const back = () => set(sel, { ...run, path: run.path.slice(0, -1), done: run.done - (ended ? 1 : 0) })

  return (
    <div className="roll-overlay dim" onClick={onClose}>
      <div className="reset-card dungeon-card" onClick={(e) => e.stopPropagation()}>
        {/* the rules don't let a player change dungeon halfway */}
        <div className="dg-chips">
          {DUNGEON_IDS.map((id) => (
            <button
              key={id}
              className={`chip ${run.d === id ? 'on' : ''}`}
              disabled={run.path.length > 0 && run.d !== id}
              onClick={() => set(sel, { ...run, d: id })}
            >
              {DUNGEONS[id].short}
            </button>
          ))}
        </div>
        <div className="seg">
          {([0, 1] as const).map((p) => (
            <button key={p} className={sel === p ? 'on' : ''} onClick={() => setSel(p)}>
              <span className={`log-dot p${p}`} /> {t('life.player')} {p + 1}
            </button>
          ))}
        </div>
        {ended && (
          <>
            <div className="notice">{t('dg.completed', { n: run.done })}</div>
            <button className="btn primary" onClick={() => set(sel, { ...run, path: [] })}>
              {t('dg.again')}
            </button>
          </>
        )}
        <div className="dg-map">
          <img src={dungeon.image} alt={dungeon.short} />
          {dungeon.rooms.map((room, i) => {
            const [x1, y1, x2, y2] = room.at
            const markers = ([0, 1] as const).filter((p) => runs[p].d === run.d && runs[p].path[runs[p].path.length - 1] === i)
            return (
              <button
                key={room.name}
                className={`dg-room ${next.includes(i) ? 'next' : ''}`}
                style={{ left: `${x1}%`, top: `${y1}%`, width: `${x2 - x1}%`, height: `${y2 - y1}%` }}
                disabled={!next.includes(i)}
                onClick={() => enter(i)}
                aria-label={room.name}
              >
                {markers.map((p, k) => (
                  <span key={p} className={`dg-marker log-dot p${p}`} style={{ right: 4 + k * 16 }} />
                ))}
              </button>
            )
          })}
        </div>
        <div className="btn-pair">
          <button className="btn ghost" disabled={!run.path.length} onClick={back}>
            {t('dg.back')}
          </button>
          <button className="btn ghost" onClick={onClose}>
            {t('life.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
