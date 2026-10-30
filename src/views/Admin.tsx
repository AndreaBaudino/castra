import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import type { Circuit } from '../lib/circuit'
import type { Claim } from '../lib/claims'
import { clearClaimLook, revokeClaim, unrevokeClaim, useRevoked } from '../lib/admin'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'
import { useStoredState } from '../lib/storage'
import AdminSources from './AdminSources'
import AdminBanlist from './AdminBanlist'
import AdminAliases from './AdminAliases'

// The admin area, inside the profile: the claimed circuit players and the claims revoked by an admin, and the
// tournament sheets read by the nightly meta update (AdminSources).

const hasLook = (c: Claim) => !!(c.coverName || c.coverArt || c.deck)

export default function Admin(props: { circuit: Circuit | null; claims: Map<string, Claim>; openPlayer: (key: string) => void }) {
  const { t } = useI18n()
  const [tab, setTab] = useStoredState<'players' | 'sources' | 'aliases' | 'banlist'>('cc.admin.tab', 'players')
  return (
    <>
      <div className="seg wide">
        {(['players', 'sources', 'aliases', 'banlist'] as const).map((v) => (
          <button key={v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>
            {t(`admin.tab.${v}`)}
          </button>
        ))}
      </div>
      {tab === 'players' ? (
        <Claims {...props} />
      ) : tab === 'sources' ? (
        <AdminSources circuit={props.circuit} />
      ) : tab === 'aliases' ? (
        <AdminAliases circuit={props.circuit} />
      ) : (
        <AdminBanlist />
      )}
    </>
  )
}

function Claims({
  circuit,
  claims,
  openPlayer,
}: {
  circuit: Circuit | null
  claims: Map<string, Claim>
  openPlayer: (key: string) => void
}) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const revoked = useRevoked()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // the player key being changed
  const names = useMemo(() => new Map(circuit?.players.map((p) => [p.key, p.name])), [circuit])
  const nameOf = (key: string) => names.get(key) ?? key
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })

  const q = query.trim().toLowerCase()
  const claimed = [...claims]
    .filter(([key, c]) => !q || nameOf(key).toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q))
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
  const blocked = [...revoked].sort((a, b) => b[1].at.localeCompare(a[1].at))

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-title">
          {t('admin.claims')}
          <span className="muted small">{circuit ? t('admin.claimsOf', { n: claims.size, p: circuit.players.length }) : claims.size}</span>
        </div>
        <p className="muted small no-margin">{t('admin.claimsHint')}</p>
        <label className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder={t('admin.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {!claimed.length ? (
          <p className="muted small no-margin">{q ? t('admin.noMatch') : t('admin.noClaims')}</p>
        ) : (
          <div className="follow-list">
            {claimed.map(([key, c]) => (
              <div key={key} className="follow-row admin-row">
                <button className="follow-main" onClick={() => openPlayer(key)}>
                  {c.photo ? (
                    <img className="admin-avatar" src={c.photo} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="admin-avatar">{(c.name ?? '?')[0].toUpperCase()}</span>
                  )}
                  <span className="admin-text">
                    <strong className="ellipsis">{nameOf(key)}</strong>
                    <span className="muted small ellipsis">
                      {c.name ?? t('admin.noName')} · {day(c.at)}
                    </span>
                  </span>
                </button>
                {hasLook(c) && (
                  <button
                    className="icon-btn"
                    aria-label={t('admin.clearLook')}
                    title={t('admin.clearLook')}
                    disabled={busy === key}
                    onClick={async () => {
                      if (await dialog.confirm(t('admin.clearLookConfirm', { p: nameOf(key) }), { ok: t('admin.clearLook') }))
                        run(key, () => clearClaimLook(key))
                    }}
                  >
                    <Icon name="image" size={18} />
                  </button>
                )}
                <button
                  className="icon-btn danger"
                  aria-label={t('admin.revoke')}
                  title={t('admin.revoke')}
                  disabled={busy === key || !user}
                  onClick={async () => {
                    const msg = t('admin.revokeConfirm', { p: nameOf(key), a: c.name ?? t('admin.noName') })
                    if (await dialog.confirm(msg, { ok: t('admin.revoke'), danger: true })) run(key, () => revokeClaim(user!, key, c))
                  }}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          {t('admin.revoked')}
          {blocked.length > 0 && <span className="muted small">{blocked.length}</span>}
        </div>
        {!blocked.length ? (
          <p className="muted small no-margin">{t('admin.noRevoked')}</p>
        ) : (
          <div className="follow-list">
            {blocked.map(([key, r]) => (
              <div key={key} className="follow-row admin-row">
                <button className="follow-main" onClick={() => openPlayer(key)}>
                  <span className="admin-text">
                    <strong className="ellipsis">{nameOf(key)}</strong>
                    <span className="muted small ellipsis">
                      {r.name ?? t('admin.noName')} · {day(r.at)}
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn"
                  aria-label={t('admin.unrevoke')}
                  title={t('admin.unrevoke')}
                  disabled={busy === key}
                  onClick={async () => {
                    const msg = t('admin.unrevokeConfirm', { p: nameOf(key), a: r.name ?? t('admin.noName') })
                    if (await dialog.confirm(msg, { ok: t('admin.unrevoke') })) run(key, () => unrevokeClaim(key))
                  }}
                >
                  <Icon name="undo" size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
