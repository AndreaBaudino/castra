// Tests firestore.rules, the only protection of the data, on the Firestore emulator. Run by
// .github/workflows/rules.yml when the rules change; by hand (needs Java):
//   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@4
//   npx firebase emulators:exec --only firestore --project demo-castra 'node scripts/test-rules.mjs'

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'demo-castra',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
})
const alice = env.authenticatedContext('alice').firestore()
const bob = env.authenticatedContext('bob').firestore()
const guest = env.unauthenticatedContext().firestore()
const asAdmin = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()))
const AT = new Date().toISOString() // as the app writes the moment of a claim or a registration

// "this is me" as the app writes it (src/lib/claims.ts): the claim and the account's link, dropping the previous claim
function claim(db, uid, key, previous, name = 'Name', photo = null, at = AT) {
  const b = writeBatch(db)
  if (previous) b.delete(doc(db, 'claims', previous))
  b.set(doc(db, 'claims', key), { uid, name, photo, at })
  b.set(doc(db, 'users', uid), { circuitMe: key }, { merge: true })
  return b.commit()
}
function unclaim(db, uid, key) {
  const b = writeBatch(db)
  b.delete(doc(db, 'claims', key))
  b.set(doc(db, 'users', uid), { circuitMe: null }, { merge: true })
  return b.commit()
}

const check = (expect) => (name, write) =>
  expect(write).then(
    () => console.log('ok  ', name),
    (e) => {
      console.log('FAIL', name, e.message)
      process.exitCode = 1
    },
  )
const allowed = check(assertSucceeds)
const denied = check(assertFails)

await allowed('settings on a new account', setDoc(doc(alice, 'users', 'alice'), { theme: { mode: 'dark' } }, { merge: true }))
await denied("someone else's account", setDoc(doc(alice, 'users', 'bob'), { x: 1 }))
await allowed('first claim', claim(alice, 'alice', 'mario'))
await allowed('other settings while claiming', setDoc(doc(alice, 'users', 'alice'), { lang: 'it' }, { merge: true }))
await allowed('everyone reads the claims, signed in or not', getDoc(doc(guest, 'claims', 'mario')))
await denied('a second claim keeping the first', claim(alice, 'alice', 'luigi'))
await denied('pointing to another player without releasing the claim', setDoc(doc(alice, 'users', 'alice'), { circuitMe: 'luigi' }, { merge: true }))
await allowed('moving the claim to another player', claim(alice, 'alice', 'luigi', 'mario'))
await denied('an oversized name', claim(bob, 'bob', 'peach', null, 'x'.repeat(201)))
// every app downloads the claims, and the admins' notifications take a newer moment as a new claim
await denied('an oversized moment', claim(bob, 'bob', 'peach', null, 'B', null, AT + 'x'.repeat(100000)))
await denied('a moment in the future', claim(bob, 'bob', 'peach', null, 'B', null, '2999-01-01T00:00:00.000Z'))
await denied("a claim for someone else's account", claim(bob, 'alice', 'peach'))
await denied('a picture from another site', claim(bob, 'bob', 'peach', null, 'B', 'https://spy.example/pixel.png'))
await allowed('a claim by another account, with its Google picture', claim(bob, 'bob', 'peach', null, 'B', 'https://lh3.googleusercontent.com/a/ACg8ocK-x_1=s96-c'))
await denied("a player another account claimed", claim(alice, 'alice', 'peach', 'luigi'))
await allowed('customising your own page', updateDoc(doc(bob, 'claims', 'peach'), { coverName: 'Sol Ring', coverArt: null, deck: null }))
await allowed(
  'the art of a card behind your picture',
  updateDoc(doc(bob, 'claims', 'peach'), { coverArt: 'https://cards.scryfall.io/art_crop/front/a/b/ab12-cd34.jpg?1562' }),
)
// in the CSS url("…") the page puts it in, a quote would add an image from anywhere
await denied('art that adds another image', updateDoc(doc(bob, 'claims', 'peach'), { coverArt: 'https://cards.scryfall.io/a"), url("https://spy.example/p.png' }))
await denied("customising someone else's page", updateDoc(doc(alice, 'claims', 'peach'), { coverName: 'Sol Ring', coverArt: null, deck: null }))

// the "verified" tick: only an admin gives or takes it, and the claimer can still customise their page
const carol = env.authenticatedContext('carol').firestore()
await asAdmin((db) => setDoc(doc(db, 'admins', 'carol'), {}))
await denied('verifying your own claim', updateDoc(doc(bob, 'claims', 'peach'), { verified: true }))
await denied('verifying, by a non-admin', updateDoc(doc(alice, 'claims', 'peach'), { verified: true }))
await allowed('verifying, by an admin', updateDoc(doc(carol, 'claims', 'peach'), { verified: true }))
await denied('an admin changing the claim while verifying', updateDoc(doc(carol, 'claims', 'peach'), { verified: false, name: 'X' }))
await allowed('customising a verified page', updateDoc(doc(bob, 'claims', 'peach'), { coverName: 'Sol Ring', coverArt: null, deck: null }))
await denied('dropping your own tick', updateDoc(doc(bob, 'claims', 'peach'), { verified: false }))
const preVerified = writeBatch(alice)
preVerified.delete(doc(alice, 'claims', 'luigi'))
preVerified.set(doc(alice, 'claims', 'daisy'), { uid: 'alice', name: 'A', photo: null, at: AT, verified: true })
preVerified.set(doc(alice, 'users', 'alice'), { circuitMe: 'daisy' }, { merge: true })
await denied('a claim that arrives already verified', preVerified.commit())
await allowed('releasing the claim', unclaim(alice, 'alice', 'luigi'))
await allowed('claiming again after releasing', claim(alice, 'alice', 'mario'))

