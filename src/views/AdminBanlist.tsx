import { useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import { BAN_LISTS, type Banlist, banlistMinus, useBanlist } from '../lib/banlist'
import { publishBanlist, readSiteBanlist } from '../lib/banlistSync'
import { BANLIST_URL } from '../config'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'

// The admin area's banlist: the one every app uses, and a button to read the site's and publish it.

function Summary({ b }: { b: Banlist }) {
  const { t, lang } = useI18n()
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <>
      {b.announcement && (
        <a className="link" href={b.announcement.url} target="_blank" rel="noopener noreferrer">
          {t('banlist.announcement', { d: day(b.announcement.date) })}
        </a>
      )}
      <p className="muted small no-margin">{t('banlist.counts', { b: b.banned.length, c: b.commander.length, p: b.partner.length })}</p>
    </>
  )
}

export default function AdminBanlist() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const dialog = useDialog()
  const current = useBanlist()
  const [busy, setBusy] = useState<'reading' | 'publishing' | null>(null)
  const [site, setSite] = useState<Banlist | null>(null)
  const [error, setError] = useState<string | null>(null)
  const when = (iso: string) => new Date(iso).toLocaleString(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const check = async () => {
    setBusy('reading')
    setError(null)
    setSite(null)
    try {
      setSite(await readSiteBanlist())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const added = site && banlistMinus(site, current)
  const removed = site && banlistMinus(current, site)
  const changes = site
    ? BAN_LISTS.flatMap((k) => [
        ...added![k].map((n) => ({ sign: '+', n, k })),
        ...removed![k].map((n) => ({ sign: '−', n, k })),
      ])
    : []
  const newDate = !!site && site.announcement?.date !== current.announcement?.date
  // the copy shipped with the app was never published: publishing it makes every app read the site's
  const worth = !!site && (changes.length > 0 || newDate || !!current.builtIn)

  return (
    <>
      <section className="card">
        <div className="card-title">{t('banlist.inUse')}</div>
        <Summary b={current} />
        <p className="muted small no-margin">{current.builtIn ? t('banlist.builtIn') : t('banlist.published', { d: when(current.checked) })}</p>
        <button className="btn primary" disabled={!!busy} onClick={check}>
          <Icon name="refresh" size={16} /> {busy === 'reading' ? t('banlist.reading') : t('banlist.check')}
        </button>
        <a className="btn ghost" href={BANLIST_URL} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={16} /> {t('banlist.openSite')}
        </a>
      </section>

      {error && (
        <section className="card">
          <div className="card-title">{t('banlist.site')}</div>
          <div className="notice warn">{t('banlist.error', { e: error })}</div>
        </section>
      )}

      {site && (
        <section className="card">
          <div className="card-title">{t('banlist.site')}</div>
          <Summary b={site} />
          {changes.length ? (
            <ul className="admin-notes ban-changes">
              {changes.map((c) => (
                <li key={c.sign + c.k + c.n} className={c.sign === '+' ? 'bad-text' : 'good-text'}>
                  {c.sign} {c.n} <span className="muted">({t(`banlist.kind.${c.k}`)})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small no-margin">{t(newDate ? 'banlist.sameCardsNewDate' : current.builtIn ? 'banlist.sameBuiltIn' : 'banlist.same')}</p>
          )}
          {worth && (
            <button
              className="btn primary"
              disabled={!!busy || !user}
              onClick={async () => {
                if (!(await dialog.confirm(t('banlist.publishConfirm'), { ok: t('banlist.publish') }))) return
                setBusy('publishing')
                try {
                  await publishBanlist(user!, site)
                  setSite(null)
                  await dialog.alert(t('banlist.publishedNow'))
                } catch {
                  await dialog.alert(t('admin.error'))
                } finally {
                  setBusy(null)
                }
              }}
            >
              <Icon name="upload" size={16} /> {t('banlist.publish')}
            </button>
          )}
        </section>
      )}
    </>
  )
}
