import { MIN_PASSWORD_LENGTH, createChannel, createUser, createWorkspaceWithOwner, findUserByEmail } from '@stick/db'
import { CliError } from './lib/cli-error.js'
import { loadDotEnv } from './lib/make-providers.js'
import { PGLITE_NOTE, openScriptDb, parseFlags, runCli } from './lib/script-db.js'

const USAGE = `usage: npm run seed -- --email <e> --name <n> [--workspace <name>]
The password comes from STICK_SEED_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters).
${PGLITE_NOTE}`

const SEED_CAPS = { maxCostPerFilmUsd: 1, maxCostPerDayUsd: 10 }

runCli(async () => {
  loadDotEnv()
  const args = parseFlags(USAGE, ['email', 'name'], ['workspace'])
  const password = process.env.STICK_SEED_PASSWORD
  if (!password) throw new CliError(1, 'STICK_SEED_PASSWORD is required')
  if (password.length < MIN_PASSWORD_LENGTH) throw new CliError(1, `STICK_SEED_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`)

  const { db, close } = await openScriptDb(process.env)
  try {
    const existing = await findUserByEmail(db, args.email)
    if (existing) {
      console.log(`already seeded: ${existing.email}`)
      return
    }
    // One transaction, so a failure never leaves a user without a workspace (which a rerun would call "already seeded").
    const ws = await db.transaction(async (tx) => {
      const user = await createUser(tx, { email: args.email, name: args.name, password })
      const workspace = await createWorkspaceWithOwner(tx, { name: args.workspace ?? `${args.name}'s workspace`, userId: user.id, ...SEED_CAPS })
      await createChannel(tx, workspace.id, { platform: 'tiktok', displayName: 'TikTok', reviewPolicy: 'manual' })
      return workspace
    })
    console.log(`seeded: ${args.email.trim().toLowerCase()} (workspace ${ws.id})`)
  } finally {
    await close()
  }
})
