import { shrug } from './actions/shrug'
import { shakeHead } from './actions/shake-head'
import { facepalm } from './actions/facepalm'
import { clap } from './actions/clap'
import { cry } from './actions/cry'
import { laugh } from './actions/laugh'
import { stomp } from './actions/stomp'
import { lookAround } from './actions/look-around'
import { scratchHead } from './actions/scratch-head'
import { crossArms } from './actions/cross-arms'
import { bow } from './actions/bow'
import { jump } from './actions/jump'
import { cheer } from './actions/cheer'
import { nod } from './actions/nod'
import { pointAt } from './actions/point-at'
import { talk } from './actions/talk'
import { think } from './actions/think'
import { walkTo } from './actions/walk-to'
import { runTo } from './actions/run-to'
import { wave } from './actions/wave'
import { blank } from './backdrops/blank'
import { classroom } from './backdrops/classroom'
import { desk } from './props/desk'
import { whiteboard } from './props/whiteboard'
import type { ActionDef, BackdropDef, Catalog, PropDef } from './types'

/** Own-key lookup: prototype keys like "constructor" are not entries. */
export const lookup = <T>(rec: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(rec, key) ? rec[key] : undefined

const byId = <T extends { id: string }>(items: T[]): Record<string, T> => Object.fromEntries(items.map((i) => [i.id, i]))

export const defaultCatalog: Catalog = {
  actions: byId<ActionDef>([
    walkTo, runTo, pointAt, think, cheer, wave, nod, talk,
    shrug, shakeHead, facepalm, clap, cry, laugh, stomp, lookAround, scratchHead, crossArms, bow, jump,
  ]),
  props: byId<PropDef>([whiteboard, desk]),
  backdrops: byId<BackdropDef>([blank, classroom]),
}
