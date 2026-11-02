import { useState } from 'react'
import { useI18n } from '../i18n'
import { authErrorKey, useAuth } from '../lib/auth'
import { PRIVACY_URL } from '../config'

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function LoginForm({ why }: { why?: string }) {
  const { t } = useI18n()
  const auth = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'info'; text: string } | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      const key = authErrorKey(e)
      if (key) setMsg({ kind: 'err', text: t(key as Parameters<typeof t>[0]) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card form">
      <p className="muted small no-margin">{why ?? t('auth.why')}</p>
      <button className="btn google" disabled={busy} onClick={() => run(auth.signInGoogle)}>
        <GoogleLogo /> {t('auth.google')}
      </button>
      <div className="divider">
        <span>{t('auth.or')}</span>
      </div>
      <label>
        <span>Email</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </label>
      {msg && <div className={`notice ${msg.kind === 'err' ? 'warn' : ''}`}>{msg.text}</div>}
      <button
        className="btn primary"
        disabled={busy || !email || !pw}
        onClick={() => run(() => (mode === 'in' ? auth.signInEmail(email, pw) : auth.signUpEmail(email, pw)))}
      >
        {mode === 'in' ? t('auth.signIn') : t('auth.signUp')}
      </button>
      <div className="auth-links">
        <button className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
        {mode === 'in' && (
          <button
            className="link"
            disabled={busy}
            onClick={() =>
              email
                ? run(async () => {
                    await auth.resetPassword(email)
                    setMsg({ kind: 'info', text: t('auth.resetSent') })
                  })
                : setMsg({ kind: 'err', text: t('auth.resetNeedsEmail') })
            }
          >
            {t('auth.forgot')}
          </button>
        )}
      </div>
      <a className="muted small center" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
        {t('auth.privacy')}
      </a>
    </section>
  )
}