// the account points to a player someone else claimed meanwhile: the link can be dropped
await asAdmin(async (db) => {
  await setDoc(doc(db, 'users', 'alice'), { circuitMe: 'toad' }, { merge: true })
  await setDoc(doc(db, 'claims', 'toad'), { uid: 'bob', name: 'B', photo: null, at: 'x' })
})
await allowed("dropping the link to a player someone else claimed", setDoc(doc(alice, 'users', 'alice'), { circuitMe: null }, { merge: true }))

// a claim revoked by an admin: that account can move on, and can't take the player back
await asAdmin(async (db) => {
  await deleteDoc(doc(db, 'claims', 'peach'))
  await setDoc(doc(db, 'revoked', 'peach'), { uid: 'bob', name: 'B', at: 'x', by: 'admin' })
})
await denied('claiming back a revoked player', claim(bob, 'bob', 'peach'))
await allowed('after a revoke, dropping the link', setDoc(doc(bob, 'users', 'bob'), { circuitMe: null }, { merge: true }))

// deleting the account (src/lib/account.ts): the claim, then the account, in one batch
await allowed(
  'deleting the account',
  (async () => {
    const b = writeBatch(alice)
    b.delete(doc(alice, 'claims', 'mario'))
    b.delete(doc(alice, 'users', 'alice'))
    await b.commit()
  })(),
)

// what the admins keep: read by everyone, written by no one else
await denied('the banlist, by a non-admin', setDoc(doc(alice, 'config', 'banlist'), { json: '{}', at: 'x', by: 'alice' }))
await denied('making yourself an admin', setDoc(doc(alice, 'admins', 'alice'), {}))

// tournament organizers (src/lib/organizers.ts): an admin promotes the account holding a verified claim
await asAdmin(async (db) => {
  await setDoc(doc(db, 'claims', 'zelda'), { uid: 'erin', name: 'E', photo: null, at: 'x', verified: true })
  await setDoc(doc(db, 'claims', 'link'), { uid: 'frank', name: 'F', photo: null, at: 'x' })
})
const erin = env.authenticatedContext('erin').firestore()
const to = (player, by = 'carol') => ({ player, name: 'Zelda', leagues: ['Savona'], at: 'x', by })
await denied('making yourself an organizer', setDoc(doc(erin, 'organizers', 'erin'), to('zelda', 'erin')))
await denied('an organizer on a player the account does not hold', setDoc(doc(carol, 'organizers', 'bob'), to('zelda')))
await denied('an organizer whose claim is not verified', setDoc(doc(carol, 'organizers', 'frank'), to('link')))
await denied('an organizer with other fields', setDoc(doc(carol, 'organizers', 'erin'), { ...to('zelda'), admin: true }))
await allowed('an organizer, promoted by an admin', setDoc(doc(carol, 'organizers', 'erin'), to('zelda')))
await allowed('an organizer reading their own leagues', getDoc(doc(erin, 'organizers', 'erin')))
await denied("reading someone else's organizer", getDoc(doc(bob, 'organizers', 'erin')))
await denied('an organizer changing their own leagues', updateDoc(doc(erin, 'organizers', 'erin'), { leagues: ['Roma'] }))
const event = { drive: '1yo9wJfM_ddBka91ixqpDp3K6yqAGeeMWtM2w_FCTn9Q', kind: 'l1', name: 'MR Magic', date: '2026-11-30', at: 'x' }
await allowed('an event with its zone and organizers', setDoc(doc(carol, 'sources', event.drive), { ...event, zone: 'Savona', tos: ['erin'], by: 'carol' }))
await denied('an organizer assigning themselves an event', updateDoc(doc(erin, 'sources', event.drive), { tos: ['erin', 'frank'] }))
await allowed('removing an organizer', deleteDoc(doc(carol, 'organizers', 'erin')))

// tournaments run in the app (src/lib/tournaments.ts): gina and jo run Savona, hank Genova, ivan nothing
const SAVONA = '1Qck40xjQ_zODQtI3YY6qFGFq1adeHsMiUCwPIhZ7mvw'
const ONLINE = '1j3CFGkfMdR89PCKMghsE_gkLn5A-SjIieo1LnWnyyBo'
const LV1 = '1yo9wJfM_ddBka91ixqpDp3K6yqAGeeMWtM2w_FCTn9Q' // zone Savona
const LV2 = '1IHHr3oL_QCR3UBsDgZxYeVEe0Y2A8p58wgRcXFdV7eM' // no zone, assigned to hank
await asAdmin(async (db) => {
  await setDoc(doc(db, 'sources', SAVONA), { drive: SAVONA, kind: 'league', year: 2026, season: 's2', league: 'Savona', at: 'x', by: 'carol' })
  await setDoc(doc(db, 'sources', ONLINE), { drive: ONLINE, kind: 'online', year: 2026, season: 's2', league: 'Savona', at: 'x', by: 'carol' })
  await setDoc(doc(db, 'sources', LV1), { drive: LV1, kind: 'l1', name: 'MR Magic', date: '2026-11-30', zone: 'Savona', at: 'x', by: 'carol' })
  await setDoc(doc(db, 'sources', LV2), { drive: LV2, kind: 'l2', name: 'Albisola', date: '2026-11-23', tos: ['hank'], at: 'x', by: 'carol' })
  for (const [uid, leagues] of [['gina', ['Savona']], ['jo', ['Savona', 'Roma']], ['hank', ['Genova']]])
    await setDoc(doc(db, 'organizers', uid), { player: uid, name: uid, leagues, at: 'x', by: 'carol' })
})
const gina = env.authenticatedContext('gina').firestore()
const jo = env.authenticatedContext('jo').firestore()
const hank = env.authenticatedContext('hank').firestore()
const ivan = env.authenticatedContext('ivan').firestore()
const tour = (drive, kind, more = {}) => ({
  drive, kind, name: 'Savona', date: '2026-11-16', status: 'open', rounds: 0, cut: 0, round: 0, started: null, filed: false, at: 'x', ...more,
})
const STAGE = `${SAVONA}~5`
const stage5 = (by, more) => tour(SAVONA, 'league', { stage: 5, by, ...more })

