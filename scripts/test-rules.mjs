// Tests firestore.rules, the only protection of the data, on the Firestore emulator. Run by
// .github/workflows/rules.yml when the rules change; by hand (needs Java):
//   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@4
//   npx firebase emulators:exec --only firestore --project demo-castra 'node scripts/test-rules.mjs'

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

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

await env.cleanup()
