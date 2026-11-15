import { and, eq, ne } from 'drizzle-orm'
import type { z } from 'zod'
import type { profileSchema } from '../../shared/schemas'
import { db } from '../db/client'
import { users } from '../db/schema'
import { type Actor, requireHost, requireWrite } from '../lib/actor'
import { AppError, invalid, notFound } from '../lib/errors'
import { RESERVED_HANDLES } from '../lib/util'
import { isValidTimeZone } from '../lib/time'
import { audit } from './audit'

export type UserRow = typeof users.$inferSelect

export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, name: u.name, handle: u.handle, subtitle: u.subtitle, role: u.role, timezone: u.timezone, locale: u.locale, totpEnabled: u.totpEnabled }
}

export async function getUser(id: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!u) throw notFound('Person')
  return u
}

export async function getUserByHandle(handle: string) {
  return db.query.users.findFirst({ where: eq(users.handle, handle.toLowerCase()) })
}

export async function me(actor: Actor) {
  const a = requireHost(actor)
  return publicUser(await getUser(a.userId))
}

export async function updateProfile(actor: Actor, input: z.infer<typeof profileSchema>) {
  const a = requireWrite(actor)
  if (input.timezone && !isValidTimeZone(input.timezone)) throw invalid('Unbekannte Zeitzone.')
  if (input.handle && RESERVED_HANDLES.has(input.handle)) throw invalid('Dieser Link ist reserviert. Bitte einen anderen wählen.')
  if (input.handle) {
    const taken = await db.query.users.findFirst({ where: and(eq(users.handle, input.handle), ne(users.id, a.userId)) })
    if (taken) throw new AppError('conflict', 'Dieser Link ist schon vergeben.')
  }
  await db.update(users).set(input).where(eq(users.id, a.userId))
  await audit(actor, 'Profil geändert', Object.keys(input).join(', '), 'write')
  return me(actor)
}
