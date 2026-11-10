import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import { FEEDBACK_KINDS, type FeedbackKind, sendFeedback } from '../lib/feedback'
import { Icon, Sheet } from './ui'
import { LoginForm } from './LoginForm'

/** "Report": the sheet that sends a message to the admins, about the page it was opened from when `about` is set. */
export function FeedbackSheet({ open, onClose, about }: { open: boolean; onClose: () => void; about?: string }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [kind, setKind] = useState<FeedbackKind>(about ? 'data' : 'bug')
  const [text, setText] = useState('')
  const [reply, setReply] = useState(true)
  const [linked, setLinked] = useState(true)
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'offline'>('idle')
  const [sent, setSent] = useState(false)

  const send = async () => {
    // offline the write would wait for the connection with the sheet stuck on "sending"
    if (!navigator.onLine) return setState('offline')
    setState('busy')
    try {
      const page = about && linked ? location.hash : null
      await sendFeedback(user!, { kind, text: text.trim(), page, about: page ? about! : null }, reply)
      setText('')
      setLinked(true)
      setState('idle')
      onClose()
      setSent(true)
      setTimeout(() => setSent(false), 2000)
    } catch {
      setState('error')
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t('feedback.title')}>
        {!user ? (
          <LoginForm why={t('feedback.signIn')} />
        ) : (
          <div className="form">
            {about && linked && (
              <div className="fb-about">
                <Icon name="flag" size={18} />
                <span className="grow">
                  <span className="muted small">{t('feedback.about')}</span>
                  <strong className="ellipsis">{about}</strong>
                </span>
                <button className="icon-btn" onClick={() => setLinked(false)} aria-label={t('feedback.unlink')}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            <div className="fb-kinds">
              {FEEDBACK_KINDS.map((k) => (
                <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                  {t(`feedback.kind.${k}`)}
                </button>
              ))}
            </div>
            <label>
              <span>{t(kind === 'data' ? 'feedback.textData' : kind === 'idea' ? 'feedback.textIdea' : 'feedback.textBug')}</span>
              <textarea className="fb-text" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            {user.email && (
              <button className="toggle-row" role="switch" aria-checked={reply} onClick={() => setReply(!reply)}>
                <span className="toggle-text">
                  {t('feedback.reply')}
                  <span className="muted small">{t('feedback.replyHint', { email: user.email })}</span>
                </span>
                <span className={`switch ${reply ? 'on' : ''}`} />
              </button>
            )}
            <p className="muted small no-margin">{t('feedback.device')}</p>
            {state === 'error' || state === 'offline' ? (
              <div className="notice warn">{t(state === 'offline' ? 'feedback.offline' : 'feedback.error')}</div>
            ) : null}
            <button className="btn primary" disabled={!text.trim() || state === 'busy'} onClick={send}>
              {t('feedback.send')}
            </button>
          </div>
        )}
      </Sheet>
      {sent && <div className="toast">{t('feedback.sent')}</div>}
    </>
  )
}

/** The flag next to "share" on a circuit page: reports a mistake in what the page shows. */
export function ReportButton({ about }: { about: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label={t('feedback.report')}>
        <Icon name="flag" />
      </button>
      {/* out of the page's sticky head, whose stacking would keep the sheet under the tab bar */}
      {createPortal(<FeedbackSheet open={open} onClose={() => setOpen(false)} about={about} />, document.body)}
    </>
  )
}
