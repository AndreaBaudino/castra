import { type ReactNode, createContext, useCallback, useContext, useState } from 'react'
import { useI18n } from '../i18n'
import { useBackCloses } from './ui'

// Castra's own confirm/alert: the browser's ones carry the site address as their title.

interface Ask {
  message: string
  ok?: string
  danger?: boolean // the confirm button deletes something
  alert?: boolean // just an OK
  resolve: (ok: boolean) => void
}

interface DialogApi {
  confirm: (message: string, opts?: { ok?: string; danger?: boolean }) => Promise<boolean>
  alert: (message: string) => Promise<void>
}

const Ctx = createContext<DialogApi>(null!)

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [ask, setAsk] = useState<Ask | null>(null)

  const confirm = useCallback<DialogApi['confirm']>((message, opts) => new Promise((resolve) => setAsk({ message, ...opts, resolve })), [])
  const alert = useCallback<DialogApi['alert']>((message) => new Promise((resolve) => setAsk({ message, alert: true, resolve: () => resolve() })), [])

  const close = (ok: boolean) => {
    ask?.resolve(ok)
    setAsk(null)
  }
  useBackCloses(!!ask, () => close(false), 'dialog')

  return (
    <Ctx.Provider value={{ confirm, alert }}>
      {children}
      {ask && (
        <div className="dialog-backdrop" onClick={() => close(false)}>
          <div className="dialog" role="alertdialog" aria-modal aria-labelledby="dialog-title" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head" id="dialog-title">
              <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
              Castra
            </div>
            <p>{ask.message}</p>
            <div className="dialog-actions">
              {!ask.alert && (
                <button className="btn ghost" onClick={() => close(false)}>
                  {t('common.cancel')}
                </button>
              )}
              <button className={`btn ${ask.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} autoFocus>
                {ask.ok ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useDialog = () => useContext(Ctx)
