import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import type { Circuit } from '../lib/circuit'
import { useStoredState } from '../lib/storage'
import {
  type MetaStatus,
  SOURCE_KINDS,
  type Source,
  deleteSource,
  driveIdOf,
  importRepoSources,
  isEvent,
  saveSource,
  sourceLabel,
  sourceSeason,
  sourceYear,
  useMetaStatus,
  useSources,
} from '../lib/sources'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'
import { leagues } from './Circuit'
import AdminCircuit from './AdminCircuit'
import { useCircuitSheets } from '../lib/circuits'

// The admin area's tournaments: the sheets read by the nightly meta update, one year at a time, and how the last
// update went.

const WORKFLOW_URL = 'https://github.com/AndreaBaudino/castra/actions/workflows/meta.yml'

function UpdateStatus({ status, names }: { status: ReturnType<typeof useMetaStatus>; names: Map<string, string> }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  if (status === null) return null
  const s = typeof status === 'object' ? status : null
  const when = s && new Date(s.at).toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <section className="card">
      <div className="card-title">{t('sources.update')}</div>
      {!s ? (
        <p className="muted small no-margin">{t(status === 'none' ? 'sources.noStatus' : 'sources.statusError')}</p>
      ) : (
        <>
          <div className={`sync-line ${s.ok ? 'ok' : 'error'}`}>
            <span className="sync-dot" />
            <div>
              <div>{s.ok ? t('sources.ok', { d: when! }) : t('sources.failed', { d: when! })}</div>
              {s.error && <div className="muted small">{s.error}</div>}
              {s.ok && s.years.map((y) => <div key={y.year} className="muted small">{t('sources.yearSummary', { y: y.year, t: y.t, e: y.e })}</div>)}
            </div>
          </div>
          {s.failed.length > 0 && (
            <ul className="admin-notes bad">
              {s.failed.map((f) => (
                <li key={f.drive}>
                  <strong>{names.get(f.drive) ?? f.drive}</strong>: {f.error}
                </li>
              ))}
            </ul>
          )}
          {s.origin === 'file' && <p className="muted small no-margin">{t('sources.fromFile')}</p>}
          {s.warnings.length > 0 && (
            <>
              <button className="link" onClick={() => setOpen(!open)}>
                {open ? t('sources.hideWarnings') : t('sources.showWarnings', { n: s.warnings.length })}
              </button>
              {open && (
                <ul className="admin-notes">
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      <p className="muted small no-margin">{t('sources.nightly')}</p>
      <a className="btn ghost" href={WORKFLOW_URL} target="_blank" rel="noopener noreferrer">
        <Icon name="external" size={16} /> {t('sources.runNow')}
      </a>
    </section>
  )
}

/** What the last update read from a sheet. */
function stateOf(s: Source, status: MetaStatus | null): { text: 'error' | 'new' | 'read' | 'empty'; bad?: boolean } | null {
  if (!status) return null
  if (status.failed.some((f) => f.drive === s.drive)) return { text: 'error', bad: true }
  const n = status.read[s.drive]
  if (!status.ok) return null
  if (n === undefined) return { text: 'new' }
  return { text: n ? 'read' : 'empty' }
}

function SourceForm({ initial, existing, circuit, onDone }: { initial: Source | null; existing: Source[]; circuit: Circuit | null; onDone: () => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const thisYear = new Date().getFullYear()
  const [link, setLink] = useState(initial?.drive ?? '')
  const [s, setS] = useState<Source>(initial ?? { drive: '', kind: 'l1', year: thisYear, season: 's1' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Source>(k: K, v: Source[K]) => {
    setS((x) => ({ ...x, [k]: v }))
    setError(null)
  }
  const event = isEvent(s.kind)
  const drive = driveIdOf(link)
  const year = sourceYear(s)
  const eventNames = useMemo(() => [...new Set(circuit?.events.map((e) => e.name))], [circuit])
  const leagueNames = useMemo(() => (circuit ? leagues(circuit) : []), [circuit])
  const years = [...new Set([thisYear - 1, thisYear, thisYear + 1, ...(s.year ? [s.year] : [])])].sort()

  const save = async () => {
    if (!user) return
    const problem = !drive
      ? 'sources.err.link'
      : existing.some((x) => x.drive === drive && x.drive !== initial?.drive)
        ? 'sources.err.duplicate'
        : event && !s.name?.trim()
          ? 'sources.err.name'
          : event && !s.date
            ? 'sources.err.date'
            : !event && !s.league?.trim()
              ? 'sources.err.league'
              : null
    if (problem || !drive) return setError(t(problem ?? 'sources.err.link'))
    setBusy(true)
    setError(null)
    try {
      await saveSource(user, { ...s, drive }, initial?.drive)
      onDone()
    } catch {
      setError(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card form">
      <div className="card-title">{initial ? t('sources.edit') : t('sources.add')}</div>
      <label>
        <span>{t('sources.link')}</span>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" />
        {link && !drive && <span className="bad-text">{t('sources.err.link')}</span>}
      </label>
      <div className="field">
        <span>{t('sources.kind')}</span>
        <div className="seg wide">
          {SOURCE_KINDS.map((k) => (
            <button key={k} className={s.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>
              {t(`sources.kind.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {event ? (
        <>
          <label>
            <span>{t('sources.name')}</span>
            <input value={s.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Dark Zone Roma" />
          </label>
          <label>
            <span>{t('sources.date')}</span>
            <input type="date" value={s.date ?? ''} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label>
            <span>{t('sources.circuit')}</span>
            <input value={s.circuit ?? ''} onChange={(e) => set('circuit', e.target.value)} list="source-events" autoComplete="off" />
            <datalist id="source-events">
              {eventNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <span className="field-hint">{t('sources.circuitHint')}</span>
          </label>
        </>
      ) : (
        <>
          <div className="field">
            <span>{t('meta.year')}</span>
            <div className="seg wide">
              {years.map((y) => (
                <button key={y} className={s.year === y ? 'on' : ''} onClick={() => set('year', y)}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t('sources.season')}</span>
            <div className="seg wide">
              {(['s1', 's2'] as const).map((v) => (
                <button key={v} className={s.season === v ? 'on' : ''} onClick={() => set('season', v)}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span>{t('sources.league')}</span>
            <input value={s.league ?? ''} onChange={(e) => set('league', e.target.value)} list="source-leagues" autoComplete="off" />
            <datalist id="source-leagues">
              {leagueNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <span className="field-hint">{t('sources.leagueHint')}</span>
          </label>
          <label>
            <span>{t('sources.venue')}</span>
            <input value={s.venue ?? ''} onChange={(e) => set('venue', e.target.value)} autoComplete="off" />
          </label>
        </>
      )}
      {year && (
        <p className="muted small no-margin">
          {t('sources.goesIn', { y: year, s: (sourceSeason(s) ?? '').toUpperCase() })}
          {event && ' ' + t('sources.yearFromDate')}
        </p>
      )}
      {error && <div className="notice warn">{error}</div>}
      <div className="btn-pair">
        <button className="btn ghost" disabled={busy} onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button className="btn primary" disabled={busy} onClick={save}>
          {t('sources.save')}
        </button>
      </div>
      {initial && (
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            if (!(await dialog.confirm(t('sources.deleteConfirm', { n: sourceLabel(initial) }), { ok: t('sources.delete'), danger: true }))) return
            setBusy(true)
            try {
              await deleteSource(initial.drive)
              onDone()
            } catch {
              setError(t('admin.error'))
              setBusy(false)
            }
          }}
        >
          <Icon name="trash" size={16} /> {t('sources.delete')}
        </button>
      )}
    </section>
  )
}

export default function AdminSources({ circuit }: { circuit: Circuit | null }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const { sources, loaded } = useSources(true)
  const status = useMetaStatus()
  const report = typeof status === 'object' ? status : null
  const [editing, setEditing] = useState<Source | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const thisYear = new Date().getFullYear()
  const circuitSheets = useCircuitSheets()
  // next year too: its circuit sheet and tournaments can be set up before it starts
  const years = [...new Set([thisYear + 1, thisYear, ...circuitSheets.map((c) => c.year), ...sources.map(sourceYear).filter((y): y is number => !!y)])].sort(
    (a, b) => b - a,
  )
  const [picked, setYear] = useStoredState<number>('cc.admin.sourcesYear', thisYear)
  const year = years.includes(picked) ? picked : thisYear
  const names = useMemo(() => new Map(sources.map((s) => [s.drive, sourceLabel(s)])), [sources])
  // the form opens at the top, also from the bottom of a long list
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [editing])

  if (editing)
    return <SourceForm initial={editing === 'new' ? null : editing} existing={sources} circuit={circuit} onDone={() => setEditing(null)} />

  const ofYear = sources.filter((s) => sourceYear(s) === year)
  const events = ofYear.filter((s) => isEvent(s.kind)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const leagueList = ofYear
    .filter((s) => !isEvent(s.kind))
    .sort((a, b) => `${a.season}${a.kind}${a.league}`.localeCompare(`${b.season}${b.kind}${b.league}`))
  const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' }) : '—')

  const row = (s: Source, detail: string) => {
    const st = stateOf(s, report)
    return (
      <div key={s.drive} className="follow-row admin-row">
        <button className="follow-main" onClick={() => setEditing(s)}>
          <span className="admin-text">
            <strong className="ellipsis">{sourceLabel(s)}</strong>
            <span className="muted small ellipsis">
              {detail}
              {st && (
                <>
                  {' · '}
                  <span className={st.bad ? 'bad-text' : ''}>{t(`sources.state.${st.text}`)}</span>
                </>
              )}
            </span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
    )
  }

  return (
    <>
      <UpdateStatus status={status} names={names} />
      {!loaded ? (
        <div className="empty">…</div>
      ) : !sources.length ? (
        <section className="card">
          <div className="card-title">{t('sources.importTitle')}</div>
          <p className="muted small no-margin">{t('sources.importHint')}</p>
          <button
            className="btn primary"
            disabled={importing || !user}
            onClick={async () => {
              setImporting(true)
              try {
                const n = await importRepoSources(user!)
                await dialog.alert(t('sources.imported', { n }))
              } catch {
                await dialog.alert(t('admin.error'))
              } finally {
                setImporting(false)
              }
            }}
          >
            <Icon name="download" size={16} /> {t('sources.import')}
          </button>
        </section>
      ) : (
        <>
          <div className="seg wide">
            {years.map((y) => (
              <button key={y} className={year === y ? 'on' : ''} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
          <AdminCircuit year={year} />
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> {t('sources.add')}
          </button>
          <section className="card">
            <div className="card-title">
              {t('sources.events')}
              <span className="muted small">{events.length}</span>
            </div>
            {!events.length ? (
              <p className="muted small no-margin">{t('sources.noneYear', { y: year })}</p>
            ) : (
              <div className="follow-list">{events.map((s) => row(s, `${day(s.date)} · ${t(`sources.kind.${s.kind}`)}`))}</div>
            )}
          </section>
          <section className="card">
            <div className="card-title">
              {t('sources.leagues')}
              <span className="muted small">{leagueList.length}</span>
            </div>
            {!leagueList.length ? (
              <p className="muted small no-margin">{t('sources.noneYear', { y: year })}</p>
            ) : (
              <div className="follow-list">
                {leagueList.map((s) => {
                  const n = report?.read[s.drive]
                  const stages = n ? ` · ${t('sources.stages', { n })}` : ''
                  return row(s, `${(s.season ?? '').toUpperCase()} · ${t(`sources.kind.${s.kind}`)}${stages}`)
                })}
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}
