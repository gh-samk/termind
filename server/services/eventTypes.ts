import { and, asc, eq, ne } from 'drizzle-orm'
import type { z } from 'zod'
import { eventTypeSchema, eventTypeUpdateSchema } from '../../shared/schemas'
import type { FormField, Location, PublicEventType } from '../../shared/types'
import { db } from '../db/client'
import { eventTypes, schedules } from '../db/schema'
import { type Actor, requireHost, requireWrite } from '../lib/actor'
import { AppError, invalid, notFound } from '../lib/errors'
import { newId, nowIso, slugify } from '../lib/util'
import { audit } from './audit'

export type EventTypeRow = typeof eventTypes.$inferSelect

const kindLabel: Record<Location['kind'], { de: string; en: string }> = {
  video: { de: 'Videocall', en: 'Video call' },
  'video-template': { de: 'Videocall', en: 'Video call' },
  onsite: { de: 'Vor Ort', en: 'In person' },
  'phone-host-calls': { de: 'Telefon', en: 'Phone' },
  'phone-guest-calls': { de: 'Telefon', en: 'Phone' },
}

export function locationLabel(l: Location, locale: 'de' | 'en' = 'de') {
  return l.label?.trim() || kindLabel[l.kind][locale]
}

/** Formularfelder inkl. automatisch nötiger Felder (z. B. Telefonnummer, wenn der Gastgeber anruft). */
export function effectiveFields(e: Pick<EventTypeRow, 'fields' | 'location'>): FormField[] {
  if (e.location.kind === 'phone-host-calls' && !e.fields.some((f) => f.type === 'phone')) {
    return [{ id: 'phone', label: 'Telefonnummer', type: 'phone', required: true }, ...e.fields]
  }
  return e.fields
}

/** Was der Gast vor der Buchung sieht: Adresse ja, geheime Links nein. */
export function toPublicEventType(e: EventTypeRow, locale: 'de' | 'en' = 'de'): PublicEventType {
  const detail = e.location.kind === 'onsite' ? e.location.value : undefined
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    description: e.description,
    duration: e.duration,
    location: { kind: e.location.kind, label: locationLabel(e.location, locale), detail },
    color: e.color,
    requiresConfirmation: e.requiresConfirmation,
    fields: effectiveFields(e),
  }
}

function validateLocation(l: Location) {
  if ((l.kind === 'video' || l.kind === 'video-template') && !/^https:\/\//.test(l.value)) throw invalid('Bitte gib einen Link beginnend mit https:// an.')
  if (l.kind === 'video-template' && !l.value.includes('{id}')) throw invalid('Die Link-Vorlage braucht den Platzhalter {id}.')
  if (l.kind === 'onsite' && !l.value.trim()) throw invalid('Bitte eine Adresse angeben.')
  if (l.kind === 'phone-guest-calls' && !l.value.trim()) throw invalid('Bitte die Telefonnummer angeben, unter der Gäste anrufen.')
}

async function uniqueSlug(userId: string, base: string, exceptId?: string) {
  let slug = base || 'termin'
  for (let i = 2; ; i++) {
    const clash = await db.query.eventTypes.findFirst({
      where: and(eq(eventTypes.userId, userId), eq(eventTypes.slug, slug), exceptId ? ne(eventTypes.id, exceptId) : undefined),
    })
    if (!clash) return slug
    slug = `${base}-${i}`
  }
}

async function assertScheduleOwned(userId: string, scheduleId?: string | null) {
  if (!scheduleId) return
  const s = await db.query.schedules.findFirst({ where: and(eq(schedules.id, scheduleId), eq(schedules.userId, userId)) })
  if (!s) throw invalid('Dieser Verfügbarkeitsplan existiert nicht.')
}

export async function listEventTypes(actor: Actor) {
  const a = requireHost(actor)
  const rows = await db.query.eventTypes.findMany({ where: eq(eventTypes.userId, a.userId), orderBy: [asc(eventTypes.position), asc(eventTypes.createdAt)] })
  await audit(actor, 'Terminseiten gelesen', `${rows.length} Stück`, 'read')
  return rows
}

export async function getEventType(actor: Actor, id: string) {
  const a = requireHost(actor)
  const e = await db.query.eventTypes.findFirst({ where: and(eq(eventTypes.id, id), eq(eventTypes.userId, a.userId)) })
  if (!e) throw notFound('Terminseite')
  return e
}

export async function createEventType(actor: Actor, raw: unknown) {
  const a = requireWrite(actor)
  const input = eventTypeSchema.parse(raw)
  validateLocation(input.location)
  await assertScheduleOwned(a.userId, input.scheduleId)
  const slug = await uniqueSlug(a.userId, input.slug ?? slugify(input.title))
  const count = (await db.query.eventTypes.findMany({ where: eq(eventTypes.userId, a.userId), columns: { id: true } })).length
  const row = { ...input, id: newId(), userId: a.userId, slug, scheduleId: input.scheduleId ?? null, position: count }
  await db.insert(eventTypes).values(row)
  await audit(actor, 'Terminseite angelegt', input.title, 'write')
  return getEventType(actor, row.id)
}

export async function updateEventType(actor: Actor, id: string, raw: unknown) {
  const a = requireWrite(actor)
  const current = await getEventType(actor, id)
  const input: z.infer<typeof eventTypeUpdateSchema> = eventTypeUpdateSchema.parse(raw)
  if (input.location) validateLocation(input.location)
  await assertScheduleOwned(a.userId, input.scheduleId)
  if (input.slug && input.slug !== current.slug) {
    const clash = await db.query.eventTypes.findFirst({ where: and(eq(eventTypes.userId, a.userId), eq(eventTypes.slug, input.slug), ne(eventTypes.id, id)) })
    if (clash) throw new AppError('conflict', 'Dieser Link ist schon vergeben.')
  }
  await db.update(eventTypes).set({ ...input, updatedAt: nowIso() }).where(eq(eventTypes.id, id))
  await audit(actor, 'Terminseite geändert', current.title, 'write')
  return getEventType(actor, id)
}

export async function deleteEventType(actor: Actor, id: string) {
  requireWrite(actor)
  const e = await getEventType(actor, id)
  const hasBookings = await db.query.bookings.findFirst({ where: (b, { eq }) => eq(b.eventTypeId, id), columns: { id: true } })
  if (hasBookings) {
    // Buchungen verweisen auf die Seite: deaktivieren statt löschen, damit nichts verloren geht.
    await db.update(eventTypes).set({ active: false, slug: `${e.slug}-archiv-${Date.now().toString(36)}`, updatedAt: nowIso() }).where(eq(eventTypes.id, id))
    await audit(actor, 'Terminseite archiviert', e.title, 'write')
    return { archived: true }
  }
  await db.delete(eventTypes).where(eq(eventTypes.id, id))
  await audit(actor, 'Terminseite gelöscht', e.title, 'write')
  return { archived: false }
}

/* -------- öffentlich -------- */

export async function findPublicEventType(userId: string, slug: string) {
  const e = await db.query.eventTypes.findFirst({ where: and(eq(eventTypes.userId, userId), eq(eventTypes.slug, slug), eq(eventTypes.active, true)) })
  if (!e) throw notFound('Terminseite')
  return e
}

export async function listPublicEventTypes(userId: string) {
  return db.query.eventTypes.findMany({ where: and(eq(eventTypes.userId, userId), eq(eventTypes.active, true)), orderBy: [asc(eventTypes.position), asc(eventTypes.createdAt)] })
}
