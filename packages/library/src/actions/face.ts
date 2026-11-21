/** Where the rig draws the head centre (it sits 20.5 units from the chest along the head direction), plus an offset. */
export function atHead(chest: number[], head: number[], dx = 0, dy = 0): [number, number] {
  const vx = head[0]! - chest[0]!, vy = head[1]! - chest[1]!
  const l = Math.hypot(vx, vy) || 1
  return [chest[0]! + (vx / l) * 20.5 + dx, chest[1]! + (vy / l) * 20.5 + dy]
}

/** The way to face a target: toward it, or the current way when there is none or it is underfoot. */
export const toward = (self: { x: number; facing: 1 | -1 }, targetX?: number): 1 | -1 =>
  targetX === undefined || targetX === self.x ? self.facing : targetX > self.x ? 1 : -1
