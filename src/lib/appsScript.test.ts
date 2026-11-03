import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// The Apps Script that writes a tournament run in the app into its sheet and takes it off again
// (scripts/meta/apps-script/Code.gs), run here on sheets kept in memory, laid out as the real ones: a league stage's
// tab, its "Classifica" and "Comandanti". Firestore keeps what the script writes, as the real one would.

type Cell = string | number | boolean | null | { f: string; v?: string }
type Grid = Cell[][]

const code = readFileSync(new URL('../../scripts/meta/apps-script/Code.gs', import.meta.url), 'utf8')

function sheet(name: string, grid: Grid) {
  const at = (r: number, c: number) => grid[r]?.[c] ?? null
  // as the sheet shows it: a leading apostrophe only says "text"
  const shown = (v: Cell) =>
    v == null ? '' : typeof v === 'object' ? (v.v ?? '') : typeof v === 'boolean' ? String(v).toUpperCase() : String(v).replace(/^'/, '')
  return {
    grid,
    getName: () => name,
    getMaxRows: () => grid.length,
    getRange: (r: number, c: number, nr = 1, nc = 1) => {
      const cells = (fn: (v: Cell) => unknown) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => fn(at(r - 1 + i, c - 1 + j))))
      // a date from the script's own realm: kept as the local day it means
      const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const set = (vals: unknown[][]) =>
        vals.forEach((row, i) =>
          row.forEach((v, j) => ((grid[r - 1 + i] ??= [])[c - 1 + j] = Object.prototype.toString.call(v) === '[object Date]' ? day(v as Date) : (v as Cell))),
        )
      return {
        getDisplayValues: () => cells(shown),
        getFormulas: () => cells((v) => (v && typeof v === 'object' ? v.f : '')),
        setValues: set,
        setValue: (v: unknown) => set([[v]]),
      }
    },
  }
}

const rows = (n: number, fill: (i: number) => Cell[]) => Array.from({ length: n }, (_, i) => fill(i))
// a stage's tab: the date under "Data", the header on row 5, 15 rows (the BYE boxes unticked), then a report formula
const stageTab = (): Grid => [
  [],
  [null, 'TAPPA 17', 'Data', 'Giocatori'],
  [null, 'TAPPA 17', null, { f: 'COUNTA(B6:B247)', v: '0' }],
  [],
  [{ f: 'COUNTA(B6:B247)' }, 'Nome giocatore', 'Comandante', 'Punti', 'Vittorie', 'Sconfitte', 'Pareggi', 'BYE', 'Link lista'],
  ...rows(15, () => [{ f: 'IF(ISBLANK(B6),"-",ROW(B6)-5)', v: '-' }, null, null, { f: 'IF(B6="","",E6*3+G6)' }, null, null, null, false, null]),
  [null, { f: 'CONCATENATE(…)', v: 'report' }],
]
// the league's players: two, two free rows of the table (formulas in C), then a row outside it
const classifica = (): Grid => [
  ...rows(9, () => []),
  [null, 'Nome giocatore', 'Nome lega'],
  [1, 'Anna Rossi', { f: '$B$3', v: 'Savona' }],
  [2, "Leonardo Crifo'", { f: '$B$3', v: 'Savona' }],
  [3, null, { f: '$B$3', v: 'Savona' }],
  [4, null, { f: '$B$3', v: 'Savona' }],
  [5, null, null],
]
// the commanders: one free row on top, then the database's formula
const comandanti = (): Grid => [
  [null, 'Se vuoi aggiungere un comandante…'],
  [null, 'Commander'],
  [null, 'Kinnan, Bonder Prodigy'],
  [null, null],
  [null, { f: 'SORT(UNIQUE(IMPORTRANGE(…)))', v: 'Aang, Swift Savior' }],
  [null, 'Atraxa, Grand Unifier'],
  [null, 'Spider-Man 2099'],
]

