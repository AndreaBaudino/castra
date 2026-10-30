import { describe, expect, it, vi } from 'vitest'
import { buildCircuit, parseEventName, playerKey, potyStatus } from './circuit'
import { parseDecklist } from './decks'
import { parseCsv } from './meta'
import { readStored, writeStored } from './storage'

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
