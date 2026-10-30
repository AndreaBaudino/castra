import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import type { Circuit } from '../lib/circuit'
import {
  type Alias,
  type AliasKind,
  aliasKey,
  aliasProblem,
  cardSuggestions,
  closest,
  deleteAlias,
  importRepoAliases,
  isConfirm,
  saveAlias,
  scryfallName,
  useAliases,
} from '../lib/aliases'
import { type MetaStatus, type NameIssue, sourceLabel, useMetaStatus, useSources } from '../lib/sources'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'

// The admin area's names: the ones the last update couldn't place, and the corrections applied to the sheets, with how
// much each one was used. A correction is saved now and applied from the next update.

type Draft = Omit<Alias, 'id' | 'key'> & { id?: string }
type Scope = 'all' | 'year' | 'drive'

function AliasForm({
  draft,
  all,
  circuit,
  onDone,
}: {
  draft: Draft
  all: Alias[]
  circuit: Circuit | null
  onDone: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const { sources } = useSources()
  const [a, setA] = useState<Draft>(draft)
  const [scope, setScope] = useState<Scope>(draft.drive ? 'drive' : draft.year ? 'year' : 'all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<string[]>([])
  const players = useMemo(() => circuit?.players.map((p) => p.name) ?? [], [circuit])
  const near = useMemo(() => (a.kind === 'player' && a.from ? closest(a.from, players) : []), [a.kind, a.from, players])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setA((x) => ({ ...x, [k]: v }))
    setError(null)
  }
  const thisYear = new Date().getFullYear()
  const years = [...new Set([thisYear, thisYear - 1, ...(a.year ? [a.year] : [])])].sort((x, y) => y - x)

  // Scryfall's suggestions while typing a commander
  useEffect(() => {
    if (a.kind !== 'commander') return
    const ctl = new AbortController()
    const timer = setTimeout(() => cardSuggestions(a.to, ctl.signal).then(setCards, () => {}), 250)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [a.kind, a.to])

  const save = async () => {
    if (!user) return
    if (!a.from.trim() || !a.to.trim()) return setError(t('aliases.err.empty'))
    const out: Draft = { ...a, year: scope === 'year' ? (a.year ?? thisYear) : undefined, drive: scope === 'drive' ? a.drive : undefined }
    if (scope === 'drive' && !out.drive) return setError(t('aliases.err.drive'))
    setBusy(true)
    try {
      // a commander is corrected to its Scryfall name, which the update finds for sure
      if (out.kind === 'commander') {
        const name = await scryfallName(out.to)
        if (!name) return setError(t('aliases.err.card', { n: out.to }))
        out.to = name
      }
      const problem = aliasProblem({ ...out, key: aliasKey(out.kind, out.from) }, all)
      if (problem) return setError(t(problem[0] as Parameters<typeof t>[0], problem[1]))
      await saveAlias(user, out)
      onDone()
    } catch {
      setError(t('admin.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card form">
      <div className="card-title">{a.id ? t('aliases.edit') : t('aliases.add')}</div>
      {!a.id && !draft.from && (
        <div className="seg wide">
          {(['commander', 'player'] as const).map((k) => (
            <button key={k} className={a.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>
              {t(`aliases.kind.${k}`)}
            </button>
          ))}
        </div>
      )}
      <label>
        <span>{t('aliases.from')}</span>
        <input value={a.from} onChange={(e) => set('from', e.target.value)} autoComplete="off" />
      </label>
      <label>
        <span>{t(a.kind === 'commander' ? 'aliases.toCommander' : 'aliases.toPlayer')}</span>
        <input value={a.to} onChange={(e) => set('to', e.target.value)} list="alias-to" autoComplete="off" />
        <datalist id="alias-to">
          {(a.kind === 'commander' ? cards : players).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      {near.length > 0 && (
        <div className="chips wrap-chips">
          {near.map((n) => (
            <button key={n} className={`chip ${a.to === n ? 'on' : ''}`} onClick={() => set('to', n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      {a.kind === 'player' && (
        <>
          <div className="field">
            <span>{t('aliases.scope')}</span>
            <div className="seg wide">
              {(['all', 'year', 'drive'] as const).map((s) => (
                <button key={s} className={scope === s ? 'on' : ''} onClick={() => setScope(s)}>
                  {t(`aliases.scope.${s}`)}
                </button>
              ))}
            </div>
          </div>
          {scope === 'year' && (
            <div className="seg wide">
              {years.map((y) => (
                <button key={y} className={(a.year ?? thisYear) === y ? 'on' : ''} onClick={() => set('year', y)}>
                  {y}
                </button>
              ))}
            </div>
          )}
          {scope === 'drive' && (
            <select value={a.drive ?? ''} onChange={(e) => set('drive', e.target.value || undefined)}>
              <option value="">{t('aliases.pickSheet')}</option>
              {sources.map((s) => (
                <option key={s.drive} value={s.drive}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
          )}
          <p className="field-hint muted small no-margin">{t('aliases.scopeHint')}</p>
        </>
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
      {a.id && (
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            if (!(await dialog.confirm(t('aliases.deleteConfirm', { f: a.from }), { ok: t('aliases.delete'), danger: true }))) return
            await deleteAlias(a.id!).then(onDone, () => setError(t('admin.error')))
          }}
        >
          <Icon name="trash" size={16} /> {t('aliases.delete')}
        </button>
      )}
    </section>
  )
}

/** "Genova, Savona +3": where a name shows up, or where a correction was used. */
const places = (where: string[], n = 2) => where.slice(0, n).join(', ') + (where.length > n ? ` +${where.length - n}` : '')

function Issues({ status, all, onFix, onConfirm }: { status: MetaStatus; all: Alias[]; onFix: (i: NameIssue) => void; onConfirm: (i: NameIssue) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // corrected since the update: gone at the next one
  const pending = (i: NameIssue) => all.some((a) => a.kind === i.kind && a.key === aliasKey(i.kind, i.name) && (!status.at || (a.at ?? '') > status.at))
  const list = (status.issues ?? []).filter((i) => !pending(i)).sort((a, b) => b.where.length - a.where.length)
  const shown = open ? list : list.slice(0, 8)
  return (
    <section className="card">
      <div className="card-title">
        {t('aliases.issues')}
        <span className="muted small">{list.length}</span>
      </div>
      {!list.length ? (
        // a report from before the list existed, or from a failed update, says nothing about the names
        <p className="muted small no-margin">{t(!status.ok ? 'aliases.noReportFailed' : !status.issues ? 'aliases.noReport' : 'aliases.noIssues')}</p>
      ) : (
        <>
          <p className="muted small no-margin">{t('aliases.issuesHint')}</p>
          <div className="follow-list">
            {shown.map((i) => (
              <div key={i.kind + i.name} className="follow-row admin-row">
                <span className="admin-text">
                  <strong className="ellipsis">{i.name}</strong>
                  <span className="muted small ellipsis">
                    {t(`aliases.kind.${i.kind}`)} · {i.guess ? t('aliases.guess', { g: i.guess }) + ' · ' : ''}
                    {places(i.where)}
                  </span>
                </span>
                {i.kind === 'player' && (
                  <button className="icon-btn" title={t('aliases.confirm')} aria-label={t('aliases.confirm')} onClick={() => onConfirm(i)}>
                    <Icon name="check" size={18} />
                  </button>
                )}
                <button className="btn small ghost" onClick={() => onFix(i)}>
                  {t('aliases.fix')}
                </button>
              </div>
            ))}
          </div>
          {list.length > shown.length && (
            <button className="link" onClick={() => setOpen(true)}>
              {t('aliases.showAll', { n: list.length })}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default function AdminAliases({ circuit }: { circuit: Circuit | null }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const { aliases, loaded } = useAliases()
  const { sources } = useSources()
  const status = useMetaStatus()
  const report = typeof status === 'object' ? status : null
  const [editing, setEditing] = useState<Draft | null>(null)
  const [kind, setKind] = useState<AliasKind>('commander')
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const sheetName = useMemo(() => new Map(sources.map((s) => [s.drive, sourceLabel(s)])), [sources])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [editing])

  if (editing) return <AliasForm draft={editing} all={aliases} circuit={circuit} onDone={() => setEditing(null)} />

  // a name that shows up in one sheet only starts limited to it when it's a player's: elsewhere it may be someone else
  const fix = (i: NameIssue) =>
    setEditing({
      kind: i.kind,
      from: i.name,
      to: i.kind === 'commander' ? (i.guess ?? '') : (closest(i.name, circuit?.players.map((p) => p.name) ?? [], 1)[0] ?? ''),
      ...(i.kind === 'player' && i.drives.length === 1 ? { drive: i.drives[0] } : {}),
    })
  const confirm = async (i: NameIssue) => {
    if (!user || !(await dialog.confirm(t('aliases.confirmAsk', { n: i.name }), { ok: t('aliases.confirm') }))) return
    await saveAlias(user, { kind: 'player', from: i.name, to: i.name }).catch(() => dialog.alert(t('admin.error')))
  }

  const nq = q.trim().toLowerCase()
  const list = aliases
    .filter((a) => a.kind === kind && (!nq || `${a.from} ${a.to}`.toLowerCase().includes(nq)))
    .sort((a, b) => a.from.localeCompare(b.from))
  const usage = (a: Alias) => {
    const u = report?.aliases?.[a.id]
    if (u) return t('aliases.used', { n: u.n, w: places(u.where) })
    // saved after the last update, or that update read the old file: not run yet
    if (!report || report.aliasOrigin !== 'firestore' || (a.at ?? '') > report.at) return t('aliases.notRunYet')
    return t('aliases.unused')
  }
  const scopeOf = (a: Alias) =>
    a.drive ? t('aliases.only', { s: sheetName.get(a.drive) ?? a.drive }) : a.year ? t('aliases.only', { s: String(a.year) }) : ''

  return (
    <>
      {report && <Issues status={report} all={aliases} onFix={fix} onConfirm={confirm} />}
      {!loaded ? (
        <div className="empty">…</div>
      ) : !aliases.length ? (
        <section className="card">
          <div className="card-title">{t('aliases.importTitle')}</div>
          <p className="muted small no-margin">{t('aliases.importHint')}</p>
          <button
            className="btn primary"
            disabled={importing || !user}
            onClick={async () => {
              setImporting(true)
              try {
                await dialog.alert(t('aliases.imported', { n: await importRepoAliases(user!) }))
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
        <section className="card">
          <div className="card-title">
            {t('aliases.title')}
            <span className="muted small">{aliases.length}</span>
          </div>
          <div className="seg wide">
            {(['commander', 'player'] as const).map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {t(`aliases.kinds.${k}`)}
              </button>
            ))}
          </div>
          <label className="search">
            <Icon name="search" size={18} />
            <input type="search" placeholder={t('aliases.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="follow-list">
            {list.map((a) => (
              <button key={a.id} className="follow-row admin-row alias-row" onClick={() => setEditing(a)}>
                <span className="admin-text">
                  <span className="ellipsis">
                    {isConfirm(a) ? (
                      <>
                        <strong>{a.from}</strong> <span className="muted small">· {t('aliases.confirmed')}</span>
                      </>
                    ) : (
                      <>
                        {a.from} → <strong>{a.to}</strong>
                      </>
                    )}
                  </span>
                  <span className="muted small ellipsis">
                    {scopeOf(a) && `${scopeOf(a)} · `}
                    {usage(a)}
                  </span>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setEditing({ kind, from: '', to: '' })}>
            <Icon name="plus" size={16} /> {t('aliases.add')}
          </button>
        </section>
      )}
      <p className="muted small no-margin">{t('aliases.nightly')}</p>
    </>
  )
}
