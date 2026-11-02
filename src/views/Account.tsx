import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import { DEFAULT_THEME, SWATCHES, type Theme } from '../lib/theme'
import { Logo } from '../components/Logo'
import type { Deck } from '../lib/decks'
import type { Match } from '../lib/matches'
import { type Circuit, potyStatus } from '../lib/circuit'
import type { Prefs } from '../lib/prefs'
import type { TimerSettings } from '../lib/timer'
import { useSyncStatus } from '../lib/sync'
import { deleteAccount } from '../lib/account'
import { backupName, csvName, download, makeBackup, matchesCsv, mergeById, parseBackup } from '../lib/backup'
import { CHANGELOG } from '../lib/changelog'
import { BANLIST_URL, FORMAT_SITE_URL, PRIVACY_URL } from '../config'
import { Icon, Sheet } from '../components/ui'
import { useDialog } from '../components/Dialog'
import { ClaimBadge, type CircuitPrefs, VerifiedTick, placeLabel } from './Circuit'
import { newClaims, useIsAdmin } from '../lib/admin'
import { useBanlist } from '../lib/banlist'
import Admin from './Admin'
import { LoginForm } from '../components/LoginForm'
import { FeedbackSheet } from '../components/Feedback'
import type { Feedback } from '../lib/feedback'
import { cloudEnabled, useLiveCollection } from '../lib/firebase'
import { dropPush, pushBlock, savePush } from '../lib/push'

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-row">
      <span className="color-label">{label}</span>
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
        <label className="swatch custom" style={{ background: value }} aria-label="custom">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

