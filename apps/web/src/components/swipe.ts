export const SWIPE_MIN_PX = 60
const HORIZONTAL_BIAS = 1.5

/** A left swipe goes to the next film, a right swipe to the previous; short or mostly vertical moves are nothing. */
export function swipeDirection(dx: number, dy: number): 'next' | 'prev' | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= HORIZONTAL_BIAS * Math.abs(dy)) return null
  return dx < 0 ? 'next' : 'prev'
}
