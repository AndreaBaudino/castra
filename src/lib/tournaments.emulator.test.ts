import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppUser } from './auth'
import type { Source } from './sources'
import { cutSeeds } from './swiss'
import {
  type Player,
  type TableMatch,
  type Tournament,
  addPenalty,
  confirmPlayer,
  confirmScore,
  createTournament,
  deleteTournament,
  findByCode,
  finishTournament,
  joinTournament,
  loadList,
  loadPrivate,
  nextCutRound,
  pairSwiss,
  removePlayer,
  reportScore,
  results,
  saveList,
  savePlayer,
  setDrop,
  setExtra,
  setFiled,
  setScore,
  setTournament,
  startClock,
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

// a whole tournament against the emulator: seconds, past Vitest's 5 s default
describe.runIf(process.env.FIRESTORE_EMULATOR_HOST)('a tournament on the emulator', { timeout: 60_000 }, () => {
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
    state.ctx = { db: env.authenticatedContext(uid).firestore(), fs, auth: { currentUser: { uid } } }
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
      // players with an account: kim's claim is verified, lea's and pam's are only linked
      await fs.setDoc(fs.doc(db, 'claims', 'mia'), { uid: 'kim', name: 'K', photo: null, at: 'x', verified: true })
      await fs.setDoc(fs.doc(db, 'claims', 'nina'), { uid: 'lea', name: 'L', photo: null, at: 'x' })
      await fs.setDoc(fs.doc(db, 'claims', 'pat'), { uid: 'pam', name: 'P', photo: null, at: 'x' })
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
    for (const p of ['a', 'b', 'c', 'd', 'e', 'f']) await savePlayer(gina, id, p, { name: p.toUpperCase(), commander: 'Kinnan, Bonder Prodigy' }, true)
    await savePlayer(gina, id, 'g', { name: 'G', commander: null }, true)
    await savePlayer(gina, id, 'g', { name: 'G', commander: 'Spider-Man 2099' }, true)
    let s = await read(id)
    expect(s.t).toMatchObject({ status: 'open', round: 0, rounds: 3, cut: 2, started: null })
    // the commanders are secret until round 1: what everyone reads says only that they were given
    expect(s.players.find(([k]) => k === 'g')![1]).toMatchObject({ commander: null, secret: true })
    expect(await loadPrivate(id, 'g')).toEqual({ commander: 'Spider-Man 2099' })

    // round 1: three tables and the bye, the clock held until the TO starts it; the commanders come out
    await pairSwiss(id, s.t, s.players, s.matches)
    s = await read(id)
    expect(s.t).toMatchObject({ status: 'swiss', round: 1, paused: true })
    await startClock(id, 1)
    s = await read(id)
    expect(s.t.paused).toBe(false)
    expect(s.players.find(([k]) => k === 'g')![1].commander).toBe('Spider-Man 2099')
    expect(s.players.every(([, p]) => p.commander && !p.secret)).toBe(true)
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
    await savePlayer(gina, id, 'h', { name: 'H', commander: 'Atraxa, Grand Unifier', joined: 2 }, false)
    await setDrop(id, 'a', 1)
    s = await read(id)
    await pairSwiss(id, s.t, s.players, s.matches)
    // another phone still at round 1 (or offline until now) can't pair round 2 again over the one being played
    const before = await read(id)
    await expect(pairSwiss(id, s.t, s.players, s.matches)).rejects.toThrow('stale')
    s = await read(id)
    expect(s.matches).toEqual(before.matches)
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
    await finishTournament(id, [])
    s = await read(id)
    // not in the sheet yet: the TO area keeps finding it, however old, until it is
    const unfiled = async () => {
      const db = env.unauthenticatedContext().firestore()
      return (await fs.getDocs(fs.query(fs.collection(db, 'tournaments'), fs.where('filed', '==', false)))).docs.map((d) => d.id)
    }
    expect(s.t).toMatchObject({ status: 'done', filed: false })
    expect(await unfiled()).toContain(id)
    await setFiled(id, true)
    expect((await read(id)).t.filed).toBe(true)
    expect(await unfiled()).not.toContain(id)
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

  it('lets the players register with the code, enter and confirm their results, and drop', async () => {
    const user = (uid: string) => ({ uid }) as AppUser
    const claim = async (key: string) => {
      let data: Record<string, unknown> | undefined
      await env.withSecurityRulesDisabled(async (c) => {
        data = (await fs.getDoc(fs.doc(c.firestore(), 'claims', key))).data()
      })
      return data!
    }
    const MOX = 'https://moxfield.com/decks/Ab3_x-9QzK'
    as('gina')
    const id = await createTournament(gina, source, '2026-11-23', 6)
    let s = await read(id)
    const code = s.t.code!
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    as('kim')
    expect(await findByCode(code.toLowerCase())).toBe(id)
    expect(await findByCode('ZZZZZZ')).toBeNull()

    // kim, verified: in at once, with her deck and decklist
    await joinTournament(user('kim'), id, 'mia', { name: 'Mia', commander: 'Kinnan, Bonder Prodigy', deck: 'd1', invalid: false, verified: true }, false)
    await saveList(id, 'mia', MOX)
    expect(await loadList(id, 'mia')).toBe(MOX)
    // lea, only linked: waiting; she changes her commander meanwhile
    as('lea')
    await joinTournament(user('lea'), id, 'nina', { name: 'Nina', commander: 'Atraxa, Grand Unifier', deck: null, invalid: true, verified: false }, false)
    await joinTournament(user('lea'), id, 'nina', { name: 'Nina', commander: 'Spider-Man 2099', deck: null, invalid: true, verified: false }, true)
    await expect(joinTournament(user('lea'), id, 'nina', { name: 'Nina', commander: 'X', deck: null, invalid: false, verified: true }, false)).rejects.toThrow()
    await expect(loadList(id, 'mia')).rejects.toThrow() // someone else's decklist, during the tournament
    // pam: waiting, leaves, asks again
    as('pam')
    await joinTournament(user('pam'), id, 'pat', { name: 'Pat', commander: 'Kraum / Tymna', deck: null, invalid: false, verified: false }, false)
    await removePlayer(id, 'pat', true)
    await joinTournament(user('pam'), id, 'pat', { name: 'Pat', commander: 'Kraum / Tymna', deck: null, invalid: false, verified: false }, false)
    s = await read(id)
    const nina = s.players.find(([k]) => k === 'nina')![1]
    expect(nina).toMatchObject({ pending: true, uid: 'lea', commander: null, secret: true })
    // her commander only she and the TOs read, until round 1
    as('lea')
    expect(await loadPrivate(id, 'nina')).toEqual({ commander: 'Spider-Man 2099' })
    as('kim')
    await expect(loadPrivate(id, 'nina')).rejects.toThrow()
    expect(await loadPrivate(id, 'mia')).toEqual({ commander: 'Kinnan, Bonder Prodigy', link: MOX }) // the decklist kept it
    expect(s.players.find(([k]) => k === 'mia')![1]).toMatchObject({ uid: 'kim', deck: 'd1', list: true })
    expect(s.players.find(([k]) => k === 'mia')![1].pending).toBeUndefined()

    // the TO confirms lea, and so verifies her claim; pam is left waiting
    as('gina')
    expect(await loadList(id, 'mia')).toBe(MOX)
    await confirmPlayer(gina, id, 'nina', true)
    expect(await claim('nina')).toMatchObject({ verified: true, verifiedBy: 'gina', verifiedIn: id })
    s = await read(id)
    expect(s.players.find(([k]) => k === 'nina')![1].pending).toBeUndefined()

    // round 1 closes registration: the code stops working, pam's request goes
    await setTournament(id, { rounds: 2 })
    s = await read(id)
    await pairSwiss(id, s.t, s.players, s.matches)
    s = await read(id)
    expect(s.t.code).toBeNull()
    expect(s.players.map(([k]) => k).sort()).toEqual(['mia', 'nina'])
    expect(s.players.find(([k]) => k === 'nina')![1]).toMatchObject({ commander: 'Spider-Man 2099' })
    expect((await claim('pat')).verified).toBeUndefined()
    as('kim')
    expect(await findByCode(code)).toBeNull()

    // kim enters 2-1, lea says 1-2 the other way, kim confirms that; then it's settled
    let [m] = round(s.matches, 1)
    const kimP1 = m.p1 === 'mia'
    await reportScore(id, m, kimP1 ? [2, 1, 0] : [1, 2, 0], 'mia')
    await expect(confirmScore(id, m, 'mia')).rejects.toThrow() // her own
    as('lea')
    await reportScore(id, m, kimP1 ? [1, 2, 0] : [2, 1, 0], 'nina')
    as('kim')
    await confirmScore(id, m, 'mia')
    s = await read(id)
    ;[m] = round(s.matches, 1)
    expect(m).toMatchObject({ score: kimP1 ? [1, 2, 0] : [2, 1, 0], reportedBy: 'nina', confirmed: true })
    as('lea')
    await expect(reportScore(id, m, [2, 0, 0], 'nina')).rejects.toThrow()
    expect(results(s.t, s.players, s.matches).standings[0].id).toBe('nina')

    // round 2: lea drops after it, kim can't drop her
    as('gina')
    await pairSwiss(id, s.t, s.players, s.matches)
    as('kim')
    await expect(setDrop(id, 'nina', 2)).rejects.toThrow()
    as('lea')
    await setDrop(id, 'nina', 2)
    s = await read(id)
    expect(s.players.find(([k]) => k === 'nina')![1].drop).toBe(2)
    as('kim')
    await reportScore(id, round(s.matches, 2)[0], [2, 0, 0], 'mia')

    // over: the decklists are public; cancelled, they go with the tournament
    as('gina')
    await finishTournament(id, [])
    state.ctx = { db: env.unauthenticatedContext().firestore(), fs }
    expect(await loadList(id, 'mia')).toBe(MOX)
    // a player's phone reads only their own matches (useTournament with `me`): the same ones as in the whole list
    s = await read(id)
    const own = await fs.getDocs(
      fs.query(fs.collection(env.authenticatedContext('kim').firestore(), 'tournaments', id, 'matches'), fs.or(fs.where('p1', '==', 'mia'), fs.where('p2', '==', 'mia'))),
    )
    const ids = (ms: TableMatch[]) => ms.map((m) => `r${m.round}t${m.table}`).sort()
    expect(own.docs.map((d) => d.id).sort()).toEqual(ids(s.matches.filter((m) => m.p1 === 'mia' || m.p2 === 'mia')))
    expect(own.size).toBeGreaterThan(1)
    // the log: every change with who made it, for the TOs only
    const log = async () => (await fs.getDocs(fs.collection(env.authenticatedContext('gina').firestore(), 'tournaments', id, 'log'))).docs.map((d) => d.data())
    const lines = await log()
    expect(lines.find((e) => e.kind === 'confirm')).toMatchObject({ by: 'kim', player: 'mia' })
    expect(lines.find((e) => e.kind === 'drop' && e.player === 'nina')).toMatchObject({ by: 'lea', round: 2 })
    expect(lines.filter((e) => e.kind === 'pair').length).toBeGreaterThan(1)
    expect(lines.every((e) => e.at && e.by)).toBe(true)
    await expect(fs.getDocs(fs.collection(env.authenticatedContext('kim').firestore(), 'tournaments', id, 'log'))).rejects.toThrow()
    // a penalty: the TO's line, which the player reads from their account
    as('gina')
    await addPenalty(id, { kind: 'gameLoss', round: 2, player: 'mia', infraction: 'decklist', uid: 'kim' })
    await addPenalty(id, { kind: 'note', round: 2, player: 'mia', text: 'only for the TOs' })
    const seen = await fs.getDocs(fs.query(fs.collection(env.authenticatedContext('kim').firestore(), 'tournaments', id, 'log'), fs.where('uid', '==', 'kim')))
    expect(seen.docs.map((d) => d.data().kind)).toEqual(['gameLoss'])
    as('gina')
    s = await read(id)
    await deleteTournament(id, s.players, s.matches)
    await expect(log()).rejects.toThrow() // the tournament is gone: its log stays, read from the console only
    let cancelled: unknown
    await env.withSecurityRulesDisabled(async (c) => {
      const all = (await fs.getDocs(fs.collection(c.firestore(), 'tournaments', id, 'log'))).docs.map((d) => d.data())
      cancelled = all.find((e) => e.kind === 'cancel')?.by
    })
    expect(cancelled).toBe('gina')
    let left = true
    await env.withSecurityRulesDisabled(async (c) => {
      left = (await fs.getDoc(fs.doc(c.firestore(), 'tournaments', id, 'players', 'mia', 'private', 'deck'))).exists()
    })
    expect(left).toBe(false)
  })
})
