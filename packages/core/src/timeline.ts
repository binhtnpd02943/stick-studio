import type { Mark, Screenplay } from './screenplay.js'

export const beatId = (sceneId: string, index: number): string => `${sceneId}.b${index}`

export interface TimedLine { who: string; text: string; start: number; end: number }
export interface TimedAction {
  who: string
  action: string
  target?: string
  params: Record<string, unknown>
  start: number
  end: number
}
export interface TimedBeat {
  id: string
  start: number
  end: number
  line?: TimedLine
  tracks: TimedAction[]
  camera?: { zoom: number; focus: string }
}
export interface TimedScene {
  id: string
  start: number
  end: number
  backdrop: string
  props: { id: string; type: string; mark: Mark }[]
  start_marks: Record<string, Mark>
  beats: TimedBeat[]
}
export interface Timeline {
  fps: 30
  width: 1080
  height: 1920
  duration: number
  title?: string
  cast: Screenplay['cast']
  scenes: TimedScene[]
}
