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
} | null = null
