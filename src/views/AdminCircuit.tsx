import { useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../lib/auth'
import { fetchCircuit } from '../lib/circuit'
import { BUILT_IN_YEAR, type CircuitSheet, TAB_KEYS, deleteCircuitSheet, saveCircuitSheet, sheetIdOf, tabIdOf, useCircuitSheets } from '../lib/circuits'
import { POTY_SPOTS } from '../config'
import { Icon } from '../components/ui'
import { useDialog } from '../components/Dialog'

// In the admin area's tournaments, for the year picked there: the circuit's leaderboard sheet of that year. A copy of
// last year's sheet keeps its tabs' ids, so a new year usually needs only the new link.

const sheetUrl = (s: CircuitSheet) => `https://docs.google.com/spreadsheets/d/${s.sheet}/edit#gid=${s.tabs.leaderboard}`

function SheetForm({ year, initial, onDone }: { year: number; initial: CircuitSheet; onDone: () => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [link, setLink] = useState(initial.year === year ? initial.sheet : '')
  const [tabs, setTabs] = useState<Record<string, string>>({ ...initial.tabs })
  const [poty, setPoty] = useState(String(initial.poty))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const sheet = (): CircuitSheet | string => {
    const id = sheetIdOf(link)
    if (!id) return t('circuitSheet.err.link')
    const ids = Object.fromEntries(TAB_KEYS.map((k) => [k, tabIdOf(tabs[k] ?? '')]))
    if (TAB_KEYS.some((k) => !ids[k])) return t('circuitSheet.err.tab')
    const n = Number(poty)
    if (!Number.isInteger(n) || n < 1 || n > 100) return t('circuitSheet.err.poty')
    return { year, sheet: id, tabs: ids as unknown as CircuitSheet['tabs'], poty: n }
  }
  const run = async (save: boolean) => {
    const s = sheet()
    if (typeof s === 'string') return setMsg({ ok: false, text: s })
    setBusy(true)
    setMsg(null)
    try {
      // read before saving: a sheet that doesn't read as a leaderboard isn't published
      const c = await fetchCircuit(s).catch(() => null)
      if (!c) return setMsg({ ok: false, text: t('circuitSheet.err.read') })
      if (!save) return setMsg({ ok: true, text: t('circuitSheet.read', { p: c.players.length, e: c.events.length }) })
      await saveCircuitSheet(user!, s)
      onDone()
    } catch {
      setMsg({ ok: false, text: t('admin.error') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card form">
      <div className="card-title">{t('circuitSheet.title', { y: year })}</div>
      <label>
        <span>{t('circuitSheet.link')}</span>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" />
      </label>
      <p className="muted small no-margin">{t('circuitSheet.tabsHint')}</p>
      {TAB_KEYS.map((k) => (
        <label key={k}>
          <span>{t(`circuitSheet.tab.${k}`)}</span>
          <input value={tabs[k] ?? ''} onChange={(e) => setTabs((x) => ({ ...x, [k]: e.target.value }))} inputMode="url" autoComplete="off" />
        </label>
      ))}
      <label>
        <span>{t('circuitSheet.poty')}</span>
        <input value={poty} onChange={(e) => setPoty(e.target.value)} inputMode="numeric" />
      </label>
      {msg && <div className={`notice ${msg.ok ? '' : 'warn'}`}>{msg.text}</div>}
      <button className="btn ghost" disabled={busy} onClick={() => run(false)}>
        <Icon name="refresh" size={16} /> {t('circuitSheet.test')}
      </button>
      <div className="btn-pair">
        <button className="btn ghost" disabled={busy} onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button className="btn primary" disabled={busy || !user} onClick={() => run(true)}>
          {t('sources.save')}
        </button>
      </div>
    </section>
  )
}

export default function AdminCircuit({ year }: { year: number }) {
  const { t } = useI18n()
  const dialog = useDialog()
  const sheets = useCircuitSheets()
  const [editing, setEditing] = useState(false)
  const own = sheets.find((s) => s.year === year)
  // a new year starts from the closest year before it: same tabs, same POTY spots
  const base = own ?? sheets.find((s) => s.year < year) ?? sheets[sheets.length - 1] ?? { year: 0, sheet: '', tabs: { leaderboard: '', s1: '', s2: '', events: '' }, poty: POTY_SPOTS }

  if (editing) return <SheetForm year={year} initial={base} onDone={() => setEditing(false)} />
  return (
    <section className="card">
      <div className="card-title">{t('circuitSheet.title', { y: year })}</div>
      {own ? (
        <>
          <a className="link" href={sheetUrl(own)} target="_blank" rel="noopener noreferrer">
            {t('circuitSheet.open')}
          </a>
          <p className="muted small no-margin">{t('circuitSheet.summary', { n: own.poty })}</p>
        </>
      ) : (
        <p className="muted small no-margin">{t('circuitSheet.none', { y: year })}</p>
      )}
      <div className="btn-pair">
        <button className="btn ghost" onClick={() => setEditing(true)}>
          <Icon name={own ? 'edit' : 'plus'} size={16} /> {own ? t('circuitSheet.edit') : t('circuitSheet.set')}
        </button>
        {own && year !== BUILT_IN_YEAR && (
          <button
            className="btn danger"
            onClick={async () => {
              if (!(await dialog.confirm(t('circuitSheet.deleteConfirm', { y: year }), { ok: t('sources.delete'), danger: true }))) return
              await deleteCircuitSheet(year).catch(() => dialog.alert(t('admin.error')))
            }}
          >
            <Icon name="trash" size={16} /> {t('sources.delete')}
          </button>
        )}
      </div>
    </section>
  )
}
