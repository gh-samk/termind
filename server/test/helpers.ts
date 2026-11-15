import { hashPassword } from '../lib/password'
import { db } from '../db/client'
import { users } from '../db/schema'
import { newId } from '../lib/util'

export async function makeUser(email: string, password = 'altes-passwort-123', extra: Partial<typeof users.$inferInsert> = {}) {
  const id = newId()
  await db.insert(users).values({ id, email, name: 'Test Person', handle: `t-${id.slice(0, 8)}`, role: 'owner', passwordHash: await hashPassword(password), timezone: 'Europe/Berlin', ...extra })
  return id
}
