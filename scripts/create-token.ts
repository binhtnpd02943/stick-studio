import { createApiToken, findUserByEmail, primaryMembership } from '@stick/db'
import { CliError } from './lib/cli-error.js'
import { loadDotEnv } from './lib/make-providers.js'
import { PGLITE_NOTE, openScriptDb, parseFlags, runCli } from './lib/script-db.js'

const USAGE = `usage: npm run token -- --email <e> --name <label>
Prints a new stk_ API token once; only its hash is stored.
${PGLITE_NOTE}`

runCli(async () => {
  loadDotEnv()
  const args = parseFlags(USAGE, ['email', 'name'])
  const { db, close } = await openScriptDb(process.env)
  try {
    const user = await findUserByEmail(db, args.email)
    const membership = user && await primaryMembership(db, user.id)
    if (!user) throw new CliError(1, 'unknown email')
    if (!membership) throw new CliError(1, 'user has no workspace: run npm run seed')
    const { token } = await createApiToken(db, { workspaceId: membership.workspaceId, userId: user.id, name: args.name })
    console.log(token)
  } finally {
    await close()
  }
})
