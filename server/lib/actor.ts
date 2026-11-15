import { forbidden } from './errors'

/**
 * Wer handelt gerade? Jede Service-Funktion bekommt einen Actor.
 * So gelten dieselben Regeln für Oberfläche, REST-API und MCP.
 */
export type Actor =
  | { type: 'user'; userId: string; role: 'owner' | 'member' }
  | { type: 'token'; userId: string; role: 'owner' | 'member'; tokenId: string; scope: 'read' | 'write'; client: string }
  | { type: 'guest' }
  | { type: 'system' }

export function requireHost(actor: Actor): Extract<Actor, { userId: string }> {
  if (actor.type === 'user' || actor.type === 'token') return actor
  throw forbidden()
}

export function requireWrite(actor: Actor) {
  const a = requireHost(actor)
  if (a.type === 'token' && a.scope !== 'write') throw forbidden('Dieser Schlüssel darf nur lesen.')
  return a
}

export function requireOwner(actor: Actor) {
  const a = requireWrite(actor)
  if (a.role !== 'owner') throw forbidden('Nur die Inhaberin oder der Inhaber der Instanz darf das.')
  return a
}

export function actorLabel(actor: Actor) {
  return actor.type === 'token' ? actor.client : actor.type
}
