// Browser-safe drawing entry: reaches no node-only module (see test/frame-browser-safe.test.ts).
export { cameraShift, drawFrame } from './director.js'
export { FRAME, STAGE, type Ctx2D } from './layout.js'
export type { Hair } from './look.js'
export { soloTimeline } from './solo.js'
export { sceneStateAt } from './state.js'
