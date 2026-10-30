/**
 * Where the app reads the meta (every year's tournament data, built by `npm run meta` into public/meta.json): the
 * meta-data branch, rewritten every night by .github/workflows/meta.yml, so new results show up without a new
 * release. The copy in public/ is the fallback.
 */
export const META_DATA_URL = 'https://raw.githubusercontent.com/AndreaBaudino/castra/meta-data/meta.json'

/**
 * Where the app reads the errata (for each card whose text changed since its first printing, the text as printed
 * there): the cards-data branch, rebuilt every week from MTGJSON by .github/workflows/cards.yml.
 */
export const CARDS_DATA_URL = 'https://raw.githubusercontent.com/AndreaBaudino/castra/cards-data/'

/**
 * Google Sheet of the Centurion circuit: overall leaderboard, city leagues (S1, S2) and big events.
 * Read through the CSV export, by tab id (the gid=… in the tab's URL).
 */
export const CIRCUIT_SHEET_ID = '186xE3qYmCdJeMQpmXXO7UqPL8ER2FUFos-K5OFWWtVQ'
export const CIRCUIT_TABS = { leaderboard: '1845835181', s1: '638335391', s2: '722468170', events: '503261492' }
/** Players invited to the Player of the Year by ranking (on top of those invited at events). */
export const POTY_SPOTS = 16

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

/** Links on the account page. */
export const FORMAT_SITE_URL = 'https://www.centurioncommander.eu/it/home-ita/'
export const BANLIST_URL = 'https://www.centurioncommander.eu/it/ban-list-it/'
/** Where "Report a problem" leads: an issue on the app's repository. */
export const FEEDBACK_URL = 'https://github.com/AndreaBaudino/castra/issues/new'
/** the privacy notice: a plain page published with the app (public/privacy.html) */
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`
