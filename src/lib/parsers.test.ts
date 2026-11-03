import { describe, expect, it, vi } from 'vitest'
import { buildCircuit, parseEventName, playerKey, potyStatus } from './circuit'
import { type Deck, type DeckCard, logChange, newerDeck, parseDecklist } from './decks'
import { parseCsv } from './meta'
import { DUNGEONS } from './dungeons'
import { readStored, writeStored } from './storage'
import { matchesCsv } from './backup'
import { mergeFirst } from './sync'
import type { Match } from './matches'

// The text the app reads from outside (pasted lists, the circuit sheet): a change of format must fail here,
// not silently on the users' phones.

describe('parseDecklist', () => {
  it('reads a Moxfield export: edition, foil and tags, double faces, repeated lines', () => {
    const cards = parseDecklist(
      ['1 Kenrith, the Returned King (ELD) 303 *F*', '1 Sol Ring (C21) 263 #ramp', '1 Fell the Profane / Fell Mire (ZNR) 116', '1 sol ring'].join('\n'),
    )
    expect(cards).toEqual([
      { name: 'Kenrith, the Returned King', qty: 1, section: 'main', set: 'eld', cn: '303' },
      { name: 'Sol Ring', qty: 2, section: 'main', set: 'c21', cn: '263' },
      { name: 'Fell the Profane // Fell Mire', qty: 1, section: 'main', set: 'znr', cn: '116' },
    ])
  })

  it('reads an Arena export, the companion outside the 100', () => {
    const text = 'Commander\n1 Kenrith, the Returned King (ELD) 303\n\nCompanion\n1 Lurrus of the Dream-Den (IKO) 226\n\nDeck\n1x Sol Ring\n\nSideboard\n1 Swords to Plowshares'
    expect(parseDecklist(text).map((c) => [c.name, c.qty, c.section])).toEqual([
      ['Kenrith, the Returned King', 1, 'commander'],
      ['Lurrus of the Dream-Den', 1, 'side'],
      ['Sol Ring', 1, 'main'],
      ['Swords to Plowshares', 1, 'side'],
    ])
  })

  it('reads MTGO lines: *CMDR* and SB:', () => {
    expect(parseDecklist('1 Kenrith *CMDR*\n// lands\n2 Island\nSB: 1 Pyroblast').map((c) => [c.name, c.qty, c.section])).toEqual([
      ['Kenrith', 1, 'commander'],
      ['Island', 2, 'main'],
      ['Pyroblast', 1, 'side'],
    ])
  })
})

