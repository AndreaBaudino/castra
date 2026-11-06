export type Result = 'W' | 'L' | 'D'
export type Format = 'bo1' | 'bo3'

export interface Match {
  id: string
  date: string // ISO
  result: Result // for a bo3, derived from the score
  format?: Format // missing on older matches: bo1
  games?: Result[] // bo3 only: each game's result, in order
  score?: [number, number] // bo3 only: games won, games lost
  deckId?: string // set when the deck is one of the saved decks
  deckName: string
  opponent: string // the opponent's commander
  opponentName?: string // the opponent player, as typed
  opponentPlayer?: string // their circuit player key, when the name is in the ranking
  start?: 'play' | 'draw' // who went first (game 1 of a bo3): on the play = me
  kind: 'tournament' | 'casual'
  durationMin?: number
  notes?: string
  // a tournament run in the app (src/lib/tournaments.ts personalMatches): the final position, and the player's key
  // when the deck's photo was the decklist (its page: #live/<tournament>@<key>)
  place?: number
  photo?: string
}

export interface Record3 {
  w: number
  l: number
  d: number
  games: number
  wr: number // draws count as non-wins
}

export function record(ms: Match[]): Record3 {
  const w = ms.filter((m) => m.result === 'W').length
  const l = ms.filter((m) => m.result === 'L').length
  const d = ms.length - w - l
  return { w, l, d, games: ms.length, wr: ms.length ? w / ms.length : 0 }
}

export function groupBy(ms: Match[], key: (m: Match) => string) {
  const map = new Map<string, Match[]>()
  for (const m of ms) {
    const k = key(m).trim() || '—'
    map.set(k, [...(map.get(k) ?? []), m])
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, list, rec: record(list) }))
    .sort((a, b) => b.rec.games - a.rec.games || b.rec.wr - a.rec.wr)
}

export const fmtRecord = (r: Record3) => (r.d ? `${r.w}-${r.l}-${r.d}` : `${r.w}-${r.l}`)

export interface DeckTournament {
  id: string // the tournament's id in the app
  name: string
  date: string // ISO, its first game
  rec: Record3
  place?: number
  photo?: string
}

/** The tournaments run in the app a deck was played at, the newest first: from the games they put in the stats
 * (their ids: <tournament>~r<round>). */
export function deckTournaments(matches: Match[], deckId: string): DeckTournament[] {
  const by = new Map<string, Match[]>()
  for (const m of matches) {
    const id = m.kind === 'tournament' && m.deckId === deckId && /~r\d+$/.test(m.id) && m.id.replace(/~r\d+$/, '')
    if (id) by.set(id, [...(by.get(id) ?? []), m])
  }
  return [...by]
    .map(([id, ms]) => ({
      id,
      name: ms[0].notes ?? '',
      date: ms.map((m) => m.date).sort()[0],
      rec: record(ms),
      place: ms.find((m) => m.place)?.place,
      photo: ms.find((m) => m.photo)?.photo,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * The games of a bo3 that count: from the first, stopping at a missing one or once someone has won two.
 * Fewer than three without a winner is fine (the round ran out of time).
 */
export function playedGames(games: (Result | undefined)[]): Result[] {
  const out: Result[] = []
  for (const g of games.slice(0, 3)) {
    if (!g) break
    out.push(g)
    const [w, l] = scoreOf(out)
    if (w === 2 || l === 2) break
  }
  return out
}

export const scoreOf = (games: Result[]): [number, number] => [
  games.filter((g) => g === 'W').length,
  games.filter((g) => g === 'L').length,
]

export const resultOfScore = ([w, l]: [number, number]): Result => (w > l ? 'W' : l > w ? 'L' : 'D')

/** What the result badge shows: W/L/D for a bo1, the score (2-1) for a bo3. */
export const resultLabel = (m: Match) => (m.format === 'bo3' && m.score ? m.score.join('-') : m.result)
