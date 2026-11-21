import { cheer } from './actions/cheer'
import { nod } from './actions/nod'
import { pointAt } from './actions/point-at'
import { talk } from './actions/talk'
import { think } from './actions/think'
import { walkTo } from './actions/walk-to'
import { wave } from './actions/wave'
import { blank } from './backdrops/blank'
import { classroom } from './backdrops/classroom'
import { desk } from './props/desk'
import { whiteboard } from './props/whiteboard'
import type { ActionDef, BackdropDef, Catalog, PropDef } from './types'

const byId = <T extends { id: string }>(items: T[]): Record<string, T> => Object.fromEntries(items.map((i) => [i.id, i]))

export const defaultCatalog: Catalog = {
  actions: byId<ActionDef>([walkTo, pointAt, think, cheer, wave, nod, talk]),
  props: byId<PropDef>([whiteboard, desk]),
  backdrops: byId<BackdropDef>([blank, classroom]),
}
