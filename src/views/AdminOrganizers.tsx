import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import type { Circuit } from '../lib/circuit'
import type { Claim } from '../lib/claims'
import { type Organizer, canRun, removeOrganizer, saveOrganizer, useOrganizers } from '../lib/organizers'
import { sourceLabel, sourceYear, useSources } from '../lib/sources'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'
import { leagues as circuitLeagues } from './Circuit'

// The admin area's tournament organizers (TO): verified players promoted to run the stages of their leagues and the
// level 1 and 2 tournaments of those leagues or assigned to them (AdminSources).

type Editing = { uid: string; player: string; o?: Organizer }

export default function AdminOrganizers({ circuit, claims }: { circuit: Circuit | null; claims: Map<string, Claim> }) {
  const { t } = useI18n()
  const { organizers, loaded } = useOrganizers()
  const { sources } = useSources()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const names = useMemo(() => new Map(circuit?.players.map((p) => [p.key, p.name])), [circuit])
  const nameOf = (key: string) => names.get(key) ?? claims.get(key)?.name ?? key
  const leagueNames = useMemo(() => {
    const fromSheets = sources.flatMap((s) => (s.kind === 'league' && s.league ? [s.league] : []))
    return [...new Set([...(circuit ? circuitLeagues(circuit) : []), ...fromSheets])].sort((a, b) => a.localeCompare(b))
  }, [circuit, sources])

  if (editing)
    return <OrganizerForm {...editing} name={nameOf(editing.player)} leagueNames={leagueNames} onDone={() => setEditing(null)} />

  const list = [...organizers].sort((a, b) => a[1].name.localeCompare(b[1].name))
  // a claim the admins revoked or unverified after the promotion: the TO is no longer who they were
  const lapsed = (uid: string, o: Organizer) => claims.get(o.player)?.uid !== uid || !claims.get(o.player)?.verified
  const q = query.trim().toLowerCase()
  const candidates = [...claims]
    .filter(([key, c]) => c.verified && !organizers.has(c.uid) && (!q || nameOf(key).toLowerCase().includes(q)))
    .sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))

  return (
    <>
      <section className="card">
        <div className="card-title">
          {t('to.title')}
          {list.length > 0 && <span className="muted small">{list.length}</span>}
        </div>
        <p className="muted small no-margin">{t('to.hint')}</p>
        {!loaded ? null : !list.length ? (
          <p className="muted small no-margin">{t('to.none')}</p>
        ) : (
          <div className="follow-list">
            {list.map(([uid, o]) => (
              <div key={uid} className="follow-row admin-row">
                <button className="follow-main" onClick={() => setEditing({ uid, player: o.player, o })}>
                  <span className="admin-text">
                    <strong className="ellipsis">{nameOf(o.player)}</strong>
                    <span className={`small ellipsis ${lapsed(uid, o) ? 'bad-text' : 'muted'}`}>
                      {lapsed(uid, o) ? t('to.lapsed') : o.leagues.join(', ') || t('to.noLeagues')}
                      {' · '}
                      {t('to.runs', { n: sources.filter((s) => canRun(uid, o, s)).length })}
                    </span>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {!adding ? (
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> {t('to.add')}
        </button>
      ) : (
        <section className="card">
          <div className="card-title">{t('to.add')}</div>
          <p className="muted small no-margin">{t('to.addHint')}</p>
          <label className="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder={t('admin.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
          {!candidates.length ? (
            <p className="muted small no-margin">{t('admin.noMatch')}</p>
          ) : (
            <div className="follow-list">
              {candidates.slice(0, 30).map(([key, c]) => (
                <div key={key} className="follow-row admin-row">
                  <button
                    className="follow-main"
                    onClick={() => {
                      setAdding(false)
                      setEditing({ uid: c.uid, player: key })
                    }}
                  >
                    <span className="admin-text">
                      <strong className="ellipsis">{nameOf(key)}</strong>
                      <span className="muted small ellipsis">{c.name ?? t('admin.noName')}</span>
                    </span>
                    <Icon name="plus" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="btn ghost" onClick={() => setAdding(false)}>
            {t('common.cancel')}
          </button>
        </section>
      )}
    </>
  )
}

function OrganizerForm({
  uid,
  player,
  o,
  name,
  leagueNames,
  onDone,
}: Editing & { name: string; leagueNames: string[]; onDone: () => void }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const { sources } = useSources()
  const [picked, setPicked] = useState<string[]>(o?.leagues ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const thisYear = new Date().getFullYear()
  // what the TO would run with these leagues: this year's sheets and later ones
  const runs = sources
    .filter((s) => (sourceYear(s) ?? 0) >= thisYear && canRun(uid, { player, name, leagues: picked, at: '', by: '' }, s))
    .sort((a, b) => (a.date ?? `${a.year}`).localeCompare(b.date ?? `${b.year}`))
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
  const toggle = (l: string) => setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l].sort((a, b) => a.localeCompare(b))))

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(false)
    try {
      await fn()
      onDone()
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <section className="card form">
      <div className="card-title">{name}</div>
      <div className="field">
        <span>{t('to.leagues')}</span>
        <div className="chips wrap">
          {leagueNames.map((l) => (
            <button
              key={l}
              className={`chip ${picked.includes(l) ? 'on' : ''}`}
              aria-pressed={picked.includes(l)}
              onClick={() => toggle(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="field-hint">{t('to.leaguesHint')}</span>
      </div>
      <div className="field">
        <span>{t('to.willRun')}</span>
        {!runs.length ? (
          <p className="muted small no-margin">{t('to.runsNothing')}</p>
        ) : (
          <ul className="admin-notes">
            {runs.map((s) => (
              <li key={s.drive}>
                <strong>{sourceLabel(s)}</strong> ·{' '}
                {s.date ? `${t(`sources.kind.${s.kind}`)} · ${day(s.date)}` : `${(s.season ?? '').toUpperCase()} ${s.year}`}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <div className="notice warn">{t('to.error')}</div>}
      <div className="btn-pair">
        <button className="btn ghost" disabled={busy} onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button
          className="btn primary"
          disabled={busy || !user}
          onClick={() => run(() => saveOrganizer(user!, uid, { player, name, leagues: picked }))}
        >
          {t(o ? 'sources.save' : 'to.promote')}
        </button>
      </div>
      {o && (
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            const ok = await dialog.confirm(t('to.removeConfirm', { p: name }), { ok: t('to.remove'), danger: true })
            if (ok) run(() => removeOrganizer(uid))
          }}
        >
          <Icon name="trash" size={16} /> {t('to.remove')}
        </button>
      )}
    </section>
  )
}
