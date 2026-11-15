import { and, inArray, isNotNull, lt, or } from 'drizzle-orm'
import { db } from './db/client'
import { jobs, oauthClients, oauthCodes, oauthGrants, passwordResets, pendingActions } from './db/schema'
import { notInArray } from 'drizzle-orm'

/** Täglich aufräumen, damit die Datenbank auf kleinen Servern klein bleibt. */
export async function housekeeping() {
  const now = new Date().toISOString()
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  await db.delete(jobs).where(and(inArray(jobs.status, ['done', 'failed']), lt(jobs.runAt, monthAgo)))
  await db.delete(passwordResets).where(lt(passwordResets.expiresAt, now))
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now))
  await db.delete(pendingActions).where(lt(pendingActions.expiresAt, now))
  // Registrierte Clients, die nie benutzt wurden, nach 7 Tagen entfernen
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const used = db.select({ id: oauthGrants.clientId }).from(oauthGrants)
  await db.delete(oauthClients).where(and(lt(oauthClients.createdAt, weekAgo), notInArray(oauthClients.id, used)))
  await db.delete(oauthGrants).where(or(and(isNotNull(oauthGrants.revokedAt), lt(oauthGrants.revokedAt, monthAgo)), lt(oauthGrants.refreshExpiresAt, monthAgo)))
}

export function startHousekeeping() {
  const run = () => void housekeeping().catch((e) => console.error('[aufräumen]', e))
  setTimeout(run, 60_000).unref()
  setInterval(run, 24 * 60 * 60_000).unref()
}