await allowed('a stage, by a TO of the league', setDoc(doc(gina, 'tournaments', STAGE), stage5('gina')))
await allowed('everyone follows a tournament, signed in or not', getDoc(doc(guest, 'tournaments', STAGE)))
await denied('a stage, by a TO of another league', setDoc(doc(hank, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 6, by: 'hank' })))
await denied('a stage, by someone who is not a TO', setDoc(doc(ivan, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 6, by: 'ivan' })))
await denied('a stage under the id of another stage', setDoc(doc(gina, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 7, by: 'gina' })))
await denied('a level 1 on a league sheet', setDoc(doc(gina, 'tournaments', SAVONA), tour(SAVONA, 'l1', { by: 'gina' })))
await denied('a tournament on the online league', setDoc(doc(gina, 'tournaments', `${ONLINE}~1`), tour(ONLINE, 'league', { stage: 1, by: 'gina' })))
await denied('a tournament that starts already played', setDoc(doc(gina, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 6, by: 'gina', status: 'done' })))
await denied('a tournament in the name of another TO', setDoc(doc(gina, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 6, by: 'jo' })))
await denied('a tournament with other fields', setDoc(doc(gina, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 6, by: 'gina', prize: 1 })))
await allowed('a level 1, by a TO of its zone', setDoc(doc(gina, 'tournaments', LV1), tour(LV1, 'l1', { by: 'gina', name: 'MR Magic' })))
await allowed('a level 2, by the TO assigned to it', setDoc(doc(hank, 'tournaments', LV2), tour(LV2, 'l2', { by: 'hank', name: 'Albisola' })))
await denied('a level 2, by a TO neither of its zone nor assigned', updateDoc(doc(gina, 'tournaments', LV2), { cut: 8 }))

await allowed('another TO of the league runs it too', updateDoc(doc(jo, 'tournaments', STAGE), { rounds: 4, cut: 4 }))
await denied('starting again a stage another TO started', setDoc(doc(jo, 'tournaments', STAGE), stage5('jo')))
await denied('a TO of another league changing it', updateDoc(doc(hank, 'tournaments', STAGE), { rounds: 5 }))
await denied('moving it to another sheet', updateDoc(doc(gina, 'tournaments', STAGE), { drive: LV1 }))
await denied('a top cut of 6', updateDoc(doc(gina, 'tournaments', STAGE), { cut: 6 }))
await denied("starting the clock at the phone's time", updateDoc(doc(gina, 'tournaments', STAGE), { started: new Date() }))
await denied('a clock held that is not a yes or no', updateDoc(doc(gina, 'tournaments', STAGE), { paused: 'sì' }))
await allowed('the clock held, then started at the server\'s time', updateDoc(doc(gina, 'tournaments', STAGE), { paused: false, started: serverTimestamp() }))
await allowed('time, venue and address for the calendar', updateDoc(doc(gina, 'tournaments', STAGE), { time: '15:30', place: 'Fortezza', address: 'Via Roma 1, Savona' }))
await allowed('kept out of the calendar by its TO', updateDoc(doc(gina, 'tournaments', STAGE), { hidden: true }))
await denied('a start time that is not one', updateDoc(doc(gina, 'tournaments', STAGE), { time: 'pomeriggio' }))
await denied('the venue, by someone who is not a TO', updateDoc(doc(ivan, 'tournaments', STAGE), { place: 'Altrove' }))
await denied('a venue too long', updateDoc(doc(gina, 'tournaments', STAGE), { place: 'x'.repeat(101) }))
await allowed('an admin runs any tournament', updateDoc(doc(carol, 'tournaments', STAGE), { date: '2026-11-17' }))
await denied('a tournament that starts already in the sheet', setDoc(doc(gina, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 6, by: 'gina', filed: true })))
await allowed('marking the results as copied into the sheet', updateDoc(doc(gina, 'tournaments', STAGE), { filed: true }))
await denied('marking it, by someone who is not a TO', updateDoc(doc(ivan, 'tournaments', STAGE), { filed: false }))
await denied('marking it with something else than yes or no', updateDoc(doc(gina, 'tournaments', STAGE), { filed: 'yes' }))
const published = { tab: '5', first: 6, rows: 12, players: ['Giulia Nuova'], commanders: [] }
await allowed('what the script wrote into the sheet, kept by the TO', updateDoc(doc(gina, 'tournaments', STAGE), { filed: true, published }))
await denied('what was written, by someone who is not a TO', updateDoc(doc(ivan, 'tournaments', STAGE), { published: null }))
await denied('what was written, with other fields', updateDoc(doc(gina, 'tournaments', STAGE), { published: { ...published, sheet: 'x' } }))
await denied('what was written, with a row number that is not one', updateDoc(doc(gina, 'tournaments', STAGE), { published: { ...published, first: '6' } }))
await denied('a tournament that starts already published', setDoc(doc(gina, 'tournaments', `${SAVONA}~6`), tour(SAVONA, 'league', { stage: 6, by: 'gina', published })))
await allowed('taken off the sheet', updateDoc(doc(gina, 'tournaments', STAGE), { filed: false, published: deleteField() }))
await allowed('taking the mark back', updateDoc(doc(gina, 'tournaments', STAGE), { filed: false }))

