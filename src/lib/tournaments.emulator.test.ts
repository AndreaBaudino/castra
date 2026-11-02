import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppUser } from './auth'
import type { Source } from './sources'
import { cutSeeds } from './swiss'
import {
  type Player,
  type TableMatch,
  type Tournament,
  createTournament,
  deleteTournament,
  finishTournament,
  nextCutRound,
  pairSwiss,
  results,
  savePlayer,
  setDrop,
  setExtra,
  setScore,
  setTournament,
  startCut,
} from './tournaments'

// A whole tournament run with the app's own functions on the Firestore emulator, rules included. Skipped by
// `npm test`; .github/workflows/rules.yml runs it, by hand (needs Java, as scripts/test-rules.mjs):
//   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@4
//   npx firebase emulators:exec --only firestore --project demo-castra 'npx vitest run src/lib/tournaments.emulator.test.ts'

const state = vi.hoisted(() => ({ ctx: null as unknown }))
vi.mock('./firebase', async (original) => ({ ...(await original<typeof import('./firebase')>()), fb: async () => state.ctx }))

const SAVONA = '1Qck40xjQ_zODQtI3YY6qFGFq1adeHsMiUCwPIhZ7mvw'
const source: Source = { drive: SAVONA, kind: 'league', year: 2026, season: 's2', league: 'Savona' }
const gina = { uid: 'gina' } as AppUser

