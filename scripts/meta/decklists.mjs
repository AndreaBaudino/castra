/**
 * The circuit's deck lists (scripts/meta/decklists.json, read once from Moxfield and never again) given to the year's
 * entries, by the rules of docs/liste-mazzi.md: an entry listed in the archive under the same commander takes that
 * list; any other entry of a player with a list for the same commander takes that player's latest one, but a list read
 * later (`taken` of the list) never replaces the one an entry played before that day already took. Returns, for
 * each entry, [list index, 1 when taken by extension] or null, and the archive's entries no longer found (orphans).
 * Only the year the archive was taken in: a list of that year says nothing about the next one's decks.
 * `t`, `c`, `e` are the year's tournaments, commanders and entries as in meta.json; `key` is playerKey.
 */
export function assignLists(archive, year, t, c, e, key) {
  const out = e.map(() => null)
  if (year !== +archive.taken.slice(0, 4)) return { lists: out, orphans: [] }
  const at = new Map(e.map((x, i) => [`${t[x[0]].id}|${x[1] && key(x[1])}`, i]))
  const orphans = []
  const own = new Map() // player key|commander → { day the list was read → [list, latest tournament rank] }
  const [rank, day] = ranks(t)
  archive.lists.forEach((l, li) => {
    for (const [tid, player] of l.entries) {
      const i = at.get(`${tid}|${key(player)}`)
      const x = e[i]
      if (i == null || c[x[2]]?.n !== l.commander) {
        orphans.push(`${tid} ${player}: ${l.link}`)
        continue
      }
      out[i] = [li, 0]
      const k = `${key(player)}|${l.commander}`
      const r = rank[x[0]]
      const m = own.get(k) ?? own.set(k, {}).get(k)
      const b = l.taken ?? archive.taken
      if (!m[b] || r > m[b][1]) m[b] = [li, r]
    }
  })
  e.forEach((x, i) => {
    const m = !out[i] && x[1] && x[2] >= 0 && own.get(`${key(x[1])}|${c[x[2]].n}`)
    const mine = m && latest(m, day[x[0]])
    if (mine) out[i] = [mine[0], 1]
  })
  return { lists: out, orphans }
}

// the latest list known when a tournament played on `d` was first given one: the lists read later don't replace it
function latest(m, d) {
  let best = null
  for (const b of Object.keys(m).sort()) {
    if (!best || m[b][1] > best[1]) best = m[b]
    if (d <= b) return best
  }
  return best
}

// tournaments in time order: by date, and between the stages of one league by their number, so a stage without a
// date comes right after the one before it
function ranks(t) {
  const day = t.map((x) => x.d ?? '')
  t.forEach((x, i) => {
    if (x.d || !x.st) return
    const before = t.filter((y) => y.lg === x.lg && y.s === x.s && y.d && y.st < x.st).sort((a, b) => b.st - a.st)[0]
    day[i] = before?.d ?? ''
  })
  const order = t.map((x, i) => i).sort((a, b) => day[a].localeCompare(day[b]) || (t[a].st ?? 0) - (t[b].st ?? 0) || a - b)
  const rank = []
  order.forEach((ti, r) => (rank[ti] = r))
  return [rank, day]
}

/** "1 Lightning Bolt" → "Lightning Bolt" */
export const cardName = (line) => line.replace(/^\d+x?\s+/, '')

/** A photo of a deck of the app (src/lib/tournaments.ts savePhoto, written as exportDecklist) as the archive's lines:
 * the 99 without the commander, "1 Sol Ring (C21) 263" → "1 Sol Ring". */
export const photoCards = (text) =>
  text
    .split(/^Deck$/m)
    .pop()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+\s/.test(l))
    .map((l) => l.replace(/\s+\([A-Za-z0-9]{2,6}\)(?:\s+[\w★-]+)?$/, ''))

/**
 * The photos of the decks of the app (docs/liste-mazzi.md, 8) given to the entries. The new ones join `archive`
 * (`photos`: tournament id in the app → player key → its private document), under the commander of their entry; one
 * already there never changes. Returns, for each year, each entry's photo index in the archive, or undefined.
 * `years`: as in meta.json, plus `app`, each tournament's id in the app; `key` is playerKey.
 */
export function givePhotos(archive, photos, years, key) {
  const at = (id, player) => `${id}|${player}`
  const have = new Set(archive.lists.map((l) => at(l.id, l.player)))
  for (const y of years)
    for (const x of y.e) {
      const [id, player] = [y.app[x[0]], x[1] && key(x[1])]
      const p = photos.get(id)?.get(player)
      if (!p || x[2] < 0 || have.has(at(id, player))) continue
      const c = y.c[x[2]].n
      archive.lists.push({ id, player, year: y.year, commander: c, name: p.name ?? '', at: p.at ?? '', invalid: !!p.invalid, cards: photoCards(p.cards) })
      have.add(at(id, player))
    }
  const index = new Map(archive.lists.map((l, i) => [at(l.id, l.player), i]))
  return years.map((y) => y.e.map((x) => index.get(at(y.app[x[0]], x[1] && key(x[1])))))
}
