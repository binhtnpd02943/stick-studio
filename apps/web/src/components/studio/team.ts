import type { FilmStep } from '@stick/core'
import { vi } from '../../i18n/vi'

export type MemberKey = 'intake' | FilmStep

export type Member = {
  key: MemberKey
  name: string
  role: string
  ink: string
  hair: 'short' | 'long' | 'ponytail' | 'none' | 'phones'
  pose: 'sit' | 'stand'
  flip: boolean
  idle: 'rest' | 'hips' | 'chin' | 'phone' | 'stretch' | 'sip'
}

const member = (key: MemberKey, ink: string, hair: Member['hair'], pose: Member['pose'], flip: boolean, idle: Member['idle']): Member =>
  ({ key, name: vi.studio.team[key].name, role: vi.studio.team[key].role, ink, hair, pose, flip, idle })

// Inks are the cast palette, the same as the mockup (studio-floor.html).
export const TEAM: readonly Member[] = [
  member('intake', '#1b1b1b', 'short', 'sit', false, 'rest'),
  member('story', '#d97757', 'ponytail', 'stand', true, 'hips'),
  member('screenplay', '#3d6fb4', 'short', 'sit', false, 'chin'),
  member('validate', '#8a4fb5', 'long', 'sit', true, 'phone'),
  member('voice', '#2f8a5b', 'phones', 'stand', false, 'stretch'),
  member('timeline', '#d97757', 'long', 'stand', false, 'phone'),
  member('gate', '#1b1b1b', 'short', 'stand', false, 'sip'),
  member('render', '#3d6fb4', 'none', 'sit', false, 'stretch'),
  member('contact', '#8a4fb5', 'ponytail', 'stand', false, 'chin'),
]

export const memberOf = (key: MemberKey): Member => TEAM.find((m) => m.key === key)!