describe('circuit sheet', () => {
  it('parses CSV quotes, line breaks inside cells and empty rows', () => {
    expect(parseCsv('a,"b ""c""",d\r\n,,\n"1st: 22 pts\n2nd: 15 pts",x\n')).toEqual([
      ['a', 'b "c"', 'd'],
      ['1st: 22 pts\n2nd: 15 pts', 'x'],
    ])
  })

  it('reads the date, level and players declared in event names', () => {
    expect(parseEventName('Cogoleto - FEB 22 - 34 PL')).toEqual({ declared: 34, month: 2, day: 22 })
    expect(parseEventName('Albisola - LV2- 20 settembre2026')).toEqual({ level: 2, year: 2026, month: 9, day: 20 })
    expect(parseEventName('23/08 - LV1 - Rocca3Corvi')).toEqual({ level: 1, day: 23, month: 8 })
  })

  it('normalises player names', () => {
    expect(playerKey('  Nicolò   D’Amico ')).toBe("nicolo d'amico")
  })

  // the shapes of the real tabs: notes above the leaderboard's header, one row per player and league, events as
  // blocks whose first row holds the title
  const circuit = buildCircuit({
    leaderboard: ',,,,\n,,Italy ,"1st: 22 pts\n2nd: 15 pts",\n,#,Player Name,Total,Leagues S1\n,1,Luigi Verdi,50,\n,2,Mario Rossi,40,25\n',
    s1: 'Player Name,Points,Lega,#Players,#tappe\nMario Rossi,18,Genova,12,4\nAnna Bianchi,10,Genova,12,4\nMario Rossi,25,Savona,8,3\n',
    s2: 'Player Name,Points,Lega,#Players,#tappe\n',
    events: [
      ' ,#,Player Name,Points,',
      'Cogoleto - FEB 22 - 34 PL,,Mario Rossi,20,',
      ',,Luigi Verdi, invito Poty,',
      ',,Anna Bianchi,2,',
      ',,Mario Rossi,2,',
      'Albisola - LV2- 20 settembre2026,1,Luigi Verdi,30,',
      ',2,Anna Bianchi,15,',
    ].join('\n'),
  })
  const player = (name: string) => circuit.players.find((p) => p.name === name)!

  it('builds the events: top 8 numbered or deduced, POTY invites, rows listed twice', () => {
    const [cogoleto, albisola] = circuit.events
    expect(cogoleto).toMatchObject({ year: 2026, month: 2, day: 22, players: 34 })
    expect(cogoleto.results).toEqual([
      { key: 'mario rossi', place: 1, points: 20, poty: false },
      { key: 'luigi verdi', place: 2, points: 0, poty: true },
      { key: 'anna bianchi', place: undefined, points: 2, poty: false },
    ])
    expect(albisola).toMatchObject({ level: 2, players: 2 })
    expect(albisola.results.map((r) => r.place)).toEqual([1, 2])
  })

  it('ranks the players: official rank and total, then the others by points', () => {
    expect(circuit.players.map((p) => [p.name, p.rank, p.total])).toEqual([
      ['Luigi Verdi', 1, 50],
      ['Mario Rossi', 2, 40],
      ['Anna Bianchi', 3, 27], // not in the leaderboard: league 10 + events 2 + 15
    ])
    expect(player('Luigi Verdi')).toMatchObject({ eventPoints: 30, top8: 2, best: 1, potyInvited: true })
  })

  it('keeps the best league of a player in two', () => {
    expect(player('Mario Rossi').s1).toEqual({ points: 25, league: 'Savona', leaguePlayers: 8, stages: 3, leagueRank: 1, also: ['Genova'] })
    const genova = circuit.leagues.find((l) => l.name === 'Genova')!
    expect(genova.entries.map((e) => [e.key, e.rank])).toEqual([
      ['mario rossi', 1],
      ['anna bianchi', 2],
    ])
  })

  it('gives the POTY spots to the best players not invited at an event', () => {
    const poty = potyStatus({ ...circuit, poty: 1 })
    expect([...poty.zone]).toEqual(['mario rossi'])
    expect(circuit.players.map((p) => poty.isIn(p))).toEqual([true, true, false])
  })
})

describe('writeStored', () => {
  it("drops the downloaded copies when storage is full, so the user's data is saved", () => {
    // 100 characters of storage; as in a browser, the stored keys are its only enumerable properties
    const store: Record<string, string> = {}
    const size = () => Object.values(store).reduce((s, v) => s + v.length, 0)
    Object.defineProperties(store, {
      getItem: { value: (k: string) => store[k] ?? null },
      removeItem: { value: (k: string) => delete store[k] },
      setItem: {
        value: (k: string, v: string) => {
          if (size() - (store[k]?.length ?? 0) + v.length > 100) throw new DOMException('full', 'QuotaExceededError')
          store[k] = v
        },
      },
    })
    vi.stubGlobal('localStorage', store)

    writeStored('cc.meta.data', 'x'.repeat(60))
    writeStored('cc.circuit.v2.2026', 'y'.repeat(20))
    writeStored('cc.decks', ['z'.repeat(50)])
    expect(readStored('cc.decks', null)).toEqual(['z'.repeat(50)])
    expect(readStored('cc.meta.data', null)).toBe(null)

    // a cache never pushes the user's data out
    writeStored('cc.meta.data', 'x'.repeat(60))
    expect(readStored('cc.decks', null)).toEqual(['z'.repeat(50)])
    vi.unstubAllGlobals()
  })
})

