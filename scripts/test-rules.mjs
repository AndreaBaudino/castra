// Tests firestore.rules, the only protection of the data, on the Firestore emulator. Run by
// .github/workflows/rules.yml when the rules change; by hand (needs Java):
//   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@4
//   npx firebase emulators:exec --only firestore --project demo-castra 'node scripts/test-rules.mjs'

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'demo-castra',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
})
const alice = env.authenticatedContext('alice').firestore()
const bob = env.authenticatedContext('bob').firestore()
const guest = env.unauthenticatedContext().firestore()
const asAdmin = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()))

// "this is me" as the app writes it (src/lib/claims.ts): the claim and the account's link, dropping the previous claim
function claim(db, uid, key, previous, name = 'Name', photo = null) {
  const b = writeBatch(db)
  if (previous) b.delete(doc(db, 'claims', previous))
  b.set(doc(db, 'claims', key), { uid, name, photo, at: 'x' })
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
preVerified.set(doc(alice, 'claims', 'daisy'), { uid: 'alice', name: 'A', photo: null, at: 'x', verified: true })
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

await env.cleanup()
