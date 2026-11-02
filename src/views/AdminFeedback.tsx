import { useState } from 'react'
import { useI18n } from '../i18n'
import { type Feedback, deleteFeedback, setFeedbackDone } from '../lib/feedback'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'

// The reports sent from the app ("Report" in the profile, the flag on circuit pages), newest first.
export default function AdminFeedback({ feedback }: { feedback: [string, Feedback][] }) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const open = feedback.filter(([, f]) => !f.done).length
  const shown = feedback.filter(([, f]) => f.done === done).sort((a, b) => b[1].at.localeCompare(a[1].at))
  const when = (iso: string) => new Date(iso).toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id)
    try {
      await fn()
    } catch {
      await dialog.alert(t('admin.error'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card">
      <div className="card-title">
        {t('admin.tab.feedback')}
        <span className="muted small">{t('feedback.open', { n: open })}</span>
      </div>
      <div className="seg wide">
        <button className={done ? '' : 'on'} onClick={() => setDone(false)}>
          {t('feedback.toSee', { n: open })}
        </button>
        <button className={done ? 'on' : ''} onClick={() => setDone(true)}>
          {t('feedback.done', { n: feedback.length - open })}
        </button>
      </div>
      {!shown.length ? (
        <p className="muted small no-margin">{t(done ? 'feedback.noneDone' : 'feedback.none')}</p>
      ) : (
        shown.map(([id, f]) => (
          <div key={id} className="fb-item">
            <div className="fb-top">
              <span className={`tag ${f.kind}`}>{t(`feedback.kind.${f.kind}`)}</span>
              <span className="muted small">{when(f.at)}</span>
            </div>
            <div className="fb-msg">{f.text}</div>
            {f.page && (
              <a className="link" href={f.page}>
                <Icon name="flag" size={14} /> {f.about ?? f.page}
              </a>
            )}
            <div className="muted small">
              {f.name ?? t('admin.noName')} · {f.email ?? t('feedback.noReply')}
            </div>
            <div className="muted small">
              {f.version} · {f.device}
            </div>
            <div className="fb-actions">
              {f.email && (
                <a
                  className="btn small"
                  href={`mailto:${f.email}?subject=${encodeURIComponent(t('feedback.mailSubject'))}&body=${encodeURIComponent(`\n\n> ${f.text.replace(/\n/g, '\n> ')}`)}`}
                >
                  <Icon name="mail" size={16} /> {t('feedback.answer')}
                </a>
              )}
              <button className="btn small" disabled={busy === id} onClick={() => run(id, () => setFeedbackDone(id, !f.done))}>
                <Icon name={f.done ? 'undo' : 'check'} size={16} /> {t(f.done ? 'feedback.reopen' : 'feedback.markDone')}
              </button>
              <button
                className="icon-btn"
                aria-label={t('feedback.delete')}
                title={t('feedback.delete')}
                disabled={busy === id}
                onClick={async () => {
                  if (await dialog.confirm(t('feedback.deleteConfirm'), { ok: t('feedback.delete'), danger: true })) run(id, () => deleteFeedback(id))
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
