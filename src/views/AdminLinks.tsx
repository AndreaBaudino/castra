import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import { type CircuitEvent, eventDateLabel, parseEventName, useCircuit } from '../lib/circuit'
import { useCircuitSheets } from '../lib/circuits'
import { type Source, isEvent, saveSource, sourceYear } from '../lib/sources'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'

// In the admin area's tournaments, for the year picked there: the circuit's events and the tournament sheets that
// aren't linked yet. A tournament is linked to an event by the event's title in the circuit sheet, so the two show as
// one page in the app (from the next update). The sheets stay as they are: if the circuit sheet renames an event, its
// link no longer matches and shows up here again.

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const words = (s: string) =>
  new Set(
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w)),
  )

const compact = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * How likely an event of the circuit is this tournament: the same day (or month, when the title has no day), then the
 * name, also written without spaces ("MagicHammer" is "Magic Hammer Ottobre 2026").
 */
function score(s: Source, e: CircuitEvent) {
  const d = parseEventName(e.name)
  let points = 0
  if (s.date && d.month && +s.date.slice(5, 7) === d.month) {
    const gap = d.day ? Math.abs(+s.date.slice(8, 10) - d.day) : null
    points += gap === null ? 2 : gap === 0 ? 6 : gap <= 2 ? 3 : 0
  }
  const a = compact(s.name ?? '')
  const b = compact(e.name)
  if (a.length >= 4 && (b.includes(a) || a.includes(b.replace(/\d+/g, '')))) points += 4
  else {
    const mine = words(s.name ?? '')
    for (const w of words(e.name)) if (mine.has(w)) points += 2
  }
  if (e.level && s.kind !== `l${e.level}`) points -= 2
  return points
}

export default function AdminLinks({ year, sources, onAdd }: { year: number; sources: Source[]; onAdd: (preset: Partial<Source>) => void }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const sheet = useCircuitSheets().find((s) => s.year === year) ?? null
  const { data: circuit } = useCircuit(sheet)
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null) // the tournament whose event is being picked

  const view = useMemo(() => {
    if (!circuit) return null
    const titles = new Set(circuit.events.map((e) => norm(e.name)))
    const events = sources.filter((s) => isEvent(s.kind) && sourceYear(s) === year)
    const linked = new Set(events.filter((s) => s.circuit && titles.has(norm(s.circuit))).map((s) => norm(s.circuit!)))
    const freeEvents = circuit.events.filter((e) => !linked.has(norm(e.name)))
    const unlinked = events
      .filter((s) => !s.circuit || !titles.has(norm(s.circuit)))
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .map((s) => {
        const ranked = freeEvents.map((e) => ({ e, p: score(s, e) })).sort((a, b) => b.p - a.p)
        // a clear best guess: good enough, and not tied with the next one
        const guess = ranked[0] && ranked[0].p >= 5 && (!ranked[1] || ranked[1].p < ranked[0].p) ? ranked[0].e : null
        return { s, guess, broken: !!s.circuit }
      })
    const guessed = new Set(unlinked.map((u) => u.guess?.name))
    return { unlinked, freeEvents, orphans: freeEvents.filter((e) => !guessed.has(e.name)) }
  }, [circuit, sources, year])

  if (!sheet || !view || (!view.unlinked.length && !view.orphans.length)) {
    return sheet && view ? (
      <section className="card">
        <div className="card-title">{t('links.title')}</div>
        <p className="muted small no-margin">{t('links.allLinked')}</p>
      </section>
    ) : null
  }

  const link = async (s: Source, e: CircuitEvent) => {
    if (!user) return
    setBusy(s.drive)
    setPicking(null)
    try {
      await saveSource(user, { ...s, circuit: norm(e.name) })
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(null)
    }
  }
  const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' }) : '—')
  // a date for a tournament added from an event: the one in the event's title, in the year picked
  const presetOf = (e: CircuitEvent): Partial<Source> => {
    const d = parseEventName(e.name)
    const date = d.month && d.day ? `${year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : undefined
    return { kind: e.level === 2 ? 'l2' : 'l1', circuit: norm(e.name), date }
  }

  return (
    <section className="card">
      <div className="card-title">{t('links.title')}</div>
      <p className="muted small no-margin">{t('links.hint')}</p>
      {view.unlinked.length > 0 && (
        <>
          <div className="pref-group">{t('links.tournaments', { n: view.unlinked.length })}</div>
          <div className="follow-list">
            {view.unlinked.map(({ s, guess, broken }) => (
              <div key={s.drive} className="link-row">
                <div className="admin-text">
                  <strong className="ellipsis">{s.name}</strong>
                  <span className="muted small">
                    {day(s.date)}
                    {broken && (
                      <>
                        {' · '}
                        <span className="bad-text">{t('links.broken', { c: s.circuit! })}</span>
                      </>
                    )}
                  </span>
                </div>
                {picking === s.drive ? (
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(ev) => {
                      const e = view.freeEvents.find((x) => x.name === ev.target.value)
                      if (e) link(s, e)
                    }}
                    onBlur={() => setPicking(null)}
                  >
                    <option value="">{t('links.pick')}</option>
                    {view.freeEvents.map((e) => (
                      <option key={e.id} value={e.name}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                ) : !view.freeEvents.length ? (
                  <span className="muted small">{t('links.noFree')}</span>
                ) : (
                  <div className="link-actions">
                    {guess && (
                      <button className="btn small primary" disabled={busy === s.drive} onClick={() => link(s, guess)}>
                        <Icon name="check" size={14} /> {t('links.linkTo', { e: guess.name })}
                      </button>
                    )}
                    <button className={guess ? 'link' : 'btn small ghost'} disabled={busy === s.drive} onClick={() => setPicking(s.drive)}>
                      {guess ? t('links.other') : t('links.choose')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {view.orphans.length > 0 && (
        <>
          <div className="pref-group">{t('links.events', { n: view.orphans.length })}</div>
          <div className="follow-list">
            {view.orphans.map((e) => (
              <div key={e.id} className="follow-row admin-row">
                <span className="admin-text">
                  <strong className="ellipsis">{e.name}</strong>
                  <span className="muted small">
                    {[eventDateLabel(e, lang), e.players ? t('links.players', { n: e.players }) : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button className="btn small ghost" onClick={() => onAdd(presetOf(e))}>
                  <Icon name="plus" size={14} /> {t('links.add')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