describe.runIf(process.env.FIRESTORE_EMULATOR_HOST)('a tournament on the emulator', () => {
  // the emulator's test kit is installed only where this runs: its types can't be imported
  type Db = ReturnType<typeof import('firebase/firestore').getFirestore>
  type Env = {
    authenticatedContext: (uid: string) => { firestore: () => Db }
    unauthenticatedContext: () => { firestore: () => Db }
    withSecurityRulesDisabled: (fn: (c: { firestore: () => Db }) => Promise<void>) => Promise<void>
    cleanup: () => Promise<void>
  }
  let env: Env
  let fs: typeof import('firebase/firestore')
  const as = (uid: string) => {
    state.ctx = { db: env.authenticatedContext(uid).firestore(), fs }
  }
  // what every phone reads
  async function read(id: string) {
    const db = env.unauthenticatedContext().firestore()
    const t = (await fs.getDoc(fs.doc(db, 'tournaments', id))).data() as Tournament | undefined
    const players = (await fs.getDocs(fs.collection(db, 'tournaments', id, 'players'))).docs.map((d): [string, Player] => [d.id, d.data() as Player])
    const matches = (await fs.getDocs(fs.collection(db, 'tournaments', id, 'matches'))).docs
      .map((d) => d.data() as TableMatch)
      .sort((a, b) => a.round - b.round || a.table - b.table)
    return { t: t!, players, matches }
  }
  const round = (ms: TableMatch[], r: number) => ms.filter((m) => m.round === r)
  // every table reported: the first named wins 2-0, one table 1-1
  async function report(id: string, ms: TableMatch[]) {
    for (const [i, m] of ms.entries()) if (m.p2) await setScore(id, m, i === 1 ? [1, 1, 0] : [2, 0, 0])
  }

  beforeAll(async () => {
    const kit = '@firebase/rules-unit-testing'
    const { initializeTestEnvironment } = await import(/* @vite-ignore */ kit)
    fs = await import('firebase/firestore')
    env = (await initializeTestEnvironment({
      projectId: 'demo-castra',
      firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
    })) as Env
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore()
      await fs.setDoc(fs.doc(db, 'sources', SAVONA), { ...source, at: 'x', by: 'admin' })
      await fs.setDoc(fs.doc(db, 'organizers', 'gina'), { player: 'gina', name: 'Gina', leagues: ['Savona'], at: 'x', by: 'admin' })
    })
  })
  afterAll(() => env?.cleanup())

  it('runs from registration to the final, then is cancelled', async () => {
    as('gina')
    const id = await createTournament(gina, source, '2026-11-16', 5)
    expect(id).toBe(`${SAVONA}~5`)
    await expect(createTournament(gina, source, '2026-11-16', 5)).rejects.toThrow('taken')
    await setTournament(id, { rounds: 3, cut: 2 })

    // seven players: a bye every round; a guest whose commander comes later
    for (const p of ['a', 'b', 'c', 'd', 'e', 'f']) await savePlayer(gina, id, p, { name: p.toUpperCase(), commander: 'Kinnan, Bonder Prodigy' })
    await savePlayer(gina, id, 'g', { name: 'G', commander: null })
    await savePlayer(gina, id, 'g', { name: 'G', commander: 'Spider-Man 2099' })
    let s = await read(id)
    expect(s.t).toMatchObject({ status: 'open', round: 0, rounds: 3, cut: 2, started: null })
    expect(s.players.find(([k]) => k === 'g')![1].commander).toBe('Spider-Man 2099')

    // round 1: three tables and the bye, the clock started at the server's time
    await pairSwiss(id, s.t, s.players, s.matches)
    s = await read(id)
    expect(s.t).toMatchObject({ status: 'swiss', round: 1 })
    expect(s.t.started).not.toBeNull()
    expect(round(s.matches, 1).map((m) => m.table)).toEqual([0, 1, 2, 3])
    expect(round(s.matches, 1)[0].p2).toBeNull()
    await report(id, s.matches)
    await setExtra(id, round(s.matches, 1)[1], 5)

    // a mistake: round 1 paired again, results and minutes gone
    s = await read(id)
    await pairSwiss(id, s.t, s.players, s.matches, true)
    s = await read(id)
    expect(s.t.round).toBe(1)
    expect(round(s.matches, 1)).toHaveLength(4)
    expect(round(s.matches, 1).every((m) => m.score === null && !m.extra)).toBe(true)
    await report(id, s.matches)

    // before round 2: a late entry, and a drop
    await savePlayer(gina, id, 'h', { name: 'H', commander: 'Atraxa, Grand Unifier', joined: 2 })
    await setDrop(id, 'a', 1)
    s = await read(id)
    await pairSwiss(id, s.t, s.players, s.matches)
    s = await read(id)
    const r2 = round(s.matches, 2).flatMap((m) => [m.p1, m.p2]).filter(Boolean)
    expect(r2.sort()).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h']) // h in, a out
    await report(id, round(s.matches, 2))
    // the drop taken back
    await setDrop(id, 'a', null)
    s = await read(id)
    expect(s.players.find(([k]) => k === 'a')![1].drop).toBeUndefined()
    await setDrop(id, 'a', 1)

    s = await read(id)
    await pairSwiss(id, s.t, s.players, s.matches)
    s = await read(id)
    await report(id, round(s.matches, 3))

    // the top cut: the best two meet in the final; the Swiss ends with round 3
    s = await read(id)
    // the best two who haven't dropped (a might be among the best)
    const [first, second] = cutSeeds(results(s.t, s.players, s.matches).standings, 2)
    await startCut(id, s.t, s.players, s.matches)
    s = await read(id)
    expect(s.t).toMatchObject({ status: 'cut', round: 4, rounds: 3 })
    const final = round(s.matches, 4)
    expect(final).toHaveLength(1)
    expect([final[0].p1, final[0].p2]).toEqual([first, second])
    await setScore(id, final[0], [0, 2, 0])
    s = await read(id)
    expect(await nextCutRound(id, s.t, s.matches)).toBeNull() // that was the final
    await finishTournament(id)
    s = await read(id)
    expect(s.t.status).toBe('done')
    const { order } = results(s.t, s.players, s.matches)
    expect(order.slice(0, 2)).toEqual([second, first]) // the winner of the final first
    expect(order).toHaveLength(8)

    // someone who isn't a TO can't touch it
    as('ivan')
    await expect(setScore(id, final[0], [2, 0, 0])).rejects.toThrow()
    await expect(deleteTournament(id, s.players, s.matches)).rejects.toThrow()

    // cancelled by the TO: nothing left, and the stage can start again
    as('gina')
    await deleteTournament(id, s.players, s.matches)
    s = await read(id)
    expect(s.t).toBeUndefined()
    expect(s.players).toEqual([])
    expect(s.matches).toEqual([])
    expect(await createTournament(gina, source, '2026-11-16', 5)).toBe(id)
  })
})
