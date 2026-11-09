import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { I18nProvider } from './i18n'
import { AuthProvider } from './lib/auth'
import { DialogProvider } from './components/Dialog'

// #screen/<id>: the tournament's screen for the room, alone, without the app around it
const screen = location.hash.match(/^#screen\/(.+)/)?.[1]
const RoomScreen = lazy(() => import('./views/RoomScreen'))
if (screen) document.documentElement.dataset.theme = 'dark' // a projector reads light on dark best

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {screen ? (
        <Suspense>
          <RoomScreen id={decodeURIComponent(screen)} />
        </Suspense>
      ) : (
        <AuthProvider>
          <DialogProvider>
            <App />
          </DialogProvider>
        </AuthProvider>
      )}
    </I18nProvider>
  </StrictMode>,
)