// players
const entry = (more = {}) => ({ name: 'Mario Rossi', commander: null, at: 'x', by: 'gina', ...more })
await allowed('a player, added by the TO', setDoc(doc(gina, 'tournaments', STAGE, 'players', 'mario rossi'), entry({ secret: true })))
// the commanders are secret until round 1 (src/lib/tournaments.ts): in the private document, never here
await denied('a commander in the clear before round 1, by the TO', setDoc(doc(gina, 'tournaments', STAGE, 'players', 'peach'), entry({ name: 'Peach', commander: 'Kinnan, Bonder Prodigy' })))
await allowed("the TO keeps a player's commander secret", setDoc(doc(gina, 'tournaments', STAGE, 'players', 'mario rossi', 'private', 'deck'), { commander: 'Kinnan, Bonder Prodigy' }))
await allowed('a guest without a commander yet', setDoc(doc(gina, 'tournaments', STAGE, 'players', 'luigi'), entry({ name: 'Luigi', commander: null })))
await allowed('everyone sees the players', getDoc(doc(guest, 'tournaments', STAGE, 'players', 'mario rossi')))
await denied('a player, added by someone who is not a TO', setDoc(doc(ivan, 'tournaments', STAGE, 'players', 'ivan'), entry({ name: 'Ivan' })))
await denied('a player, added by a TO of another league', setDoc(doc(hank, 'tournaments', STAGE, 'players', 'hank'), entry({ name: 'Hank' })))
await denied('a player without a name', setDoc(doc(gina, 'tournaments', STAGE, 'players', 'x'), entry({ name: '' })))
await denied('a player with other fields', setDoc(doc(gina, 'tournaments', STAGE, 'players', 'x'), entry({ points: 99 })))
await allowed('a late entry and a drop', updateDoc(doc(gina, 'tournaments', STAGE, 'players', 'luigi'), { joined: 2, drop: 3 }))
await denied('a drop after round 30', updateDoc(doc(gina, 'tournaments', STAGE, 'players', 'luigi'), { drop: 31 }))

// players registering from the app with the code: kim holds a verified claim (mia), lea and max claims not verified yet
// (nina, mario rossi), pam one (pat) she never registers with
await asAdmin(async (db) => {
  await setDoc(doc(db, 'claims', 'mia'), { uid: 'kim', name: 'K', photo: null, at: 'x', verified: true })
  await setDoc(doc(db, 'claims', 'nina'), { uid: 'lea', name: 'L', photo: null, at: 'x' })
  await setDoc(doc(db, 'claims', 'mario rossi'), { uid: 'max', name: 'M', photo: null, at: 'x' })
  await setDoc(doc(db, 'claims', 'pat'), { uid: 'pam', name: 'P', photo: null, at: 'x' })
})
const kim = env.authenticatedContext('kim').firestore()
const lea = env.authenticatedContext('lea').firestore()
const max = env.authenticatedContext('max').firestore()
const pam = env.authenticatedContext('pam').firestore()
const self = (uid, more = {}) => ({ name: 'Mia', commander: null, secret: true, deck: null, uid, at: AT, by: uid, ...more })
const seat = (db, key) => doc(db, 'tournaments', STAGE, 'players', key)
const list = (db, key) => doc(db, 'tournaments', STAGE, 'players', key, 'private', 'deck')
// as the app registers (src/lib/tournaments.ts joinTournament): the commander in the private document, in the same go
const join = (db, key, data, commander = 'Kinnan, Bonder Prodigy', write = (b) => b.set(seat(db, key), data)) => {
  const b = writeBatch(db)
  b.set(list(db, key), { commander }, { merge: true })
  write(b)
  return b.commit()
}
const MOX = 'https://moxfield.com/decks/Ab3_x-9QzK'
await denied('registering with the app before the TO gives a code', join(kim, 'mia', self('kim')))
await denied('a code with lower case letters', updateDoc(doc(gina, 'tournaments', STAGE), { code: 'k7p3qx' }))
await denied('a code of five characters', updateDoc(doc(gina, 'tournaments', STAGE), { code: 'K7P3Q' }))
await allowed('the registration code, given by the TO', updateDoc(doc(gina, 'tournaments', STAGE), { code: 'K7P3QX' }))
await denied('a verified player registering as waiting', join(kim, 'mia', self('kim', { pending: true })))
await denied('registering without a commander', join(kim, 'mia', self('kim'), ''))
await denied('registering with the commander in the clear', setDoc(seat(kim, 'mia'), self('kim', { commander: 'Kinnan, Bonder Prodigy', secret: false })))
await denied('registering in the name of another account', join(kim, 'mia', self('lea')))
await denied('registering a player you did not claim', join(kim, 'pat', self('kim', { name: 'Pat' })))
await denied('registering with other fields', join(kim, 'mia', self('kim', { joined: 2 })))
await denied('registering with an oversized moment', join(kim, 'mia', self('kim', { deck: 'd1', at: AT + 'x'.repeat(100000) })))
await denied('registering with a deck check that is not true or false', join(kim, 'mia', self('kim', { deck: 'd1', invalid: 'no' })))
await allowed('a verified player registering, in at once', join(kim, 'mia', self('kim', { deck: 'd1', invalid: false })))
await denied('a linked player registering, not waiting', join(lea, 'nina', self('lea', { name: 'Nina' })))
await allowed('a linked player registering, waiting for the TO', join(lea, 'nina', self('lea', { name: 'Nina', pending: true })))
await denied('a waiting player letting themselves in', updateDoc(seat(lea, 'nina'), { pending: false }))
await allowed('changing your commander before round 1', join(lea, 'nina', null, 'Spider-Man 2099', (b) => b.update(seat(lea, 'nina'), { at: AT })))
await denied('changing it in the clear', updateDoc(seat(lea, 'nina'), { commander: 'Spider-Man 2099', secret: false }))
await allowed('a deck of the app that failed the check', updateDoc(seat(lea, 'nina'), { deck: 'd2', invalid: true }))
await denied('changing your name', updateDoc(seat(lea, 'nina'), { name: 'Queen' }))
await denied("changing someone else's commander", updateDoc(seat(lea, 'mia'), { commander: 'Spider-Man 2099' }))
await allowed('joining the registration the TO made', join(max, 'mario rossi', null, 'Atraxa, Grand Unifier', (b) => b.update(seat(max, 'mario rossi'), { secret: true, deck: null, uid: 'max', at: AT, by: 'max' })))
await denied("another player reads a secret commander", getDoc(list(kim, 'mario rossi')))
await denied('a spectator reads a secret commander', getDoc(list(guest, 'mario rossi')))
await allowed('your decklist', setDoc(list(lea, 'nina'), { link: MOX }, { merge: true }))
await allowed('saying you gave it', updateDoc(seat(lea, 'nina'), { list: true }))
await denied('a decklist that is not a Moxfield deck', setDoc(list(lea, 'nina'), { link: 'https://spy.example/decks/x' }))
await denied("a decklist for someone else", setDoc(list(kim, 'nina'), { link: MOX }))
await allowed('the TO reads a decklist', getDoc(list(gina, 'nina')))
await allowed('the player reads their decklist', getDoc(list(lea, 'nina')))
await denied('another player reads it during the tournament', getDoc(list(kim, 'nina')))
await denied('a spectator reads it during the tournament', getDoc(list(guest, 'nina')))
// the photo of a deck of the app (src/lib/tournaments.ts savePhoto), in place of the link
const PHOTO = { cards: 'Commander\n1 Kinnan, Bonder Prodigy\n\nDeck\n1 Sol Ring (C21) 263', name: 'Kinnan di Nina', at: AT, invalid: false }
await allowed('the photo of your deck, before round 1', setDoc(list(lea, 'nina'), { ...PHOTO, link: deleteField() }, { merge: true }))
await denied("the TO writing a player's photo", setDoc(list(gina, 'nina'), { cards: '1 Sol Ring' }, { merge: true }))
await denied('a photo for someone else', setDoc(list(kim, 'nina'), PHOTO, { merge: true }))
await denied('a photo too long', setDoc(list(lea, 'nina'), { cards: 'x'.repeat(20001) }, { merge: true }))
await denied('a photo with a check that is not true or false', setDoc(list(lea, 'nina'), { invalid: 'no' }, { merge: true }))
// the TO confirms a waiting player and verifies their claim, in one batch (src/lib/tournaments.ts confirmPlayer)
const confirm = (db, key, by, more = {}) => {
  const b = writeBatch(db)
  b.update(seat(db, key), { pending: deleteField() })
  b.update(doc(db, 'claims', key), { verified: true, verifiedBy: by, verifiedIn: STAGE, ...more })
  return b.commit()
}
await denied('verifying, by someone who is not a TO', updateDoc(doc(ivan, 'claims', 'nina'), { verified: true, verifiedBy: 'ivan', verifiedIn: STAGE }))
await denied('verifying, by a TO of another league', updateDoc(doc(hank, 'claims', 'nina'), { verified: true, verifiedBy: 'hank', verifiedIn: STAGE }))
await denied('verifying in the name of another TO', updateDoc(doc(gina, 'claims', 'nina'), { verified: true, verifiedBy: 'jo', verifiedIn: STAGE }))
await denied('verifying a player who did not register with the app', updateDoc(doc(gina, 'claims', 'pat'), { verified: true, verifiedBy: 'gina', verifiedIn: STAGE }))
await denied('verifying and changing the claim', confirm(gina, 'nina', 'gina', { name: 'X' }))
await allowed('confirming a waiting player, verifying their claim', confirm(gina, 'nina', 'gina'))
await denied('a TO taking the tick back', updateDoc(doc(gina, 'claims', 'nina'), { verified: false }))
await denied("changing who verified your claim", updateDoc(doc(lea, 'claims', 'nina'), { verifiedBy: 'lea' }))
await allowed('customising a page a TO verified', updateDoc(doc(lea, 'claims', 'nina'), { coverName: 'Sol Ring', coverArt: null, deck: null }))
await denied('an admin keeping a TO as who verified', updateDoc(doc(carol, 'claims', 'nina'), { verified: true, verifiedBy: 'carol' }))
await allowed('leaving before round 1', deleteDoc(seat(lea, 'nina')))
await allowed('registering again, now verified: in at once', join(lea, 'nina', self('lea', { name: 'Nina' })))

