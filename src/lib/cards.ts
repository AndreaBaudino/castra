import { CARDS_DATA_URL } from '../config'

// ---------- errata: the text as first printed, for the cards whose text changed since ----------

export interface Errata {
  set: string
  setName: string
  date: string
  faces: { name: string; text: string; type: string }[]
}

type Shard = Record<string, { s: string; n: string; d: string; f: { n: string; t: string; y: string }[] }>

// the data is split by the first two characters of the Oracle id: one small file per group, read once
const shards = new Map<string, Promise<Shard>>()

function shard(key: string) {
  if (!shards.has(key)) {
    const p = fetch(`${CARDS_DATA_URL}errata/${key}.json`).then((r) => (r.ok ? (r.json() as Promise<Shard>) : r.status === 404 ? {} : Promise.reject(new Error(`${r.status}`))))
    p.catch(() => shards.delete(key)) // offline: try again next time
    shards.set(key, p)
  }
  return shards.get(key)!
}

/** The card's first printing, when its text differs from today's in more than wording; null when it doesn't. */
export async function fetchErrata(oracleId: string): Promise<Errata | null> {
  const e = (await shard(oracleId.slice(0, 2)))[oracleId]
  return e ? { set: e.s, setName: e.n, date: e.d, faces: e.f.map((f) => ({ name: f.n, text: f.t, type: f.y })) } : null
}

// ---------- word diff, to mark what changed between two texts ----------

export interface DiffPart {
  text: string
  changed?: boolean
}

const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? []
const same = (x: string, y: string) => x === y || (!x.trim() && !y.trim()) // a line break and a space are the same

/**
 * The two texts in words, with what's only in `before` (removed) and only in `after` (added) marked as changed
 * (longest common subsequence of words).
 */
export function diffWords(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } {
  const a = tokens(before)
  const b = tokens(after)
  // lengths of the common subsequences of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = same(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out = { before: [] as DiffPart[], after: [] as DiffPart[] }
  const push = (list: DiffPart[], text: string, changed: boolean) => {
    const last = list[list.length - 1]
    if (last && !!last.changed === changed) last.text += text
    else list.push(changed ? { text, changed } : { text })
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(a[i], b[j])) {
      push(out.before, a[i++], false)
      push(out.after, b[j++], false)
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) push(out.after, b[j++], true)
    else push(out.before, a[i++], true)
  }
  return { before: joinGaps(out.before), after: joinGaps(out.after) }
}

// a space between two changes belongs to them, so "the battlefield" reads as one change, not two
function joinGaps(parts: DiffPart[]) {
  const out: DiffPart[] = []
  parts.forEach((p, k) => {
    const last = out[out.length - 1]
    const gap = !p.changed && !p.text.trim() && last?.changed && parts[k + 1]?.changed
    if (last?.changed && (gap || p.changed)) last.text += p.text
    else out.push({ ...p })
  })
  return out
}

// ---------- recent searches ----------

export const RECENT_CARDS_KEY = 'cc.cards.recent'
export const addRecent = (list: string[], name: string) => [name, ...list.filter((n) => n !== name)].slice(0, 8)
