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
import { sit } from './actions/sit'
import { sleep } from './actions/sleep'
import { fallDown } from './actions/fall-down'
import { typeLaptop } from './actions/type-laptop'
import { readBook } from './actions/read-book'
import { phoneCall } from './actions/phone-call'
import { drink } from './actions/drink'
import { push } from './actions/push'
import { knock } from './actions/knock'
import { dance } from './actions/dance'
import { hug } from './actions/hug'
import { blank } from './backdrops/blank'
import { classroom } from './backdrops/classroom'
import { desk } from './props/desk'
import { whiteboard } from './props/whiteboard'
import { chair } from './props/chair'
import { sofa } from './props/sofa'
import { bed } from './props/bed'
import { table } from './props/table'
import { door } from './props/door'
import { tree } from './props/tree'
import { bookshelf } from './props/bookshelf'
import { box } from './props/box'
import { lamp } from './props/lamp'
import { plant } from './props/plant'
import type { ActionDef, BackdropDef, Catalog, PropDef } from './types'

/** Own-key lookup: prototype keys like "constructor" are not entries. */
export const lookup = <T>(rec: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(rec, key) ? rec[key] : undefined

const byId = <T extends { id: string }>(items: T[]): Record<string, T> => Object.fromEntries(items.map((i) => [i.id, i]))

export const defaultCatalog: Catalog = {
  actions: byId<ActionDef>([
    walkTo, runTo, pointAt, think, cheer, wave, nod, talk,
    shrug, shakeHead, facepalm, clap, cry, laugh, stomp, lookAround, scratchHead, crossArms, bow, jump,
    sit, sleep, fallDown, typeLaptop, readBook, phoneCall, drink, push, knock, dance, hug,
  ]),
  props: byId<PropDef>([whiteboard, desk, chair, sofa, bed, table, door, tree, bookshelf, box, lamp, plant]),
  backdrops: byId<BackdropDef>([blank, classroom]),
}
