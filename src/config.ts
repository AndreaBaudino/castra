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

/**
 * The Apps Script web app (scripts/meta/apps-script, the /exec link) that writes a tournament run in the app into its
 * sheet: the same one the nightly meta update reads the sheets with. Empty: the TOs copy the rows by hand.
 */
/**
 * The Apps Script web app (scripts/notify/apps-script, the /exec link) that sends the tournament notifications: the
 * pairings of each round, the results to confirm. Empty: none are sent, and the switch in the preferences is hidden.
 */
export const NOTIFY_URL = 'https://script.google.com/macros/s/AKfycbz5u3ydXQ3Y-PZAOFRj8B3OdCIKmF2X4BAHcK5wDNFHNn1I5OhmPrcX-DmTuVDIedahUw/exec'

export const PUBLISH_URL = 'https://script.google.com/macros/s/AKfycbwZ6k7iDXYg47BQxs0jHuVmm1HbXoOHqLTR6LR7hUiMqtjvUPtIKWD9lOe0alFlNdob/exec'

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
/** the privacy notice: a plain page published with the app (public/privacy.html) */
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`
/** The presentations of the app and of its tournaments, PDFs published with the app (public/) */
export const GUIDE_URL = `${import.meta.env.BASE_URL}castra.pdf`
export const TOURNAMENT_GUIDE_URL = `${import.meta.env.BASE_URL}castra-tornei.pdf`
