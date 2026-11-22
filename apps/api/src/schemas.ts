import { HAIR_STYLES, HEX_COLOR_MESSAGE, HEX_COLOR_RE } from '@stick/core'
import { z } from 'zod/v4'

/** `?limit=&cursor=`; a non-uuid cursor is a 400, never a query on a bad uuid. */
export const ListQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
})

export const IdParams = z.strictObject({ id: z.uuid() })

// core's LookSchema is zod v3, which cannot sit inside a v4 route schema; this one is built from the same constants.
export const LookSchema = z.object({
  ink: z.string().regex(HEX_COLOR_RE, HEX_COLOR_MESSAGE),
  hair: z.enum(HAIR_STYLES).optional(),
})
