// The four dungeons, shown with their card's image on Scryfall: each room is where it is printed on the card, in % of
// the image ([x1, y1, x2, y2]), with the rooms it leads to. The first room is the entrance, the last one the end.

export type DungeonId = 'undercity' | 'phandelver' | 'madmage' | 'tomb'

export interface Room {
  name: string
  at: [number, number, number, number]
  next: number[]
}

export interface Dungeon {
  short: string // on the chips and the players' pills
  image: string
  rooms: Room[]
}

const r = (name: string, x1: number, y1: number, x2: number, y2: number, next: number[] = []): Room => ({ name, at: [x1, y1, x2, y2], next })

export const DUNGEONS: Record<DungeonId, Dungeon> = {
  undercity: {
    short: 'Undercity',
    image: 'https://cards.scryfall.io/large/front/2/c/2c65185b-6cf0-451d-985e-56aa45d9a57d.jpg?1788840929',
    rooms: [
      r('Secret Entrance', 8, 19, 93, 30, [1, 2]),
      r('Forge', 8, 31, 49, 41, [3, 4]),
      r('Lost Well', 51, 31, 93, 41, [4, 5]),
      r('Trap!', 8, 42, 39, 57, [6]),
      r('Arena', 41, 42, 60, 57, [6, 7]),
      r('Stash', 62, 42, 93, 57, [7]),
      r('Archives', 8, 58, 49, 72, [8]),
      r('Catacombs', 51, 58, 93, 72, [8]),
      r('Throne of the Dead Three', 8, 73, 93, 91),
    ],
  },
  phandelver: {
    short: 'Phandelver',
    image: 'https://cards.scryfall.io/large/front/5/9/59b11ff8-f118-4978-87dd-509dc0c8c932.jpg?1783926340',
    rooms: [
      r('Cave Entrance', 8, 14, 93, 29, [1, 2]),
      r('Goblin Lair', 8, 30, 49, 48, [3, 4]),
      r('Mine Tunnels', 51, 30, 93, 48, [4, 5]),
      r('Storeroom', 8, 49, 33, 72, [6]),
      r('Dark Pool', 35, 49, 65, 72, [6]),
      r('Fungi Cavern', 67, 49, 93, 72, [6]),
      r('Temple of Dumathoin', 8, 73, 93, 88),
    ],
  },
  madmage: {
    short: 'Mad Mage',
    image: 'https://cards.scryfall.io/large/front/6/f/6f509dbe-6ec7-4438-ab36-e20be46c9922.jpg?1789711206',
    rooms: [
      r('Yawning Portal', 8, 14, 93, 21, [1]),
      r('Dungeon Level', 8, 22, 93, 29, [2, 3]),
      r('Goblin Bazaar', 8, 30, 49, 44, [4]),
      r('Twisted Caverns', 51, 30, 93, 44, [4]),
      r('Lost Level', 8, 45, 93, 52, [5, 6]),
      r('Runestone Caverns', 8, 53, 49, 68, [7]),
      r("Muiral's Graveyard", 51, 53, 93, 68, [7]),
      r('Deep Mines', 8, 69, 93, 75, [8]),
      r("Mad Wizard's Lair", 8, 76, 93, 88),
    ],
  },
  tomb: {
    short: 'Tomb',
    image: 'https://cards.scryfall.io/large/front/7/0/70b284bd-7a8f-4b60-8238-f746bdc5b236.jpg?1783926339',
    rooms: [
      r('Trapped Entry', 8, 14, 93, 29, [1, 3]),
      r('Veils of Fear', 8, 30, 49, 48, [2]),
      r('Sandfall Cell', 8, 49, 49, 67, [4]),
      r('Oubliette', 51, 30, 93, 67, [4]),
      r('Cradle of the Death God', 8, 68, 93, 87),
    ],
  },
}
export const DUNGEON_IDS = Object.keys(DUNGEONS) as DungeonId[]

/** A player's way through a dungeon: the rooms entered, and how many dungeons they completed this game. */
export interface DungeonRun {
  d: DungeonId
  path: number[] // empty: not in a dungeon (yet, or again after completing one)
  done: number
}

export const lastRoom = (id: DungeonId) => DUNGEONS[id].rooms.length - 1
/** The rooms the player can go to next: the entrance when outside. */
export const nextRooms = (run: DungeonRun) =>
  run.path.length ? DUNGEONS[run.d].rooms[run.path[run.path.length - 1]].next : [0]
