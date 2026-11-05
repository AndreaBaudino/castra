/**
 * The circuit's deck lists (scripts/meta/decklists.json, read once from Moxfield and never again) given to the year's
 * entries, by the rules of docs/liste-mazzi.md: an entry listed in the archive under the same commander takes that
 * list; any other entry of a player with a list for the same commander takes that player's latest one. Returns, for
 * each entry, [list index, 1 when taken by extension] or null, and the archive's entries no longer found (orphans).
 * Only the year the archive was taken in: a list of that year says nothing about the next one's decks.
 * `t`, `c`, `e` are the year's tournaments, commanders and entries as in meta.json; `key` is playerKey.
 */
export function assignLists(archive, year, t, c, e, key) {
  const out = e.map(() => null)
  if (year !== +archive.taken.slice(0, 4)) return { lists: out, orphans: [] }
  const at = new Map(e.map((x, i) => [`${t[x[0]].id}|${x[1] && key(x[1])}`, i]))
  const orphans = []
  const own = new Map() // player key|commander → [list, latest tournament rank]
  const rank = ranks(t)
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
      if (!own.has(k) || r > own.get(k)[1]) own.set(k, [li, r])
    }
  })
  e.forEach((x, i) => {
    const mine = !out[i] && x[1] && x[2] >= 0 && own.get(`${key(x[1])}|${c[x[2]].n}`)
    if (mine) out[i] = [mine[0], 1]
  })
  return { lists: out, orphans }
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
  return rank
}

/** "1 Lightning Bolt" → "Lightning Bolt" */
export const cardName = (line) => line.replace(/^\d+x?\s+/, '')
