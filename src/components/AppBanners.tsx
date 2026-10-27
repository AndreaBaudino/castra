import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useI18n } from '../i18n'
import { useStoredState } from '../lib/storage'
import { Icon } from './ui'

// Two notices at the top of the home page: a new version is ready, and "install the app" for those using it
// from the browser.

const CHECK_EVERY_MS = 60 * 60_000

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

// the install event can fire before the home page is shown: keep it from the start
let installEvent: InstallPromptEvent | null = null
const installListeners = new Set<() => void>()
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // we show our own banner
  installEvent = e as InstallPromptEvent
  installListeners.forEach((l) => l())
})

export function UpdateBanner() {
  const { t } = useI18n()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return
      // an installed app can stay open for days: look for a new version now and then, and when it comes back
      setInterval(() => reg.update().catch(() => {}), CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}))
    },
  })
  if (!needRefresh) return null
  return (
    <div className="app-banner update">
      <Icon name="refresh" size={18} />
      <span>{t('app.update')}</span>
      <button className="btn small primary" onClick={() => updateServiceWorker(true)}>
        {t('app.updateNow')}
      </button>
      <button className="icon-btn" onClick={() => setNeedRefresh(false)} aria-label={t('life.close')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

export function InstallBanner() {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useStoredState('cc.installDismissed', false)
  const [, rerender] = useState(0)
  useEffect(() => {
    const l = () => rerender((n) => n + 1)
    installListeners.add(l)
    addEventListener('appinstalled', l)
    return () => {
      installListeners.delete(l)
      removeEventListener('appinstalled', l)
    }
  }, [])
  if (dismissed || standalone()) return null
  const ios = isIos()
  if (!installEvent && !ios) return null
  return (
    <div className="app-banner install">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
      <span>
        <b>{t('app.install')}</b>
        <span className="muted small">{ios ? t('app.installIos') : t('app.installHint')}</span>
      </span>
      {!ios && (
        <button
          className="btn small primary"
          onClick={async () => {
            if (!installEvent) return
            await installEvent.prompt()
            const { outcome } = await installEvent.userChoice
            installEvent = null
            if (outcome === 'accepted') setDismissed(true)
            rerender((n) => n + 1)
          }}
        >
          {t('app.installNow')}
        </button>
      )}
      <button className="icon-btn" onClick={() => setDismissed(true)} aria-label={t('life.close')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