function ThemeEditor({ theme, setTheme }: { theme: Theme; setTheme: (fn: (t: Theme) => Theme) => void }) {
  const { t } = useI18n()
  const set = <K extends keyof Theme>(k: K) => (v: Theme[K]) => setTheme((x) => ({ ...x, [k]: v }))
  return (
    <section className="card">
      <div className="stepper">
        <span>{t('theme.mode')}</span>
        <div className="seg">
          {(['auto', 'dark', 'light'] as const).map((m) => (
            <button key={m} className={theme.mode === m ? 'on' : ''} onClick={() => set('mode')(m)}>
              {t(`theme.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="stepper">
        <span>{t('theme.scale')}</span>
        <div className="seg">
          {(['S', 'M', 'L'] as const).map((s) => (
            <button key={s} className={theme.scale === s ? 'on' : ''} onClick={() => set('scale')(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <ColorRow label={t('theme.accent')} value={theme.accent} onChange={set('accent')} />
      <ColorRow label={t('theme.highlight')} value={theme.highlight} onChange={set('highlight')} />
      <ColorRow label={t('theme.p0')} value={theme.p0} onChange={set('p0')} />
      <ColorRow label={t('theme.p1')} value={theme.p1} onChange={set('p1')} />
      <div className="theme-preview" aria-hidden>
        <div className="tp-brand">
          <Logo size={40} />
          <div>
            <div className="brand-kicker">{t('app.slogan')}</div>
            <div className="tp-title">Castra</div>
          </div>
        </div>
        <span className="tp-btn">{t('home.newGame')}</span>
        <span className="tp-link">{t('home.seeAll')}</span>
        <span className="tp-p p0" />
        <span className="tp-p p1" />
      </div>
      <button className="btn ghost" onClick={() => setTheme(() => DEFAULT_THEME)}>
        <Icon name="refresh" size={16} /> {t('theme.reset')}
      </button>
    </section>
  )
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button className="toggle-row" role="switch" aria-checked={on} onClick={() => set(!on)}>
      <span className="toggle-text">
        {label}
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <span className={`switch ${on ? 'on' : ''}`} />
    </button>
  )
}

function Choice<V extends string>({ label, value, options, set }: { label: string; value: V; options: [V, string][]; set: (v: V) => void }) {
  return (
    <div className="pref-choice">
      <span>{label}</span>
      <div className="seg wide">
        {options.map(([v, text]) => (
          <button key={v} className={value === v ? 'on' : ''} onClick={() => set(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The circuit player linked to the account, and the followed ones. */
function CircuitIdentity({
  circuit,
  cp,
  openPlayer,
  findMe,
}: {
  circuit: Circuit | null
  cp: CircuitPrefs
  openPlayer: (key: string) => void
  findMe: () => void
}) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const poty = useMemo(() => circuit && potyStatus(circuit), [circuit])
  const byKey = useMemo(() => new Map(circuit?.players.map((p) => [p.key, p])), [circuit])
  const me = cp.me ? byKey.get(cp.me) : undefined
  const followed = cp.follow.map((k) => byKey.get(k)).filter((p) => !!p).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))

  return (
    <>
      <section className="card">
        <div className="card-title">{t('account.player')}</div>
        {!me || !poty ? (
          <div className="empty-inline">
            <p className="muted small">{cp.me && !circuit ? t('account.playerNoData') : t('circuit.linkPrompt')}</p>
            <button className="btn small primary" onClick={findMe}>
              <Icon name="userCheck" size={16} /> {t('circuit.findMe')}
            </button>
          </div>
        ) : (
          <>
            <button className="linked-player" onClick={() => openPlayer(me.key)}>
              <span className="linked-name">
                <strong className="ellipsis">{me.name}</strong>
                {cp.claims.get(me.key)?.uid === cp.uid && <ClaimBadge claim={cp.claims.get(me.key)!} />}
              </span>
              <Icon name="chevron" size={18} />
            </button>
            <div className="stats3 compact">
              <div>
                <div className="stat-num">{me.rank ? placeLabel(me.rank, lang) : '—'}</div>
                <div className="stat-label">{t('circuit.position')}</div>
              </div>
              <div>
                <div className="stat-num">{me.total}</div>
                <div className="stat-label">{t('circuit.points')}</div>
              </div>
              <div>
                <div className={`stat-num ${poty.isIn(me) ? 'good' : ''}`}>
                  {me.potyInvited ? t('account.potyInvited') : poty.isIn(me) ? t('account.potyIn') : t('account.potyOut')}
                </div>
                <div className="stat-label">POTY</div>
              </div>
            </div>
            <div className="btn-pair">
              <button className="btn ghost" onClick={findMe}>
                <Icon name="swap" size={16} /> {t('account.changePlayer')}
              </button>
              <button
                className="btn ghost"
                disabled={busy}
                onClick={async () => {
                  if (!(await dialog.confirm(t('account.unlinkConfirm', { n: me.name }), { ok: t('account.unlink'), danger: true }))) return
                  setBusy(true)
                  await cp.link(null).finally(() => setBusy(false))
                }}
              >
                <Icon name="close" size={16} /> {t('account.unlink')}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          {t('circuit.followed')}
          {followed.length > 0 && <span className="muted small">{followed.length}</span>}
        </div>
        {!followed.length ? (
          <p className="muted small no-margin">{t('account.followEmpty')}</p>
        ) : (
          <div className="follow-list">
            {followed.map((p) => (
              <div key={p.key} className="follow-row">
                <button className="follow-main" onClick={() => openPlayer(p.key)}>
                  <span className="follow-rank">{p.rank ? placeLabel(p.rank, lang) : '—'}</span>
                  <span className="follow-name ellipsis">
                    {p.name}
                    {cp.claims.get(p.key)?.verified && <VerifiedTick />}
                  </span>
                  <span className="muted small">{p.total} pt</span>
                </button>
                <button
                  className="icon-btn star-on"
                  aria-label={t('account.unfollow')}
                  onClick={() => cp.setFollow((f) => f.filter((k) => k !== p.key))}
                >
                  <Icon name="star" size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

type Notify = 'notifyCircuit' | 'notifyBanlist' | 'notifyAdmin'

/** The push notifications of the account: the first one turned on explains them before the phone asks. */
function Notifications({ uid, isAdmin, prefs, set }: { uid: string | null; isAdmin: boolean; prefs: Prefs; set: (k: Notify, v: boolean) => void }) {
  const { t } = useI18n()
  const dialog = useDialog()
  const [asking, setAsking] = useState<Notify | null>(null)
  const [block, setBlock] = useState(pushBlock)

  const activate = async (k: Notify) => {
    if ((await Notification.requestPermission()) !== 'granted') return setBlock(pushBlock())
    // the switch follows the answer at once: saving the device can take a few seconds the first time
    set(k, true)
    try {
      await savePush(uid!)
    } catch {
      set(k, false)
      await dialog.alert(t('push.error'))
    }
  }
  const turn = (k: Notify) => (on: boolean) => {
    if (!on) return set(k, false)
    if (Notification.permission === 'granted') activate(k)
    else setAsking(k)
  }
  const kinds: Notify[] = isAdmin ? ['notifyCircuit', 'notifyBanlist', 'notifyAdmin'] : ['notifyCircuit', 'notifyBanlist']

  return (
    <>
      <div className="pref-group">{t('push.title')}</div>
      {!uid ? (
        <div className="notice">{t('push.signIn')}</div>
      ) : block ? (
        <div className={`notice ${block === 'denied' ? 'warn' : ''}`}>{t(`push.${block}`)}</div>
      ) : (
        <>
          {kinds.map((k) => (
            <Toggle key={k} label={t(`push.${k}`)} hint={t(`push.${k}.hint`)} on={prefs[k]} set={turn(k)} />
          ))}
          <p className="muted small no-margin">{t('push.hint')}</p>
        </>
      )}
      <Sheet open={!!asking} onClose={() => setAsking(null)} title={t('push.ask')}>
        <div className="form">
          <p className="no-margin">{t('push.askText')}</p>
          <ul className="perm-list">
            {kinds.map((k) => (
              <li key={k}>
                <strong>{t(`push.${k}`)}</strong>: {t(`push.${k}.ask`)}
              </li>
            ))}
          </ul>
          <p className="muted small no-margin">{t('push.askNote')}</p>
          <button
            className="btn primary"
            onClick={() => {
              const k = asking!
              setAsking(null)
              activate(k)
            }}
          >
            {t('push.enable')}
          </button>
          <button className="btn ghost" onClick={() => setAsking(null)}>
            {t('push.later')}
          </button>
        </div>
      </Sheet>
    </>
  )
}

function Preferences({
  prefs,
  setPrefs,
  uid,
  isAdmin,
}: {
  prefs: Prefs
  setPrefs: (fn: (p: Prefs) => Prefs) => void
  uid: string | null
  isAdmin: boolean
}) {
  const { t, lang, setLang } = useI18n()
  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }))
  return (
    <section className="card">
      <div className="pref-group">{t('account.newMatches')}</div>
      <Choice
        label={t('account.format')}
        value={prefs.format}
        options={[
          ['last', t('account.lastUsed')],
          ['bo1', 'Bo1'],
          ['bo3', 'Bo3'],
        ]}
        set={set('format')}
      />
      <Choice
        label={t('match.kind')}
        value={prefs.kind}
        options={[
          ['last', t('account.lastUsed')],
          ['casual', t('match.casual')],
          ['tournament', t('match.tournament')],
        ]}
        set={set('kind')}
      />
      <div className="pref-group">{t('account.duringGame')}</div>
      <Toggle label={t('account.wake')} hint={t('account.wakeHint')} on={prefs.wake} set={set('wake')} />
      <Toggle label={t('account.haptics')} hint={t('account.hapticsHint')} on={prefs.haptics} set={set('haptics')} />
      <div className="pref-group">{t('circuit.title')}</div>
      <Toggle label={t('account.alerts')} hint={t('account.alertsHint')} on={prefs.circuitAlerts} set={set('circuitAlerts')} />
      <Notifications uid={uid} isAdmin={isAdmin} prefs={prefs} set={(k, v) => set(k)(v)} />
      <div className="pref-group">{t('common.lang')}</div>
      <div className="seg wide">
        {(['it', 'en'] as const).map((l) => (
          <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
            {l === 'it' ? 'Italiano' : 'English'}
          </button>
        ))}
      </div>
    </section>
  )
}

function SyncLine() {
  const { t, lang } = useI18n()
  const { pending, lastAt, failed } = useSyncStatus()
  const when = lastAt && new Date(lastAt).toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const state = !navigator.onLine ? 'offline' : failed ? 'error' : pending ? 'saving' : 'ok'
  return (
    <div className={`sync-line ${state}`}>
      <span className="sync-dot" />
      <div>
        <div>{t(`account.sync.${state}`)}</div>
        {when && <div className="muted small">{t('account.lastSync', { d: when })}</div>}
      </div>
    </div>
  )
}

function DataSection({
  decks,
  matches,
  restore,
  onDeleteAccount,
}: {
  decks: Deck[]
  matches: Match[]
  restore: (text: string) => void
  onDeleteAccount?: () => void
}) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const file = useRef<HTMLInputElement>(null)
  return (
    <section className="card">
      {user && <SyncLine />}
      <p className="muted small no-margin">{t('account.dataCounts', { d: decks.length, m: matches.length })}</p>
      <div className="data-actions">
        <button
          className="btn ghost"
          disabled={!matches.length}
          onClick={() => download(csvName(), matchesCsv(matches, new Map(decks.map((d) => [d.id, d.name])), lang), 'text/csv;charset=utf-8')}
        >
          <Icon name="download" size={16} /> {t('account.exportCsv')}
        </button>
        <button className="btn ghost" onClick={() => download(backupName(), JSON.stringify(makeBackup(decks, matches), null, 1), 'application/json')}>
          <Icon name="download" size={16} /> {t('account.backup')}
        </button>
        <button className="btn ghost" onClick={() => file.current?.click()}>
          <Icon name="upload" size={16} /> {t('account.restore')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = '' // the same file can be picked again
            if (f) restore(await f.text())
          }}
        />
      </div>
      <p className="muted small no-margin">{t('account.backupHint')}</p>
      {onDeleteAccount && (
        <button className="btn danger" onClick={onDeleteAccount}>
          <Icon name="trash" size={16} /> {t('account.delete')}
        </button>
      )}
    </section>
  )
}

const versionLabel = __BUILD__.date.split('-').join('.') + (__BUILD__.commit ? ` · ${__BUILD__.commit}` : '')

function Info() {
  const { t, lang } = useI18n()
  const [all, setAll] = useState(false)
  const releases = all ? CHANGELOG : CHANGELOG.slice(0, 1)
  return (
    <section className="card">
      <div className="pref-group">{t('account.whatsNew')}</div>
      {releases.map((r) => (
        <div key={r.date} className="release">
          <div className="muted small">{new Date(r.date).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <ul>
            {r[lang].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
      {CHANGELOG.length > 1 && (
        <button className="link" onClick={() => setAll(!all)}>
          {all ? t('account.lessNews') : t('account.allNews')}
        </button>
      )}
      <p className="muted small no-margin version-line">Castra · {t('account.version')} {versionLabel}</p>
    </section>
  )
}

export type AccountSection = 'login' | 'circuit' | 'prefs' | 'look' | 'data' | 'info' | 'admin'
const SECTIONS: AccountSection[] = ['login', 'circuit', 'prefs', 'look', 'data', 'info', 'admin']
export const isAccountSection = (s: string | null): s is AccountSection => SECTIONS.includes(s as AccountSection)

function MenuRow({ icon, label, note, onClick }: { icon: string; label: string; note?: string; onClick: () => void }) {
  return (
    <button className="menu-row" onClick={onClick}>
      <Icon name={icon} size={20} />
      <span className="menu-label">{label}</span>
      {note && <span className="muted small ellipsis menu-note">{note}</span>}
      <Icon name="chevron" size={16} />
    </button>
  )
}

/**
 * The account card at the top of the menu: who is signed in and their circuit player. A tap opens that player's
 * card or, when no player is linked yet, the circuit section where to link one.
 */
function ProfileCard({
  circuit,
  cp,
  onLogin,
  openPlayer,
  onLink,
}: {
  circuit: Circuit | null
  cp: CircuitPrefs
  onLogin: () => void
  openPlayer: (key: string) => void
  onLink: () => void
}) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const poty = useMemo(() => circuit && potyStatus(circuit), [circuit])
  const me = cp.me ? circuit?.players.find((p) => p.key === cp.me) : undefined
  if (!user)
    return (
      <section className="card profile-card">
        <div className="profile">
          <span className="avatar empty">
            <Icon name="user" size={26} />
          </span>
          <p className="muted small no-margin">{t('auth.why')}</p>
        </div>
        <button className="btn primary" onClick={onLogin}>
          {t('auth.signIn')}
        </button>
      </section>
    )
  // linked but the circuit not loaded yet: nothing to open
  const open = me ? () => openPlayer(me.key) : !cp.me ? onLink : undefined
  return (
    <section className="card profile-card">
      <button className="profile profile-link" onClick={open} disabled={!open}>
        {user.photo ? <img src={user.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(user.name ?? user.email ?? '?')[0].toUpperCase()}</span>}
        <div className="profile-text">
          <strong className="ellipsis">{user.name ?? user.email}</strong>
          {me && poty ? (
            <span className="muted small ellipsis">
              {me.rank ? placeLabel(me.rank, lang) : '—'} · {me.total} pt ·{' '}
              {me.potyInvited ? t('circuit.potyInvited') : poty.isIn(me) ? t('circuit.potyZone') : t('account.potyHeadOut')}
            </span>
          ) : (
            user.name && <span className="muted small ellipsis">{user.email}</span>
          )}
          {!cp.me && <span className="link">{t('account.linkName')}</span>}
          {me && cp.claims.get(me.key)?.uid === cp.uid && <ClaimBadge claim={cp.claims.get(me.key)!} />}
        </div>
        {open && (
          <span className="chev">
            <Icon name="chevron" size={16} />
          </span>
        )}
      </button>
    </section>
  )
}

export default function Account({
  section,
  openSection,
  theme,
  setTheme,
  prefs,
  setPrefs,
  setTimerSettings,
  decks,
  setDecks,
  matches,
  setMatches,
  circuit,
  circuitPrefs,
  openPlayer,
  findMe,
  onBack,
  onSignOut,
}: {
  section: AccountSection | null
  openSection: (s: AccountSection) => void
  theme: Theme
  setTheme: (fn: (t: Theme) => Theme) => void
  prefs: Prefs
  setPrefs: (fn: (p: Prefs) => Prefs) => void
  setTimerSettings: (fn: (s: TimerSettings) => TimerSettings) => void
  decks: Deck[]
  setDecks: (fn: (d: Deck[]) => Deck[]) => void
  matches: Match[]
  setMatches: (fn: (m: Match[]) => Match[]) => void
  circuit: Circuit | null
  circuitPrefs: CircuitPrefs
  openPlayer: (key: string) => void
  findMe: () => void
  onBack: () => void
  /** clears this device's copy of the account's data */
  onSignOut: () => void
}) {
  const { t, lang, setLang } = useI18n()
  const dialog = useDialog()
  const { user, ready, signOut } = useAuth()
  const sync = useSyncStatus()
  const isAdmin = useIsAdmin(user?.uid ?? null)
  // only admins can read the reports: one listener for the badge here and the list in the admin area
  const feedback = useLiveCollection<Feedback>(isAdmin ? 'feedback' : null).docs
  // what the admin area has to show: new linked players and reports to check
  const toSee = isAdmin ? newClaims(circuitPrefs.claims) + feedback.filter(([, f]) => !f.done).length : 0
  const [reporting, setReporting] = useState(false)
  // the latest banlist update, read from the format's site every night
  const { announcement } = useBanlist()
  const banlistDate = announcement && new Date(announcement.date).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  const [deleting, setDeleting] = useState(false)

  // signed in from the login page: back to the menu
  useEffect(() => {
    if (section === 'login' && user) onBack()
  }, [section, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const restore = async (text: string) => {
    const b = parseBackup(text)
    if (!b) return dialog.alert(t('account.restoreInvalid'))
    if (!(await dialog.confirm(t('account.restoreConfirm', { d: b.decks.length, m: b.matches.length }), { ok: t('account.restore') }))) return
    setDecks((ds) => mergeById(ds, b.decks))
    setMatches((ms) => mergeById(ms, b.matches))
    const s = b.settings
    if (s['cc.theme']) setTheme(() => ({ ...DEFAULT_THEME, ...(s['cc.theme'] as Theme) }))
    if (s['cc.prefs']) setPrefs((p) => ({ ...p, ...(s['cc.prefs'] as Prefs) }))
    if (Array.isArray(s['cc.circuit.follow'])) circuitPrefs.setFollow(() => s['cc.circuit.follow'] as string[])
    if (s['cc.lang'] === 'it' || s['cc.lang'] === 'en') setLang(s['cc.lang'])
    if (s['cc.timerSettings']) setTimerSettings((x) => ({ ...x, ...(s['cc.timerSettings'] as TimerSettings) }))
    dialog.alert(t('account.restored', { d: b.decks.length, m: b.matches.length }))
  }

  const removeAccount = async () => {
    if (!user) return
    if (!(await dialog.confirm(t('account.deleteConfirm'), { ok: t('account.delete'), danger: true }))) return
    setDeleting(true)
    const owned = circuitPrefs.me && circuitPrefs.claims.get(circuitPrefs.me)?.uid === user.uid ? circuitPrefs.me : null
    try {
      const outcome = await deleteAccount(user, owned)
      if (outcome === 'reauth') await dialog.alert(t('account.deleteReauth'))
      if (outcome === 'done') {
        onSignOut()
        await dialog.alert(t('account.deleted'))
        onBack()
      }
    } catch {
      await dialog.alert(t('account.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  const titles: Record<AccountSection, string> = {
    login: t('auth.signIn'),
    circuit: t('account.circuit'),
    prefs: t('account.prefs'),
    look: t('theme.title'),
    data: t('account.data'),
    info: t('account.infoLinks'),
    admin: t('admin.title'),
  }
  const syncNote = !user
    ? t('account.matchesCount', { m: matches.length })
    : t(`account.syncShort.${!navigator.onLine ? 'offline' : sync.failed ? 'error' : sync.pending ? 'saving' : 'ok'}`)

  return (
    <div className="page">
      <header className="page-head">
        <div className="head-left">
          <button className="icon-btn" onClick={onBack} aria-label="back">
            <Icon name="back" />
          </button>
          <h1>{section ? titles[section] : t('account.title')}</h1>
        </div>
      </header>

      {!section ? (
        <>
          {!cloudEnabled ? (
            <div className="notice">{t('auth.notConfigured')}</div>
          ) : !ready ? (
            <div className="empty">…</div>
          ) : (
            <ProfileCard
              circuit={circuit}
              cp={circuitPrefs}
              onLogin={() => openSection('login')}
              openPlayer={openPlayer}
              onLink={() => openSection('circuit')}
            />
          )}
          <section className="card menu-card">
            <MenuRow
              icon="trophy"
              label={titles.circuit}
              note={circuitPrefs.follow.length ? t('account.followCount', { n: circuitPrefs.follow.length }) : undefined}
              onClick={() => openSection('circuit')}
            />
            <MenuRow icon="gear" label={titles.prefs} onClick={() => openSection('prefs')} />
            <MenuRow icon="palette" label={titles.look} onClick={() => openSection('look')} />
            <MenuRow icon="database" label={titles.data} note={syncNote} onClick={() => openSection('data')} />
            <MenuRow icon="info" label={titles.info} note={versionLabel.split(' · ')[0]} onClick={() => openSection('info')} />
            {isAdmin && (
              <MenuRow
                icon="shield"
                label={titles.admin}
                note={toSee ? t('feedback.open', { n: toSee }) : undefined}
                onClick={() => openSection('admin')}
              />
            )}
          </section>
          <section className="card menu-card">
            <MenuRow icon="chat" label={t('feedback.menu')} onClick={() => setReporting(true)} />
            {(
              [
                ['globe', 'account.formatSite', FORMAT_SITE_URL],
                ['ban', 'account.banlist', BANLIST_URL],
                ['shield', 'account.privacy', PRIVACY_URL],
              ] as const
            ).map(([icon, label, href]) => (
              <a key={href} className="menu-row" href={href} target="_blank" rel="noopener noreferrer">
                <Icon name={icon} size={20} />
                <span className="menu-label">{t(label)}</span>
                {href === BANLIST_URL && banlistDate && <span className="muted small ellipsis menu-note">{t('account.banlistUpdated', { d: banlistDate })}</span>}
                <Icon name="external" size={16} />
              </a>
            ))}
          </section>
          {user && (
            <section className="card menu-card">
              <button
                className="menu-row danger"
                onClick={async () => {
                  if (!(await dialog.confirm(t('auth.signOutConfirm'), { ok: t('auth.signOut') }))) return
                  await dropPush(user.uid)
                  await signOut()
                  onSignOut()
                }}
              >
                <Icon name="logout" size={20} />
                <span className="menu-label">{t('auth.signOut')}</span>
              </button>
            </section>
          )}
        </>
      ) : section === 'login' ? (
        <LoginForm />
      ) : section === 'circuit' ? (
        <CircuitIdentity circuit={circuit} cp={circuitPrefs} openPlayer={openPlayer} findMe={findMe} />
      ) : section === 'prefs' ? (
        <Preferences prefs={prefs} setPrefs={setPrefs} uid={user?.uid ?? null} isAdmin={isAdmin} />
      ) : section === 'look' ? (
        <ThemeEditor theme={theme} setTheme={setTheme} />
      ) : section === 'data' ? (
        <DataSection decks={decks} matches={matches} restore={restore} onDeleteAccount={user && !deleting ? removeAccount : undefined} />
      ) : section === 'admin' ? (
        isAdmin ? (
          <Admin circuit={circuit} claims={circuitPrefs.claims} openPlayer={openPlayer} feedback={feedback} />
        ) : (
          <div className="notice">{t('admin.notAdmin')}</div>
        )
      ) : (
        <Info />
      )}
      <FeedbackSheet open={reporting} onClose={() => setReporting(false)} />
    </div>
  )
}
