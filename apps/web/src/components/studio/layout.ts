import { type MemberKey, memberOf } from './team'

// Geometry ported from docs/superpowers/mockups/studio-floor.html.
export const SCENE = { width: 1280, height: 1000 } as const

/** The drawn part of the scene: the mockup's header band (0–64) is not rendered; the bottom keeps room for the tags under the wall. */
export const VIEW = { top: 64, height: 880 } as const

export type Point = { x: number; y: number }
export type SpotKey = MemberKey | 'review'

export const ROOMS = {
  creative: ['story', 'screenplay', 'validate'],
  studio: ['voice', 'timeline'],
  post: ['gate', 'render', 'contact'],
  review: ['review'],
  corridor: ['intake'],
} as const satisfies Record<string, readonly SpotKey[]>
export type Room = keyof typeof ROOMS

type Floor = 'top' | 'mid' | 'bot'
/** y of a walker (its top edge) on each floor band, and of a seated or standing figure. */
const WALK_Y: Record<Floor, number> = { top: 304, mid: 444, bot: 784 }
const FIGURE_Y: Record<Floor, number> = { top: 274, mid: 414, bot: 754 }
const FLOOR_OF: Record<Room, Floor> = { creative: 'top', studio: 'top', corridor: 'mid', post: 'bot', review: 'bot' }

const SPOT_X: Record<SpotKey, number> = {
  intake: 92, story: 250, screenplay: 320, validate: 560, voice: 840, timeline: 1012, gate: 1072, render: 772, contact: 512, review: 290,
}
const FIGURE_LEFT: Record<MemberKey, number> = {
  intake: 110, story: 160, screenplay: 350, validate: 452, voice: 870, timeline: 1020, gate: 1080, render: 790, contact: 520,
}
/** Head centre inside the 80×130 figure box, per pose. */
export const HEAD = { sit: { x: 30, y: 40 }, stand: { x: 40, y: 22 } } as const

/** Name tags hang under each figure box (80×130), centred on it; the bottom row's hang below the outer wall (y 900). */
const TAG_TOP = 130
const BOTTOM_TAG_Y = 906
export const tagAt = (key: MemberKey): Point => {
  const box = figureAt(key)
  return { x: box.x + 40, y: FLOOR_OF[roomOf(key)] === 'bot' ? BOTTOM_TAG_Y : box.y + TAG_TOP }
}

/** Room labels; the corridor ones sit below the top room's name tags and clear of Hùng's head. */
export const ROOM_LABELS = [
  { key: 'creative', x: 40, y: 102 },
  { key: 'studio', x: 736, y: 102 },
  { key: 'review', x: 210, y: 582 }, // right of Hùng's tag, which hangs over the wall
  { key: 'post', x: 416, y: 582 },
  { key: 'entrance', x: 160, y: 456 },
  { key: 'coffee', x: 1000, y: 456 },
  { key: 'corridor', x: 580, y: 456 },
] as const

export function roomOf(key: SpotKey): Room {
  return (Object.keys(ROOMS) as Room[]).find((r) => (ROOMS[r] as readonly SpotKey[]).includes(key))!
}

const floorY = (room: Room) => WALK_Y[FLOOR_OF[room]]

export function spot(key: SpotKey): Point {
  return { x: SPOT_X[key], y: floorY(roomOf(key)) }
}

/** Where a member's figure box sits (top-left). */
export function figureAt(key: MemberKey): Point {
  return { x: FIGURE_LEFT[key], y: FIGURE_Y[FLOOR_OF[roomOf(key)]] }
}

/** Centre of a member's head on the scene, used to anchor bubbles. */
export function headOf(key: MemberKey): Point {
  const m = memberOf(key)
  const h = HEAD[m.pose]
  const box = figureAt(key)
  return { x: box.x + (m.flip ? 80 - h.x : h.x), y: box.y + h.y }
}

export function doorOf(room: Exclude<Room, 'corridor'>, towardRoom: Room): number {
  if (room === 'post') return towardRoom === 'review' ? 480 : 1020
  return { creative: 640, studio: 780, review: 320 }[room]
}

/** Points to walk through, ending at `to`'s spot. Rooms are left and entered through their doors. */
export function route(from: SpotKey, to: SpotKey): Point[] {
  const ra = roomOf(from)
  const rb = roomOf(to)
  const pts: Point[] = []
  const corridor = WALK_Y.mid
  if (ra !== rb) {
    if (ra !== 'corridor') {
      const d = doorOf(ra, rb)
      pts.push({ x: d, y: floorY(ra) }, { x: d, y: corridor })
    }
    if (rb !== 'corridor') {
      const d = doorOf(rb, ra)
      pts.push({ x: d, y: corridor }, { x: d, y: floorY(rb) })
    }
  }
  pts.push(spot(to))
  return pts
}

export const walkMs = (a: Point, b: Point) => Math.max(450, Math.round(3 * (Math.abs(a.x - b.x) + Math.abs(a.y - b.y))))
