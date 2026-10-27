/**
 * Google Sheet with the official meta data.
 *
 * Share the sheet as "Anyone with the link can view", then paste here the sheet ID
 * (the long string in https://docs.google.com/spreadsheets/d/<ID>/edit) and,
 * optionally, the tab name. While META_SHEET_ID is empty the app shows demo data.
 *
 * Expected columns (header names are matched loosely, IT or EN, order doesn't matter):
 *   Mazzo/Comandante/Deck/Commander | Partite/Games | Vittorie/Wins
 *   Sconfitte/Losses (optional) | Pareggi/Draws (optional) | Colori/Colors (optional, e.g. "WUB")
 *   Meta %/Share (optional: otherwise computed from games)
 */
export const META_SHEET_ID = ''
export const META_SHEET_TAB = ''

/** Optional second tab with a free-text editorial summary (first column, one paragraph per row). */
export const META_SUMMARY_TAB = ''

/**
 * Google Sheet of the Centurion circuit: overall leaderboard, city leagues (S1, S2) and big events.
 * Read through the CSV export, by tab id (the gid=… in the tab's URL).
 */
export const CIRCUIT_SHEET_ID = '186xE3qYmCdJeMQpmXXO7UqPL8ER2FUFos-K5OFWWtVQ'
export const CIRCUIT_TABS = { leaderboard: '1845835181', s1: '638335391', s2: '722468170', events: '503261492' }
/** Players invited to the Player of the Year by ranking (on top of those invited at events). */
export const POTY_SPOTS = 36

export const STARTING_LIFE = 25
export const COMMANDER_DAMAGE_LETHAL = 21
export const POISON_LETHAL = 10
export const DECK_SIZE = 100

/**
 * Firebase web config (Project settings → Your apps → Web app). These values are public by design:
 * access is protected by Firestore security rules (see README). While null, login and cloud sync are off.
 */
export const FIREBASE_CONFIG: {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
} | null = {
  apiKey: 'AIzaSyAWkh01_9CzppTPtZcb2tlQyNpNhcQbXLQ',
  authDomain: 'castra-a69ab.firebaseapp.com',
  projectId: 'castra-a69ab',
  storageBucket: 'castra-a69ab.firebasestorage.app',
  messagingSenderId: '428975402839',
  appId: '1:428975402839:web:4f511428f1a6ad7d4d1812',
}