const DRIVE = '1Qck40xjQ_zODQtI3YY6qFGFq1adeHsMiUCwPIhZ7mvw'
const TID = `${DRIVE}~17`
const row = (name: string, commander: string | null, w: number, l: number, d = 0, bye = false, list = '') => ({ name, commander, w, l, d, bye, list })
const RESULTS = [
  // as playerKey compares them: the sheet's spelling wins
  row("leonardo  CRIFO'", 'Spider-Man 2099', 3, 0, 0, false, 'https://moxfield.com/decks/Ab3_x-9QzK'),
  row('Dario Neri', 'kinnan, bonder prodigy', 2, 1, 0, true), // a new player; the commander spelt otherwise
  row('Anna Rossi', 'Ojer Axonil, Deepest Might', 1, 1, 1), // a new commander: the free row
  row('=HYPERLINK("x")', 'Urza, Lord High Artificer', 0, 3), // a formula, written as text; a second new commander: no room
]

function setup(o: { tab?: Grid; status?: string; filed?: boolean; denied?: boolean; kind?: string; more?: Record<string, Grid> } = {}) {
  const target = o.kind === 'l1' ? 'Classifica' : '17'
  const tabs: Record<string, ReturnType<typeof sheet>> = { [target]: sheet(target, o.tab ?? stageTab()), Comandanti: sheet('Comandanti', comandanti()) }
  if (o.kind !== 'l1') tabs.Classifica = sheet('Classifica', classifica())
  for (const [n, g] of Object.entries(o.more ?? {})) tabs[n] = sheet(n, g)
  const calls: { method: string; url: string; payload?: string; auth: string }[] = []
  const fields: Record<string, unknown> = {
    drive: { stringValue: DRIVE },
    kind: { stringValue: o.kind ?? 'league' },
    stage: { integerValue: '17' },
    date: { stringValue: '2026-11-23' },
    status: { stringValue: o.status ?? 'done' },
    filed: { booleanValue: o.filed ?? false },
  }
  const ctx = {
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: {
      openById: (id: string) => (id === DRIVE ? { getSheetByName: (n: string) => tabs[n] ?? null, getSheets: () => Object.values(tabs) } : null),
      flush: () => {},
    },
    UrlFetchApp: {
      fetch: (url: string, opt: { method: string; payload?: string; headers: { Authorization: string } }) => {
        calls.push({ method: opt.method, url, payload: opt.payload, auth: opt.headers.Authorization })
        const code = opt.method === 'patch' && o.denied ? 403 : 200
        // a patch writes the fields of its mask: the ones it doesn't carry go
        if (code === 200 && opt.method === 'patch') {
          const sent = JSON.parse(opt.payload!).fields
          for (const f of [...url.matchAll(/updateMask\.fieldPaths=(\w+)/g)].map((m) => m[1]))
            if (f in sent) fields[f] = sent[f]
            else delete fields[f]
        }
        return { getResponseCode: () => code, getContentText: () => JSON.stringify({ fields }) }
      },
    },
    ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
  }
  runInNewContext(code, ctx)
  const post = (body: unknown) => JSON.parse((ctx as unknown as { doPost: (e: unknown) => string }).doPost({ postData: { contents: JSON.stringify(body) } }))
  return { tabs, calls, post, fields }
}