await denied('bringing a commander out before round 1', updateDoc(seat(gina, 'nina'), { commander: 'Spider-Man 2099', secret: deleteField() }))
// a round as src/lib/tournaments.ts writes it: the pairings and the clock in one batch
await allowed(
  'starting a round: pairings and clock together',
  (async () => {
    const b = writeBatch(gina)
    b.set(doc(gina, 'tournaments', STAGE, 'matches', 'r1t1'), { round: 1, table: 1, p1: 'mario rossi', p2: 'luigi', score: null })
    b.set(doc(gina, 'tournaments', STAGE, 'matches', 'r1t0'), { round: 1, table: 0, p1: 'peach', p2: null, score: null })
    b.set(doc(gina, 'tournaments', STAGE, 'matches', 'r1t2'), { round: 1, table: 2, p1: 'mia', p2: 'nina', score: null })
    b.update(doc(gina, 'tournaments', STAGE), { status: 'swiss', round: 1, started: serverTimestamp(), paused: true })
    // the secret commanders come out in the same go
    b.update(seat(gina, 'nina'), { commander: 'Spider-Man 2099', secret: deleteField() })
    await b.commit()
  })(),
)
await denied('changing your photo once round 1 started', setDoc(list(lea, 'nina'), { cards: '1 Sol Ring' }, { merge: true }))
await denied('taking the photo off once round 1 started', setDoc(list(lea, 'nina'), { link: MOX, cards: deleteField() }, { merge: true }))
await denied('deleting your decklist once round 1 started', deleteDoc(list(lea, 'nina')))
await allowed('the TO reads the photo, for a deck check', getDoc(list(gina, 'nina')))
const r1 = doc(gina, 'tournaments', STAGE, 'matches', 'r1t1')
await allowed('a result, by the TO', updateDoc(r1, { score: [2, 1, 0] }))
await allowed('an intentional draw', updateDoc(r1, { score: [0, 0, 0] }))
await allowed('minutes added to a table', updateDoc(r1, { extra: 5 }))
await denied('a result that is not a Bo3 (3-0)', updateDoc(r1, { score: [3, 0, 0] }))
await denied('a result that is not a Bo3 (2-1 and a draw)', updateDoc(r1, { score: [2, 1, 1] }))
await denied('a result that is not a Bo3 (two numbers)', updateDoc(r1, { score: [2, 1] }))
await denied('an hour added to a table', updateDoc(r1, { extra: 61 }))
await denied('a result, by someone who is not a TO', updateDoc(doc(ivan, 'tournaments', STAGE, 'matches', 'r1t1'), { score: [0, 2, 0] }))
await allowed('everyone sees the matches', getDoc(doc(guest, 'tournaments', STAGE, 'matches', 'r1t1')))

