/**
 * The circuit's deck lists (scripts/meta/decklists.json, read once from Moxfield and never again) given to the year's
 * entries, by the rules of docs/liste-mazzi.md: an entry listed in the archive under the same commander takes that
 * list; any other entry of a player with a list for the same commander takes that player's latest one, but a list read
 * later (`taken` of the list) never replaces the one an entry played before that day already took. Returns, for
 * each entry, [list index, 1 when taken by extension] or null, and the archive's entries no longer found (orphans).
 * An entry whose tournament changed id (a level's date corrected, a league renamed) is found again by player, link and
 * commander among the tournaments the archive doesn't know; with more than one, a league's stage by its number, then
 * the one played by the day the list was read.
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
  const direct = (li, i) => {
    const l = archive.lists[li]
    out[i] = [li, 0]
    const k = `${key(e[i][1])}|${l.commander}`
    const m = own.get(k) ?? own.set(k, {}).get(k)
    const b = l.taken ?? archive.taken
    if (!m[b] || rank[e[i][0]] > m[b][1]) m[b] = [li, rank[e[i][0]]]
  }
  const lost = []
  archive.lists.forEach((l, li) => {
    for (const [tid, player] of l.entries) {
      const i = at.get(`${tid}|${key(player)}`)
      if (i == null) lost.push([li, tid, player])
      else if (c[e[i][2]]?.n !== l.commander) orphans.push(`${tid} ${player}: ${l.link}`)
      else direct(li, i)
    }
  })
  // the lost ones, once every entry still found has its list
  const known = new Set(t.map((x) => x.id))
  const alive = new Set(archive.lists.flatMap((l) => l.entries.map(([tid]) => tid)).filter((tid) => known.has(tid)))
  for (const [li, tid, player] of lost) {
    const l = archive.lists[li]
    let fits = []
    e.forEach((x, i) => {
      if (out[i] || alive.has(t[x[0]].id) || !x[1] || key(x[1]) !== key(player)) return
      if (c[x[2]]?.n === l.commander && deckId(x[8]) === deckId(l.link)) fits.push(i)
    })
    // the same link at several tournaments: a league's stage with the same number, then one played by the day read
    const stage = /^s\d+-.+-(\d+)$/.exec(tid)?.[1]
    if (fits.length > 1 && stage) fits = fits.filter((i) => t[e[i][0]].st === +stage)
    if (fits.length > 1) fits = fits.filter((i) => day[e[i][0]] <= (l.taken ?? archive.taken))
    if (fits.length === 1) direct(li, fits[0])
    else orphans.push(`${tid} ${player}: ${l.link}`)
  }
  e.forEach((x, i) => {
    const m = !out[i] && x[1] && x[2] >= 0 && own.get(`${key(x[1])}|${c[x[2]].n}`)
    const mine = m && latest(m, day[x[0]])
    if (mine) out[i] = [mine[0], 1]
  })
  return { lists: out, orphans }
}

// the deck's id in a Moxfield link, also when the sheet has it pasted twice in one cell
const deckId = (link) => link?.match(/moxfield\.com\/decks\/([\w-]+?)(?=https?:|[^\w-]|$)/)?.[1] ?? link

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
