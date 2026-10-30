import { useI18n } from '../i18n'
import type { AppUser } from '../lib/auth'
import { Icon } from './ui'
import { Logo } from './Logo'

type Main = 'home' | 'meta' | 'stats' | 'decks' | 'cards'
const LINKS: Main[] = ['home', 'meta', 'stats', 'decks', 'cards']
const ICONS: Partial<Record<Main, string>> = { meta: 'trophy', cards: 'search' }

/** The desktop's menu, in place of the phone's tab bar: brand, the game button, the main pages and the account. */
export function SideNav({
  tab,
  go,
  user,
  gameInProgress,
}: {
  tab: string
  go: (tab: Main | 'game' | 'account') => void
  user: AppUser | null
  gameInProgress: boolean
}) {
  const { t } = useI18n()
  return (
    <aside className="sidenav">
      <div className="brand-mark">
        <Logo size={44} />
        <div>
          <div className="brand-kicker">{t('app.slogan')}</div>
          <div className="sidenav-name">Castra</div>
        </div>
      </div>

      <button className={`hero-btn ${tab === 'game' ? 'on' : ''}`} onClick={() => go('game')}>
        <span className="hero-icon">
          <Icon name="game" size={20} />
        </span>
        <span className="hero-text">
          <strong>{gameInProgress ? t('home.resumeGame') : t('home.newGame')}</strong>
          <span>{gameInProgress ? t('home.resumeSub') : t('home.newGameSub')}</span>
        </span>
      </button>

      <nav className="sidenav-links">
        {LINKS.map((l) => (
          <button key={l} className={tab === l ? 'on' : ''} onClick={() => go(l)} aria-current={tab === l ? 'page' : undefined}>
            <Icon name={ICONS[l] ?? l} size={20} />
            {t(`nav.${l}`)}
          </button>
        ))}
      </nav>

      <button className={`sidenav-account ${tab === 'account' ? 'on' : ''}`} onClick={() => go('account')}>
        {user?.photo ? (
          <img src={user.photo} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar">{user ? (user.name ?? user.email ?? '?')[0].toUpperCase() : <Icon name="user" size={18} />}</span>
        )}
        {user ? (
          <span className="ellipsis">{user.name ?? user.email}</span>
        ) : (
          // signed out: what the page is, and what it's for
          <span className="sidenav-who">
            {t('account.title')}
            <small>{t('auth.signInOrUp')}</small>
          </span>
        )}
      </button>
    </aside>
  )
}