// the log (src/lib/tournaments.ts logLine): signed and timed by the server, read by the TOs, never changed
const logs = (db) => collection(db, 'tournaments', STAGE, 'log')
const line = (by, more = {}) => ({ kind: 'score', round: 1, table: 1, from: '—', to: '2-1', at: serverTimestamp(), by, ...more })
await allowed('a line of the log, by the TO', addDoc(logs(gina), line('gina')))
// a player's line comes with the change it tells (src/lib/tournaments.ts logged), and must tell what that leaves
const told = (db, change, more) => {
  const b = writeBatch(db)
  change(b)
  b.set(doc(logs(db)), line('kim', more))
  return b.commit()
}
await allowed(
  'a line about your own result, with it',
  told(kim, (b) => b.update(doc(kim, 'tournaments', STAGE, 'matches', 'r1t2'), { score: [2, 1, 0], reportedBy: 'mia', confirmed: false }), { kind: 'report', player: 'mia', table: 2 }),
)
await denied('a line about a table you do not play', addDoc(logs(kim), line('kim', { kind: 'report', player: 'mia' })))
await denied('a line confirming a result nobody confirmed', addDoc(logs(kim), line('kim', { kind: 'confirm', player: 'mia', table: 2 })))
await denied('a line about a drop that did not happen', addDoc(logs(kim), line('kim', { kind: 'drop', player: 'mia' })))
await denied('a line about leaving, still registered', addDoc(logs(kim), line('kim', { kind: 'leave', player: 'mia', round: null, table: null })))
await denied('a line in the name of another account', addDoc(logs(gina), line('carol')))
await denied('a line with a time of the phone', addDoc(logs(gina), line('gina', { at: AT })))
await denied('a line of a kind the log does not know', addDoc(logs(gina), line('gina', { kind: 'cheat' })))
await denied('a line with other fields', addDoc(logs(gina), line('gina', { note: 'x' })))
await denied("a line about someone else's result", addDoc(logs(kim), line('kim', { kind: 'report', player: 'nina' })))
await denied('a TO line, by a player', addDoc(logs(kim), line('kim', { player: 'mia' })))
await denied('a line, by someone who is not a TO', addDoc(logs(ivan), line('ivan')))
const first = await addDoc(logs(gina), line('gina'))
await allowed('the TO reads the log', getDoc(doc(gina, first.path)))
await denied('a player reads the log', getDoc(doc(kim, first.path)))
await denied('a spectator reads the log', getDoc(doc(guest, first.path)))
await denied('changing a line', updateDoc(doc(gina, first.path), { to: '0-2' }))
await denied('deleting a line, even the TO', deleteDoc(doc(gina, first.path)))
// penalties: given by the TO, seen by the player's account too
const penalty = (more = {}) => line('gina', { kind: 'warning', table: null, from: null, to: null, player: 'mia', infraction: 'tardiness', text: 'In ritardo di 5 minuti', uid: 'kim', ...more })
await allowed('a penalty, by the TO', addDoc(logs(gina), penalty()))
await denied('a penalty with a note too long', addDoc(logs(gina), penalty({ text: 'x'.repeat(301) })))
await denied('a penalty, by a player', addDoc(logs(kim), line('kim', { kind: 'warning', player: 'mia' })))
await denied('a line of your own, readable by another account', addDoc(logs(kim), line('kim', { kind: 'report', player: 'mia', uid: 'lea' })))
const mine = (db, uid) => getDocs(query(logs(db), where('uid', '==', uid)))
await allowed('the player reads their penalties', mine(kim, 'kim'))
await denied("a player reads someone else's penalties", mine(lea, 'kim'))