describe('logChange', () => {
  const card = (name: string, qty = 1, section: DeckCard['section'] = 'main', set?: string): DeckCard => ({ name, qty, section, set })
  const deck = [card('Atraxa', 1, 'commander'), card('Sol Ring'), card('Island', 3)]
  const day = new Date('2026-11-02T10:00:00')

  it('records cards in and out, not printings, the commander moving to the 99 or the sideboard', () => {
    const after = [card('Atraxa'), card('Sol Ring', 1, 'main', 'lea'), card('Island', 2), card('Mana Vault'), card('Lutri', 1, 'side')]
    expect(logChange([], deck, after, day)).toEqual([{ at: day.toISOString(), cards: { Island: -1, 'Mana Vault': 1 } }])
    expect(logChange([], deck, [card('Atraxa', 1, 'commander'), card('Sol Ring', 1, 'main', 'lea'), card('Island', 3)], day)).toEqual([])
  })

  it('merges the same day, cancelling a card added and taken out; a new day is a new change', () => {
    const added = [...deck, card('Mana Vault')]
    const h = logChange(logChange([], deck, added, day), added, [...deck.slice(0, 2), card('Island', 3), card('Brainstorm')], day)
    expect(h).toEqual([{ at: day.toISOString(), cards: { Brainstorm: 1 } }])
    expect(logChange(h, added, deck, new Date('2026-11-03T10:00:00'))[0].cards).toEqual({ 'Mana Vault': -1 })
    expect(logChange(h, [...deck, card('Brainstorm')], deck, day)).toEqual([])
  })
})

describe('dungeons', () => {
  it('lead from the entrance to the last room through rooms that exist, inside the card', () => {
    for (const { rooms } of Object.values(DUNGEONS)) {
      const seen = new Set([0])
      rooms.forEach((r, i) => {
        r.next.forEach((n) => (expect(n).toBeGreaterThan(i), expect(n).toBeLessThan(rooms.length), seen.add(n)))
        expect(r.at.every((v) => v >= 0 && v <= 100)).toBe(true)
      })
      expect(seen.size).toBe(rooms.length) // every room can be reached
      expect(rooms[rooms.length - 1].next).toEqual([])
    }
  })
})

describe('matchesCsv', () => {
  it('keeps text that starts like a formula as text, as an opponent can type anything as their commander', () => {
    const m = { id: 'x', date: '2026-11-02T10:00:00.000Z', result: 'W', kind: 'tournament', opponent: '=HYPERLINK("x")', notes: '-2+3' } as Match
    const row = matchesCsv([m], new Map(), 'it').split('\r\n')[1].split(';')
    expect(row[6]).toBe('"\'=HYPERLINK(""x"")"')
    expect(row[9]).toBe("'-2+3")
  })
})

describe('mergeFirst', () => {
  const deck = (id: string, name: string, updatedAt: string) => ({ id, name, updatedAt }) as Deck
  const names = (ds: Deck[]) => ds.map((d) => `${d.id}:${d.name}`).sort()

  it("keeps what only the phone has and what only the cloud has; for a deck in both, the copy changed last", () => {
    const local = [deck('a', 'offline edit', '2026-11-03T10:00:00.000Z'), deck('b', 'old', '2026-11-01T10:00:00.000Z'), deck('c', 'phone only', '2026-11-02T10:00:00.000Z')]
    const remote = [deck('a', 'cloud', '2026-11-02T10:00:00.000Z'), deck('b', 'edited elsewhere', '2026-11-02T10:00:00.000Z'), deck('d', 'cloud only', '2026-11-02T10:00:00.000Z')]
    expect(names(mergeFirst(local, remote, newerDeck))).toEqual(['a:offline edit', 'b:edited elsewhere', 'c:phone only', 'd:cloud only'])
  })

  it('without a rule (the matches) the cloud wins for the ones in both', () => {
    expect(names(mergeFirst([deck('a', 'phone', '2'), deck('c', 'phone only', '1')], [deck('a', 'cloud', '1')]))).toEqual(['a:cloud', 'c:phone only'])
  })
})

describe('playerKey', () => {
  const names = ['Nicolò  Pagàno', "D’Amico", 'D`Amico', ' LUCA rossi ', 'Marco/Luca', 'Marco / Luca', 'Ångström Æsir']

  it('makes a key Firestore can use as a document id, the same in the app and in the nightly update', async () => {
    const nightly = (await import(/* @vite-ignore */ new URL('../../scripts/meta/aliases.mjs', import.meta.url).href)).playerKey
    expect(names.map(playerKey)).toEqual(names.map(nightly))
    expect(playerKey('Marco/Luca')).toBe('marco luca')
    expect(names.map(playerKey).some((k) => k.includes('/'))).toBe(false)
  })
})
