import { desc } from 'drizzle-orm'
import { db } from '../db/client'
import { auditLog } from '../db/schema'
import type { Actor } from '../lib/actor'
import { newId } from '../lib/util'

/** Protokolliert Aktionen. Für KI-Zugriffe (Tokens) ist das die Grundlage des KI-Protokolls. */
export async function audit(actor: Actor, action: string, detail: string, kind: 'read' | 'write' | 'confirm') {
  // Lesezugriffe aus der Oberfläche sind uninteressant, die von KI-Clients nicht.
  if (kind === 'read' && actor.type !== 'token') return
  await db.insert(auditLog).values({
    id: newId(),
    actorType: actor.type,
    actorId: actor.type === 'token' ? actor.tokenId : actor.type === 'user' ? actor.userId : null,
    client: actor.type === 'token' ? actor.client : null,
    action: actor.type === 'user' && actor.via === 'mail-link' ? `${action} (per Mail-Knopf)` : action,
    detail,
    kind,
  })
}

export async function listAudit(limit = 100) {
  return db.query.auditLog.findMany({ orderBy: desc(auditLog.at), limit })
}
