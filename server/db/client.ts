import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { config } from '../config'
import * as schema from './schema'

const client = createClient({ url: config.dbUrl })
export const db = drizzle(client, { schema })
export type DB = typeof db

/** Migrationen liegen im Quellbaum (Entwicklung) oder neben dem Build (Docker). */
function migrationsFolder() {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [join(here, 'migrations'), join(here, '../db/migrations'), join(process.cwd(), 'server/db/migrations')]
  return candidates.find((p) => existsSync(join(p, 'meta/_journal.json'))) ?? candidates[0]
}

export async function initDb() {
  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute('PRAGMA busy_timeout = 5000')
  await migrate(db, { migrationsFolder: migrationsFolder() })
}
