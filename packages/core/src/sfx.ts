export const SFX_IDS = ['step', 'pop', 'whoosh', 'ting', 'thud', 'clap', 'knock'] as const
export type SfxId = (typeof SFX_IDS)[number]