// results entered by the players: one reports, the other confirms
const t2 = (db) => doc(db, 'tournaments', STAGE, 'matches', 'r1t2')
const rep = (score, by) => ({ score, reportedBy: by, confirmed: false })
await denied('a result for a table you do not play', updateDoc(t2(ivan), rep([2, 0, 0], 'mia')))
await denied('a result in the name of your opponent', updateDoc(t2(kim), rep([2, 0, 0], 'nina')))
await denied('a result that is not a Bo3, by a player', updateDoc(t2(kim), rep([3, 0, 0], 'mia')))
await denied('a result that arrives confirmed', updateDoc(t2(kim), { score: [2, 1, 0], reportedBy: 'mia', confirmed: true }))
await denied('a player adding minutes', updateDoc(t2(kim), { extra: 5 }))
await allowed('a result, by one of the players', updateDoc(t2(kim), rep([2, 1, 0], 'mia')))
await denied('confirming your own result', updateDoc(t2(kim), { confirmed: true }))
await allowed('the opponent entering another result', updateDoc(t2(lea), rep([1, 2, 0], 'nina')))
await denied('confirming and changing it', updateDoc(t2(kim), { score: [2, 0, 0], confirmed: true }))
await allowed('the opponent confirming', updateDoc(t2(kim), { confirmed: true }))
await denied('a player changing a confirmed result', updateDoc(t2(lea), rep([2, 0, 0], 'nina')))
await allowed('the TO correcting a confirmed result', updateDoc(t2(gina), { score: [2, 0, 0], reportedBy: deleteField(), confirmed: deleteField() }))
await denied("a result for someone else's table", updateDoc(doc(kim, 'tournaments', STAGE, 'matches', 'r1t1'), rep([2, 0, 0], 'mia')))
await denied('a result by a player whose claim is not verified', updateDoc(doc(max, 'tournaments', STAGE, 'matches', 'r1t1'), rep([2, 0, 0], 'mario rossi')))
await asAdmin((db) => setDoc(doc(db, 'tournaments', STAGE, 'matches', 'r2t1'), { round: 2, table: 1, p1: 'mia', p2: 'nina', score: null }))
await denied('a result for a round not being played', updateDoc(doc(kim, 'tournaments', STAGE, 'matches', 'r2t1'), rep([2, 0, 0], 'mia')))
await asAdmin((db) => deleteDoc(doc(db, 'tournaments', STAGE, 'matches', 'r2t1')))
// once round 1 started
await denied('registering after round 1 started', join(pam, 'pat', self('pam', { name: 'Pat', pending: true })))
await denied('changing your commander after round 1', updateDoc(seat(kim, 'mia'), { commander: 'Atraxa, Grand Unifier', at: AT }))
await denied('leaving after round 1, other than with a drop', deleteDoc(seat(kim, 'mia')))
await denied('a drop after another round', updateDoc(seat(kim, 'mia'), { drop: 2 }))
await denied('a drop by a player whose claim is not verified', updateDoc(seat(max, 'mario rossi'), { drop: 1 }))
await denied("dropping someone else", updateDoc(seat(kim, 'nina'), { drop: 1 }))
await allowed('your drop, after the round being played', updateDoc(seat(kim, 'mia'), { drop: 1 }))
await denied('taking your drop back', updateDoc(seat(kim, 'mia'), { drop: deleteField() }))
await allowed('a decklist given after round 1', setDoc(list(kim, 'mia'), { link: `${MOX}/` }))

// over: the decklists become public; in the sheet: they can't change anymore
await allowed('ending the tournament', updateDoc(doc(gina, 'tournaments', STAGE), { status: 'done' }))
await allowed('everyone reads the decklists once it is over', getDoc(list(guest, 'nina')))
await allowed('the results in the sheet', updateDoc(doc(gina, 'tournaments', STAGE), { filed: true }))
await denied('a decklist changed once in the sheet', setDoc(list(lea, 'nina'), { link: MOX }))
await denied('saying you gave it once in the sheet', updateDoc(seat(lea, 'nina'), { list: false }))
// a list of Castra that went missing: only an admin puts it back, once it's over (replacePhoto)
const photo = { cards: 'Deck\n1 Sol Ring', name: 'Atraxa', at: 'x', invalid: false, link: deleteField() }
await denied('a TO putting back a photo once it is over', setDoc(list(gina, 'nina'), photo, { merge: true }))
await allowed(
  'an admin putting back a photo once it is over',
  (async () => {
    const b = writeBatch(carol)
    b.set(list(carol, 'nina'), photo, { merge: true })
    b.update(seat(carol, 'nina'), { list: true })
    b.set(doc(logs(carol)), { kind: 'photo', player: 'nina', at: serverTimestamp(), by: 'carol' })
    await b.commit()
  })(),
)

// a TO who is no longer one
await asAdmin((db) => deleteDoc(doc(db, 'organizers', 'jo')))
await denied('a TO whose role was removed', updateDoc(doc(jo, 'tournaments', STAGE, 'matches', 'r1t1'), { score: [0, 2, 0] }))

// cancelling: the matches, the players and the tournament in one batch
const cancel = (db) => {
  const b = writeBatch(db)
  for (const id of ['r1t1', 'r1t0']) b.delete(doc(db, 'tournaments', STAGE, 'matches', id))
  for (const id of ['mario rossi', 'luigi']) b.delete(doc(db, 'tournaments', STAGE, 'players', id))
  b.delete(doc(db, 'tournaments', STAGE))
  return b.commit()
}
await denied('cancelling, by someone who is not a TO', cancel(ivan))
await allowed('cancelling, by the TO', cancel(gina))

// reports, as src/lib/feedback.ts sends them
const dave = env.authenticatedContext('dave', { email: 'dave@example.com' }).firestore()
const report = (uid, more = {}) => ({
  uid, name: 'Dave', email: null, kind: 'data', text: 'A stage is missing', page: '#meta/p~mario', about: 'Mario',
  version: '2026-11-02 · abc1234', device: 'Android · Chrome', at: new Date().toISOString(), done: false, ...more,
})
await allowed('a report', setDoc(doc(dave, 'feedback', 'r1'), report('dave')))
await allowed('a report with your own email to answer', addDoc(collection(dave, 'feedback'), report('dave', { email: 'dave@example.com' })))
await denied('a report in someone else\'s name', addDoc(collection(dave, 'feedback'), report('alice')))
await denied('a report with an email that is not yours', addDoc(collection(dave, 'feedback'), report('dave', { email: 'spy@example.com' })))
await denied('a report without signing in', addDoc(collection(guest, 'feedback'), report('dave')))
await denied('an empty report', addDoc(collection(dave, 'feedback'), report('dave', { text: '' })))
await denied('an oversized report', addDoc(collection(dave, 'feedback'), report('dave', { text: 'x'.repeat(2001) })))
await denied('a report that arrives done', addDoc(collection(dave, 'feedback'), report('dave', { done: true })))
await denied('a report with other fields', addDoc(collection(dave, 'feedback'), report('dave', { admin: true })))
await denied('reading reports, by their sender', getDoc(doc(dave, 'feedback', 'r1')))
await denied('marking your own report done', updateDoc(doc(dave, 'feedback', 'r1'), { done: true }))
await allowed('reading reports, by an admin', getDoc(doc(carol, 'feedback', 'r1')))
await allowed('marking a report done, by an admin', updateDoc(doc(carol, 'feedback', 'r1'), { done: true }))
await denied('an admin changing the text', updateDoc(doc(carol, 'feedback', 'r1'), { text: 'x' }))
await allowed('deleting a report, by an admin', deleteDoc(doc(carol, 'feedback', 'r1')))