describe('publishing a tournament into its sheet (Apps Script)', () => {
  it('writes names, commanders, results, decklists and date, adding the new players and commanders', () => {
    const { tabs, calls, post } = setup()
    const res = post({ token: 'tok', id: TID, rows: RESULTS })
    expect(res).toEqual({
      ok: true,
      tab: '17',
      players: ['Dario Neri', '=HYPERLINK("x")'],
      commanders: ['Ojer Axonil, Deepest Might'],
      manual: ['Urza, Lord High Artificer'],
    })
    const g = tabs['17'].grid
    expect(g[2][2]).toBe('2026-11-23') // C3, under "Data"
    expect(g.slice(5, 9).map((r) => r.slice(1, 9))).toEqual([
      ["Leonardo Crifo'", 'Spider-Man 2099', { f: 'IF(B6="","",E6*3+G6)' }, 3, 0, 0, false, 'https://moxfield.com/decks/Ab3_x-9QzK'],
      ['Dario Neri', 'Kinnan, Bonder Prodigy', { f: 'IF(B6="","",E6*3+G6)' }, 2, 1, 0, true, ''],
      ['Anna Rossi', 'Ojer Axonil, Deepest Might', { f: 'IF(B6="","",E6*3+G6)' }, 1, 1, 1, false, ''],
      ["'=HYPERLINK(\"x\")", 'Urza, Lord High Artificer', { f: 'IF(B6="","",E6*3+G6)' }, 0, 3, 0, false, ''],
    ])
    expect(g[9][1]).toBeNull() // the row after stays empty
    // the new players in the free rows of the league's table, never in the row outside it
    expect(tabs.Classifica.grid.slice(12, 15).map((r) => r[1])).toEqual(['Dario Neri', "'=HYPERLINK(\"x\")", null])
    // the new commander in the free row, the database's formula untouched
    expect(tabs.Comandanti.grid[3][1]).toBe('Ojer Axonil, Deepest Might')
    expect(tabs.Comandanti.grid[4][1]).toEqual({ f: 'SORT(UNIQUE(IMPORTRANGE(…)))', v: 'Aang, Swift Savior' })
    // read with the TO's sign-in, checked with a write that changes nothing, then marked as in the sheet
    expect(calls.map((c) => [c.method, c.payload && JSON.parse(c.payload).fields.filed.booleanValue])).toEqual([
      ['get', undefined],
      ['patch', false],
      ['patch', true],
    ])
    expect(calls.every((c) => c.auth === 'Bearer tok' && c.url.includes(`/documents/tournaments/${TID}`))).toBe(true)
    expect(calls[1].url).toContain('?updateMask.fieldPaths=filed&currentDocument.exists=true')
    expect(calls[2].url).toContain('?updateMask.fieldPaths=filed&updateMask.fieldPaths=published&currentDocument.exists=true')
    // with what it wrote, as Firestore's REST API wants it
    expect(JSON.parse(calls[2].payload!).fields.published).toEqual({
      mapValue: {
        fields: {
          tab: { stringValue: '17' },
          first: { integerValue: '6' },
          rows: { integerValue: '4' },
          players: { arrayValue: { values: [{ stringValue: 'Dario Neri' }, { stringValue: '=HYPERLINK("x")' }] } },
          commanders: { arrayValue: { values: [{ stringValue: 'Ojer Axonil, Deepest Might' }] } },
        },
      },
    })
  })

  it("writes a level's Classifica, without a list of players", () => {
    const tab = stageTab()
    tab[1][1] = 'MR Magic LV1'
    const { tabs, post } = setup({ kind: 'l1', tab })
    const res = post({ token: 'tok', id: DRIVE, rows: RESULTS.slice(0, 2) })
    expect(res).toMatchObject({ ok: true, tab: 'Classifica', players: [] })
    expect(tabs.Classifica.grid[6][1]).toBe('Dario Neri') // as sent: no list to take the spelling from
  })

  it('writes nothing when the tab already has results', () => {
    const tab = stageTab()
    tab[7][4] = 2 // a win on the third row
    const { tabs, calls, post } = setup({ tab })
    expect(post({ token: 'tok', id: TID, rows: RESULTS }).error).toMatch(/ha già dei risultati/)
    expect(tabs.Classifica.grid[12][1]).toBeNull()
    expect(tabs.Comandanti.grid[3][1]).toBeNull()
    expect(calls.filter((c) => c.payload?.includes('true'))).toHaveLength(0) // not marked
  })

  it('counts a ticked BYE as a result', () => {
    const tab = stageTab()
    tab[10][7] = true
    expect(setup({ tab }).post({ token: 'tok', id: TID, rows: RESULTS }).error).toMatch(/ha già dei risultati/)
  })

  it('refuses who does not run the tournament, and tournaments not over or already in the sheet', () => {
    const denied = setup({ denied: true })
    expect(denied.post({ token: 'tok', id: TID, rows: RESULTS }).error).toBe('non gestisci questo torneo')
    expect(denied.tabs['17'].grid[5][1]).toBeNull()
    expect(setup({ status: 'swiss' }).post({ token: 'tok', id: TID, rows: RESULTS }).error).toMatch(/non è concluso/)
    expect(setup({ filed: true }).post({ token: 'tok', id: TID, rows: RESULTS }).error).toMatch(/già nel foglio/)
  })

  it('refuses rows that are not standings', () => {
    const { post, calls } = setup()
    const bad = (r: Record<string, unknown>) => post({ token: 'tok', id: TID, rows: [{ ...RESULTS[0], ...r }] }).error
    expect(bad({ w: 31 })).toBe('righe non valide')
    expect(bad({ name: '  ' })).toBe('righe non valide')
    expect(bad({ bye: 'TRUE' })).toBe('righe non valide')
    expect(bad({ list: 'https://spy.example/decks/x' })).toBe('righe non valide')
    expect(post({ token: 'tok', id: TID, rows: [] }).error).toBe('righe non valide')
    expect(post({ token: 'tok', id: '../admins/x', rows: RESULTS }).error).toBe('richiesta non valida')
    expect(calls).toHaveLength(0) // Firestore never asked
  })

  it('stops when the tab or the league table has no room', () => {
    const short = stageTab().slice(0, 7) // two rows
    short.push([null, { f: 'x', v: 'report' }])
    expect(setup({ tab: short }).post({ token: 'tok', id: TID, rows: RESULTS }).error).toMatch(/solo 2 righe/)
    const three = [row('A', 'X', 1, 0), row('B', 'X', 1, 0), row('C', 'X', 1, 0)]
    expect(setup().post({ token: 'tok', id: TID, rows: three }).error).toMatch(/mancano righe libere per C/)
  })

  it('takes it off the sheet: rows, date, and the players and commanders added then, unless used elsewhere', () => {
    // another stage played meanwhile by one of the new players
    const later = stageTab()
    later[5][1] = 'Dario Neri'
    later[5][2] = 'Spider-Man 2099'
    const { tabs, post, fields } = setup({ more: { '18': later } })
    const before = { classifica: JSON.stringify(classifica()), comandanti: JSON.stringify(comandanti()) }
    post({ token: 'tok', id: TID, rows: RESULTS })
    expect(post({ token: 'tok', id: TID, rows: RESULTS }).error).toMatch(/già nel foglio/) // not twice
    const res = post({ token: 'tok', id: TID, action: 'clear' })
    expect(res).toEqual({ ok: true, tab: '17', kept: ['Dario Neri'] })
    const g = tabs['17'].grid
    // the tab as it was: rows and date empty, formulas and BYE boxes there
    expect(g[2][2]).toBe('')
    expect(g.slice(5, 9).map((r) => r.slice(1, 9))).toEqual(
      Array.from({ length: 4 }, () => ['', '', { f: 'IF(B6="","",E6*3+G6)' }, '', '', '', false, '']),
    )
    expect(g[9].slice(1, 9)).toEqual(stageTab()[9].slice(1, 9))
    // the player of the later stage stays; the other new one and the new commander go
    expect(tabs.Classifica.grid.slice(12, 14).map((r) => r[1])).toEqual(['Dario Neri', ''])
    expect(tabs.Comandanti.grid[3][1]).toBe('')
    expect(JSON.stringify(tabs.Comandanti.grid.map((r) => r.map((c) => c || null)))).toBe(before.comandanti)
    expect(before.classifica).not.toBe(JSON.stringify(tabs.Classifica.grid))
    // back to be published, and it can be
    expect(fields.filed).toEqual({ booleanValue: false })
    expect(fields.published).toBeUndefined()
    expect(post({ token: 'tok', id: TID, action: 'clear' }).error).toMatch(/non risulta pubblicato/)
    expect(post({ token: 'tok', id: TID, rows: RESULTS })).toMatchObject({ ok: true })
  })

  it('takes nothing off for who does not run it, nor from a tab laid out otherwise', () => {
    const published = { mapValue: { fields: { tab: { stringValue: '17' }, first: { integerValue: '7' }, rows: { integerValue: '2' }, players: { arrayValue: {} }, commanders: { arrayValue: {} } } } }
    const denied = setup({ denied: true, filed: true })
    denied.fields.published = published
    expect(denied.post({ token: 'tok', id: TID, action: 'clear' }).error).toBe('non gestisci questo torneo')
    const moved = setup({ filed: true })
    moved.fields.published = published // written from row 7, but the table starts on row 6 now
    moved.tabs['17'].grid[5][1] = 'Someone'
    expect(moved.post({ token: 'tok', id: TID, action: 'clear' }).error).toMatch(/è cambiata/)
    expect(moved.tabs['17'].grid[5][1]).toBe('Someone')
  })
})
