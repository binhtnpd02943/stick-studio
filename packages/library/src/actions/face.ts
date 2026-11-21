/** Where the rig draws the head centre (it sits 20.5 units from the chest along the head direction), plus an offset. */
export function atHead(chest: number[], head: number[], dx = 0, dy = 0): [number, number] {
  const vx = head[0]! - chest[0]!, vy = head[1]! - chest[1]!
  const l = Math.hypot(vx, vy) || 1
  return [chest[0]! + (vx / l) * 20.5 + dx, chest[1]! + (vy / l) * 20.5 + dy]
}