// notifications: each device saves its token under its own account (src/lib/push.ts); what scripts/notify.mjs saw
// is for that script only
await allowed('saving your device for notifications', setDoc(doc(dave, 'users', 'dave', 'devices', 'tok'), { at: 'x' }))
await denied("saving a device in someone else's account", setDoc(doc(dave, 'users', 'alice', 'devices', 'tok'), { at: 'x' }))
await denied('reading what the notifications saw', getDoc(doc(carol, 'notify', 'state')))

// decks: private unless the owner shares them (src/lib/decks.ts Visibility)
const deck = (id, visibility) => setDoc(doc(dave, 'users', 'dave', 'decks', id), { id, name: id, ...(visibility && { visibility }) })
await allowed('saving your decks', Promise.all([deck('old'), deck('priv', 'private'), deck('unl', 'unlisted'), deck('pub', 'public')]))
await denied("reading someone else's deck saved before sharing existed", getDoc(doc(guest, 'users', 'dave', 'decks', 'old')))
await denied("reading someone else's private deck", getDoc(doc(alice, 'users', 'dave', 'decks', 'priv')))
await allowed('opening an unlisted deck from its link, signed out', getDoc(doc(guest, 'users', 'dave', 'decks', 'unl')))
await allowed('opening a public deck from its link', getDoc(doc(alice, 'users', 'dave', 'decks', 'pub')))
await allowed('a deck that no longer exists reads as missing', getDoc(doc(guest, 'users', 'dave', 'decks', 'gone')))
await allowed("listing someone's public decks", getDocs(query(collection(guest, 'users', 'dave', 'decks'), where('visibility', '==', 'public'))))
await denied("listing someone's unlisted decks", getDocs(query(collection(guest, 'users', 'dave', 'decks'), where('visibility', '==', 'unlisted'))))
await denied("listing all of someone's decks", getDocs(collection(alice, 'users', 'dave', 'decks')))
await denied("changing someone else's public deck", setDoc(doc(alice, 'users', 'dave', 'decks', 'pub'), { id: 'pub', name: 'x', visibility: 'public' }))

// the public decks of the verified players (src/lib/publicDecks.ts): read by everyone, by commander
await asAdmin(async (db) => {
  await setDoc(doc(db, 'claims', 'pit'), { uid: 'pia', name: 'G', photo: null, at: 'x', verified: true })
  await setDoc(doc(db, 'claims', 'quill'), { uid: 'quinn', name: 'H', photo: null, at: 'x' })
})
const pia = env.authenticatedContext('pia').firestore()
const quinn = env.authenticatedContext('quinn').firestore()
const card = (uid, player, extra = {}) => ({
  uid, deck: 'd1', player, name: 'Kinnan turbo', commanders: ['Kinnan, Bonder Prodigy'], tags: ['combo'],
  cover: 'https://cards.scryfall.io/art_crop/front/a/b/ab12.jpg?1', at: AT, ...extra,
})
await allowed('a verified player listing a public deck', setDoc(doc(pia, 'publicDecks', 'pia~d1'), card('pia', 'pit')))
await allowed('everyone finding the decks of a commander', getDocs(query(collection(guest, 'publicDecks'), where('commanders', 'array-contains', 'Kinnan, Bonder Prodigy'))))
await denied('a player not verified listing a deck', setDoc(doc(quinn, 'publicDecks', 'quinn~d1'), card('quinn', 'quill')))
await denied("listing a deck on someone else's verified player", setDoc(doc(quinn, 'publicDecks', 'quinn~d1'), card('quinn', 'pit')))
await denied("listing a deck as someone else", setDoc(doc(quinn, 'publicDecks', 'pia~d2'), card('pia', 'pit', { deck: 'd2' })))
await denied('a card whose id is not its deck', setDoc(doc(pia, 'publicDecks', 'pia~x'), card('pia', 'pit')))
await denied('a cover from another site', setDoc(doc(pia, 'publicDecks', 'pia~d1'), card('pia', 'pit', { cover: 'https://spy.example/p.png' })))
await denied('a card with other fields', setDoc(doc(pia, 'publicDecks', 'pia~d1'), card('pia', 'pit', { cards: [] })))
await denied("removing someone else's card", deleteDoc(doc(quinn, 'publicDecks', 'pia~d1')))
await allowed('removing your own card', deleteDoc(doc(pia, 'publicDecks', 'pia~d1')))
await allowed('removing a card already gone', deleteDoc(doc(pia, 'publicDecks', 'pia~d9')))
// deleting the account (src/lib/account.ts): its cards found by uid, deleted with the rest
await setDoc(doc(pia, 'publicDecks', 'pia~d1'), card('pia', 'pit'))
await allowed(
  'deleting the account, with the cards of its public decks',
  (async () => {
    const b = writeBatch(pia)
    for (const d of (await getDocs(query(collection(pia, 'publicDecks'), where('uid', '==', 'pia')))).docs) b.delete(d.ref)
    b.delete(doc(pia, 'users', 'pia'))
    await b.commit()
    if (!(await getDocs(query(collection(guest, 'publicDecks'), where('uid', '==', 'pia')))).empty) throw new Error('a card left')
  })(),
)

await env.cleanup()
