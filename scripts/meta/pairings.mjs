/**
 * The matches of a tournament run in the app as the meta's pairings: [tournament, commander, commander, result]
 * (1: the first won, 2: the second, 0: drawn). The commanders are those of the players' rows in the sheet (`cmdOf`,
 * by player key), so the meta's corrections apply. Byes, matches without a result and players without a commander
 * in the sheet are left out.
 */
export function pairingsOf(t, matches, cmdOf) {
  return matches.flatMap((m) => {
    const a = cmdOf.get(m.p1) ?? -1
    const b = cmdOf.get(m.p2) ?? -1
    if (!m.p2 || !Array.isArray(m.score) || a < 0 || b < 0) return []
    const [x, y] = m.score
    return [[t, a, b, x > y ? 1 : y > x ? 2 : 0]]
  })
}

/**
 * The same matches with their players, for the players' Elo (docs/elo.md): [tournament, entry, entry, games won by
 * the first, by the second, drawn, round]. The entries are the players' rows in the sheet (`entryOf`, by player key),
 * so a player without a commander counts too; byes, matches without a result and players not in the sheet are left
 * out. The round tells the Swiss from the top cut.
 */
export function playerMatchesOf(t, matches, entryOf) {
  return matches.flatMap((m) => {
    const a = entryOf.get(m.p1)
    const b = entryOf.get(m.p2)
    if (!m.p2 || !Array.isArray(m.score) || a == null || b == null) return []
    const [x, y, d = 0] = m.score
    return [[t, a, b, x, y, d, m.round]]
  })
}
