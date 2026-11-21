import { readFileSync } from 'node:fs'
import { GlobalFonts } from '@napi-rs/canvas'
import opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { registerFonts } from '../src/index'

const FONT = new URL('../../../assets/fonts/PatrickHand-Regular.ttf', import.meta.url)
const VIETNAMESE = 'ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ'

describe('fonts', () => {
  it('font covers Vietnamese', () => {
    const buf = readFileSync(FONT)
    const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const missing = [...VIETNAMESE, ...VIETNAMESE.toUpperCase()].filter((ch) => font.charToGlyphIndex(ch) === 0)
    expect(missing).toEqual([])
  })

  it('registers alias', () => {
    registerFonts()
    registerFonts()
    expect(GlobalFonts.has('Balsamiq Sans')).toBe(true)
  })
})
