// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the upstream rig is untyped JS; typed loosely at this boundary only
export type Rig = Record<string, any>

export type Pose = Record<'head' | 'chest' | 'hip' | 'fF' | 'fB' | 'kF' | 'kB' | 'hF' | 'hB', [number, number]> & {
  ef?: number
  eb?: number
  hang?: number
}

const HOOK = "    return J;\n"
const RECORDER = `    if (Array.isArray(window.__rec)) {
      window.__rec.push({ x, y, s, sx, sh, handF, handB, eF, eB, hc, fF: p.fF, fB: p.fB, kF, kB, alpha: opt.alpha ?? 1, ink: opt.ink || C.ink, bot: !!opt.bot, m: (() => { const t = g.getTransform(); return [t.a, t.b, t.c, t.d, t.e, t.f]; })() });
    }
`

/** Build the rig from the vendor source text; browser-safe (no file access). */
export function rigFromSource(source: string, opts: { instrument?: boolean } = {}): Rig {
  let src = source
  if (opts.instrument) {
    if (!src.includes(HOOK)) throw new Error('rig: cannot instrument fig()')
    src = src.replace(HOOK, RECORDER + HOOK)
  }
  const shim: Record<string, unknown> = {}
  new Function('window', src)(shim)
  const rig = shim.RIG as Rig
  Object.defineProperty(rig, '__shim', { value: shim, enumerable: false })
  return rig
}
