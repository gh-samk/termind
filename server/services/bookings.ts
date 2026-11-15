import { and, asc, desc, eq, gt, inArray, like, lt, ne, or } from 'drizzle-orm'
import { bookingCreateSchema } from '../../shared/schemas'
import type { Answer, BookingStatus, Location, SlotMap } from '../../shared/types'
import { db } from '../db/client'
import { bookings, eventTypes, users } from '../db/schema'
import { type Actor, requireHost, requireWrite } from '../lib/actor'
import { AppError, invalid, notFound } from '../lib/errors'
import { addDays, canonicalTimeZone, dateInTz, formatDateTime, isValidTimeZone } from '../lib/time'
import { newId, nowIso, randomToken } from '../lib/util'
import { enqueueBookingMail, enqueueCalendarSync, scheduleReminders } from '../mail/queue'
import { externalBusy } from './calendars'
import { emitBookingEvent } from './webhooks'
import { audit } from './audit'
import { effectiveFields, type EventTypeRow, findPublicEventType, locationLabel } from './eventTypes'
import { loadScheduleForHost } from './schedules'
import { getSetting } from './settings'
import { computeSlots, type Interval, isSlotAvailable } from './slots'

export type BookingRow = typeof bookings.$inferSelect
const ACTIVE: BookingStatus[] = ['confirmed', 'pending']

/** Lesbare Zeitangabe für das Protokoll, in der Zeitzone des Gastgebers. */
async function when(iso: string, hostId: string) {
  const host = await db.query.users.findFirst({ where: eq(users.id, hostId), columns: { timezone: true } })
  const { date, time } = formatDateTime(new Date(iso), host?.timezone ?? 'Europe/Berlin', 'de')
  return `${date}, ${time} Uhr`
}

/* ---------------- Verfügbarkeit ---------------- */

async function busyIntervals(hostId: string, from: Date, to: Date, excludeBookingId?: string): Promise<Interval[]> {
  const rows = await db.query.bookings.findMany({
    where: and(eq(bookings.hostId, hostId), inArray(bookings.status, ACTIVE), lt(bookings.startsAt, to.toISOString()), gt(bookings.endsAt, from.toISOString())),
    columns: { id: true, startsAt: true, endsAt: true, bufferBefore: true, bufferAfter: true },
  })
  const own = rows
    .filter((r) => r.id !== excludeBookingId)
    .map((r) => ({
      start: new Date(new Date(r.startsAt).getTime() - r.bufferBefore * 60_000),
      end: new Date(new Date(r.endsAt).getTime() + r.bufferAfter * 60_000),
    }))
  // Belegte Zeiten aus verbundenen Kalendern (CalDAV/ICS), eigene termind-Termine sind dort schon herausgefiltert
  return [...own, ...(await externalBusy(hostId, from, to))]
}

async function slotContext(ev: EventTypeRow, guestTz: string, from: string, to: string, excludeBookingId?: string) {
  const { schedule, exceptions } = await loadScheduleForHost(ev.userId, ev.scheduleId)
  const busy = await busyIntervals(ev.userId, new Date(addDays(from, -2) + 'T00:00:00Z'), new Date(addDays(to, 2) + 'T23:59:59Z'), excludeBookingId)
  return {
    now: new Date(),
    guestTz,
    schedule: { timezone: schedule.timezone, weekly: schedule.weekly },
    exceptions,
    rules: ev,
    busy,
  }
}

/** Freie Zeiten für eine Terminseite. Zeitraum max. 62 Tage. */
export async function getSlots(ev: EventTypeRow, from: string, to: string, rawTz: string, excludeBookingId?: string): Promise<SlotMap> {
  if (!isValidTimeZone(rawTz)) throw invalid('Unbekannte Zeitzone.')
  const guestTz = canonicalTimeZone(rawTz)
  if (to < from) throw invalid('Ungültiger Zeitraum.')
  if (addDays(from, 62) < to) throw invalid('Bitte höchstens zwei Monate auf einmal abfragen.')
  const ctx = await slotContext(ev, guestTz, from, to, excludeBookingId)
  return computeSlots({ ...ctx, from, to })
}

/* ---------------- Lesen ---------------- */

export interface BookingListFilter {
  view?: 'upcoming' | 'pending' | 'past' | 'all'
  q?: string
  from?: string
  to?: string
  limit?: number
}

export async function listBookings(actor: Actor, f: BookingListFilter = {}) {
  const a = requireHost(actor)
  const now = nowIso()
  const conds = [eq(bookings.hostId, a.userId)]
  const view = f.view ?? 'upcoming'
  if (view === 'upcoming') conds.push(gt(bookings.endsAt, now), inArray(bookings.status, ACTIVE))
  if (view === 'pending') conds.push(eq(bookings.status, 'pending'), gt(bookings.endsAt, now))
  if (view === 'past') conds.push(lt(bookings.startsAt, now))
  if (f.from) conds.push(gt(bookings.startsAt, f.from))
  if (f.to) conds.push(lt(bookings.startsAt, f.to))
  if (f.q) {
    const q = `%${f.q.replace(/[%_]/g, '')}%`
    conds.push(or(like(bookings.guestName, q), like(bookings.guestEmail, q))!)
  }
  const rows = await db
    .select({ b: bookings, eventTitle: eventTypes.title, eventColor: eventTypes.color })
    .from(bookings)
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .where(and(...conds))
    .orderBy(view === 'past' ? desc(bookings.startsAt) : asc(bookings.startsAt))
    .limit(Math.min(f.limit ?? 200, 500))
  await audit(actor, 'Termine gelesen', `Ansicht: ${view}${f.q ? `, Suche: ${f.q}` : ''}`, 'read')
  return rows.map((r) => ({ ...r.b, eventTitle: r.eventTitle, eventColor: r.eventColor }))
}

export async function getBooking(actor: Actor, id: string) {
  const a = requireHost(actor)
  const b = await db.query.bookings.findFirst({ where: and(eq(bookings.id, id), eq(bookings.hostId, a.userId)) })
  if (!b) throw notFound('Termin')
  return b
}

export async function getBookingByToken(token: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.manageToken, token) })
  if (!b) throw notFound('Termin')
  const ev = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, b.eventTypeId) })
  const host = await db.query.users.findFirst({ where: eq(users.id, b.hostId) })
  return { booking: b, eventType: ev!, host: host! }
}

/* ---------------- Anlegen ---------------- */

function resolveLocation(l: Location): Location {
  if (l.kind === 'video-template') return { ...l, kind: 'video', value: l.value.replaceAll('{id}', randomToken(9).replace(/[-_]/g, 'x')) }
  return l
}

function collectAnswers(ev: EventTypeRow, raw: Record<string, string>): Answer[] {
  const out: Answer[] = []
  for (const f of effectiveFields(ev)) {
    const v = (raw[f.id] ?? '').trim()
    if (f.required && (!v || (f.type === 'checkbox' && v !== 'true'))) throw invalid(`Bitte „${f.label}“ ausfüllen.`)
    if (f.type === 'phone' && v && !/^[+0-9 ()/.-]{3,40}$/.test(v)) throw invalid(`Bitte eine gültige Telefonnummer bei „${f.label}“ angeben.`)
    if (f.type === 'select' && v && f.options && !f.options.includes(v)) throw invalid(`Ungültige Auswahl bei „${f.label}“.`)
    if (v) out.push({ fieldId: f.id, label: f.label, value: f.type === 'checkbox' ? (v === 'true' ? 'Ja' : 'Nein') : v })
  }
  return out
}

/**
 * Bucht einen Termin. Gäste nutzen die Buchungsseite, Gastgeber Oberfläche oder MCP.
 * Prüfung und Eintrag laufen in einer Transaktion, damit kein Slot doppelt vergeben wird.
 */
export async function createBooking(actor: Actor, raw: unknown) {
  const input = bookingCreateSchema.parse(raw)
  if (!isValidTimeZone(input.timezone)) throw invalid('Unbekannte Zeitzone.')
  input.timezone = canonicalTimeZone(input.timezone)

  const ev = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, input.eventTypeId) })
  if (!ev) throw notFound('Terminseite')
  const isGuest = actor.type === 'guest'
  if (isGuest) {
    if (!ev.active) throw notFound('Terminseite')
    const branding = await getSetting('branding')
    if (branding.consentRequired && !input.consent) throw invalid('Bitte stimme den Datenschutzhinweisen zu.')
  } else {
    const a = requireWrite(actor)
    if (a.userId !== ev.userId) throw notFound('Terminseite')
  }

  const answers = collectAnswers(ev, input.answers)
  const start = new Date(input.start)
  const end = new Date(start.getTime() + ev.duration * 60_000)
  const day = dateInTz(start, input.timezone)
  const ctx = await slotContext(ev, input.timezone, day, day)
  if (!isSlotAvailable(start.toISOString(), ctx)) throw new AppError('slot_taken', 'Diese Zeit ist leider nicht mehr frei. Bitte wähle eine andere.')

  // Gastgeber buchen direkt, Gäste ggf. als Anfrage
  const status: BookingStatus = isGuest && ev.requiresConfirmation ? 'pending' : 'confirmed'
  const row = {
    id: newId(),
    manageToken: randomToken(24),
    eventTypeId: ev.id,
    hostId: ev.userId,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    bufferBefore: ev.bufferBefore,
    bufferAfter: ev.bufferAfter,
    guestName: input.name,
    guestEmail: input.email.toLowerCase(),
    guestTimezone: input.timezone,
    locale: input.locale,
    answers,
    location: resolveLocation(ev.location),
    status,
    createdVia: actor.type === 'token' ? ('mcp' as const) : actor.type === 'user' ? ('admin' as const) : ('web' as const),
  }

  await db.transaction(async (tx) => {
    const clash = await tx.query.bookings.findFirst({
      where: and(
        eq(bookings.hostId, ev.userId),
        inArray(bookings.status, ACTIVE),
        lt(bookings.startsAt, new Date(end.getTime() + ev.bufferAfter * 60_000).toISOString()),
        gt(bookings.endsAt, new Date(start.getTime() - ev.bufferBefore * 60_000).toISOString()),
      ),
      columns: { id: true },
    })
    if (clash) throw new AppError('slot_taken', 'Diese Zeit ist leider nicht mehr frei. Bitte wähle eine andere.')
    await tx.insert(bookings).values(row)
  })

  await enqueueBookingMail(row.id, status === 'pending' ? 'guest.requested' : 'guest.confirmed')
  await enqueueBookingMail(row.id, status === 'pending' ? 'host.requested' : 'host.new')
  if (status === 'confirmed') await afterConfirmed({ ...row, sequence: 0 }, ev)
  await emitBookingEvent(row.hostId, status === 'pending' ? 'booking.requested' : 'booking.created', row.id)
  // Im Protokoll keine Gastnamen (Datenschutz), nur Terminart, Zeit und Kurz-ID
  await audit(actor, status === 'pending' ? 'Anfrage eingegangen' : 'Termin gebucht', `${ev.title}, ${await when(row.startsAt, row.hostId)} (#${row.id.slice(0, 8)})`, 'write')
  return row
}

/* ---------------- Ändern ---------------- */

const ref = (b: { id: string }) => `#${b.id.slice(0, 8)}`

/** Kalendereintrag schreiben und Erinnerungen planen. */
async function afterConfirmed(b: { id: string; startsAt: string; sequence: number }, ev: Pick<EventTypeRow, 'reminders'>) {
  await enqueueCalendarSync(b.id)
  await scheduleReminders(b, ev.reminders)
}

/** Vergangene Termine nicht mehr absagen oder bestätigen (der Gast bekäme sonst sinnlose Mails). */
function assertNotPast(b: BookingRow) {
  if (b.endsAt < nowIso()) throw invalid('Dieser Termin liegt in der Vergangenheit.')
}

async function eventOf(b: BookingRow) {
  const ev = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, b.eventTypeId) })
  if (!ev) throw notFound('Terminseite')
  return ev
}

async function setStatus(b: BookingRow, status: BookingStatus, extra: Partial<BookingRow> = {}) {
  await db.update(bookings).set({ status, sequence: b.sequence + 1, updatedAt: nowIso(), ...extra }).where(eq(bookings.id, b.id))
}

export async function cancelBooking(actor: Actor, id: string, reason?: string) {
  requireWrite(actor)
  const b = await getBooking(actor, id)
  if (!ACTIVE.includes(b.status)) throw invalid('Dieser Termin ist bereits abgesagt.')
  assertNotPast(b)
  const wasPending = b.status === 'pending'
  await setStatus(b, wasPending ? 'declined' : 'cancelled', { cancelReason: reason ?? null, cancelledBy: 'host' })
  await enqueueBookingMail(b.id, wasPending ? 'guest.declined' : 'guest.cancelled')
  await enqueueCalendarSync(b.id)
  await emitBookingEvent(b.hostId, wasPending ? 'booking.declined' : 'booking.cancelled', b.id)
  await audit(actor, wasPending ? 'Anfrage abgelehnt' : 'Termin abgesagt', `${await when(b.startsAt, b.hostId)} (${ref(b)})`, 'write')
  return getBooking(actor, id)
}

export async function acceptBooking(actor: Actor, id: string) {
  requireWrite(actor)
  const b = await getBooking(actor, id)
  if (b.status !== 'pending') throw invalid('Nur offene Anfragen können bestätigt werden.')
  assertNotPast(b)
  await setStatus(b, 'confirmed')
  await enqueueBookingMail(b.id, 'guest.confirmed')
  await afterConfirmed({ ...b, sequence: b.sequence + 1 }, await eventOf(b))
  await emitBookingEvent(b.hostId, 'booking.confirmed', b.id)
  await audit(actor, 'Anfrage bestätigt', `${await when(b.startsAt, b.hostId)} (${ref(b)})`, 'write')
  return getBooking(actor, id)
}

export async function updateBookingNote(actor: Actor, id: string, note: string) {
  requireWrite(actor)
  await getBooking(actor, id)
  await db.update(bookings).set({ note: note.slice(0, 4000), updatedAt: nowIso() }).where(eq(bookings.id, id))
  return getBooking(actor, id)
}

/** Wie oft ein Termin höchstens verschoben werden kann (Schutz vor Mail-Flut über den Gast-Link). */
const MAX_MOVES = 10

async function moveBooking(b: BookingRow, newStart: string, by: 'host' | 'guest', reason?: string) {
  const ev = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, b.eventTypeId) })
  if (!ev) throw notFound('Terminseite')
  if (by === 'guest' && !ev.active) throw invalid('Diese Terminseite nimmt keine Buchungen mehr an. Bitte melde dich direkt.')
  if (b.sequence >= MAX_MOVES * 2) throw invalid('Dieser Termin wurde schon sehr oft geändert. Bitte melde dich direkt.')
  const start = new Date(newStart)
  const duration = new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()
  const end = new Date(start.getTime() + duration)
  const day = dateInTz(start, b.guestTimezone)
  // Prüfen mit der Dauer und den Puffern dieses Termins, nicht mit der (evtl. geänderten) Terminseite
  const ctx = await slotContext(ev, b.guestTimezone, day, day, b.id)
  ctx.rules = { ...ev, duration: Math.round(duration / 60_000), bufferBefore: b.bufferBefore, bufferAfter: b.bufferAfter }
  if (!isSlotAvailable(start.toISOString(), ctx)) throw new AppError('slot_taken', 'Diese Zeit ist leider nicht frei.')
  // Verschiebt ein Gast einen Termin auf einer Seite mit Bestätigungspflicht, wird er wieder zur Anfrage
  const status: BookingStatus = by === 'guest' && ev.requiresConfirmation ? 'pending' : b.status
  await db.transaction(async (tx) => {
    const clash = await tx.query.bookings.findFirst({
      where: and(
        eq(bookings.hostId, b.hostId),
        inArray(bookings.status, ACTIVE),
        ne(bookings.id, b.id),
        lt(bookings.startsAt, new Date(end.getTime() + b.bufferAfter * 60_000).toISOString()),
        gt(bookings.endsAt, new Date(start.getTime() - b.bufferBefore * 60_000).toISOString()),
      ),
      columns: { id: true },
    })
    if (clash) throw new AppError('slot_taken', 'Diese Zeit ist leider nicht frei.')
    await tx
      .update(bookings)
      .set({ startsAt: start.toISOString(), endsAt: end.toISOString(), status, sequence: b.sequence + 1, updatedAt: nowIso(), cancelReason: reason ?? null })
      .where(eq(bookings.id, b.id))
  })
  if (status === 'pending' && b.status === 'confirmed') {
    await enqueueBookingMail(b.id, 'guest.requested')
    await enqueueBookingMail(b.id, 'host.requested')
    await enqueueCalendarSync(b.id)
  } else {
    await enqueueBookingMail(b.id, 'guest.rescheduled')
    if (by === 'guest') await enqueueBookingMail(b.id, 'host.rescheduled')
    if (status === 'confirmed') await afterConfirmed({ id: b.id, startsAt: start.toISOString(), sequence: b.sequence + 1 }, ev)
  }
  await emitBookingEvent(b.hostId, 'booking.rescheduled', b.id)
}

export async function rescheduleBooking(actor: Actor, id: string, newStart: string, reason?: string) {
  requireWrite(actor)
  const b = await getBooking(actor, id)
  if (!ACTIVE.includes(b.status)) throw invalid('Abgesagte Termine können nicht verschoben werden.')
  await moveBooking(b, newStart, 'host', reason)
  await audit(actor, 'Termin verschoben', `${await when(b.startsAt, b.hostId)} → ${await when(newStart, b.hostId)} (${ref(b)})`, 'write')
  return getBooking(actor, id)
}

/* ---------------- Gast über geheimen Link ---------------- */

export async function guestCancel(token: string, reason?: string) {
  const { booking: b } = await getBookingByToken(token)
  if (!ACTIVE.includes(b.status)) throw invalid('Dieser Termin ist bereits abgesagt.')
  if (new Date(b.startsAt) < new Date()) throw invalid('Vergangene Termine können nicht abgesagt werden.')
  await setStatus(b, 'cancelled', { cancelReason: reason ?? null, cancelledBy: 'guest' })
  await enqueueBookingMail(b.id, 'guest.cancelled')
  await enqueueBookingMail(b.id, 'host.cancelled')
  await enqueueCalendarSync(b.id)
  await emitBookingEvent(b.hostId, 'booking.cancelled', b.id)
  await audit({ type: 'guest' }, 'Termin vom Gast abgesagt', `${await when(b.startsAt, b.hostId)} (${ref(b)})`, 'write')
}

export async function guestReschedule(token: string, newStart: string) {
  const { booking: b } = await getBookingByToken(token)
  if (!ACTIVE.includes(b.status)) throw invalid('Dieser Termin ist abgesagt.')
  if (new Date(b.startsAt) < new Date()) throw invalid('Vergangene Termine können nicht verschoben werden.')
  await moveBooking(b, newStart, 'guest')
  await audit({ type: 'guest' }, 'Termin vom Gast verschoben', `${await when(b.startsAt, b.hostId)} → ${await when(newStart, b.hostId)} (${ref(b)})`, 'write')
}

/** Öffentliche Sicht auf eine Buchung (für Bestätigungs-/Verwaltungsseite des Gastes). */
export function publicBooking(b: BookingRow, ev: EventTypeRow) {
  const showLink = b.status === 'confirmed'
  return {
    status: b.status,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestTimezone: b.guestTimezone,
    eventTypeId: ev.id,
    eventSlug: ev.slug,
    eventTitle: ev.title,
    duration: ev.duration,
    location: { kind: b.location.kind, label: locationLabel(ev.location, b.locale), value: showLink || b.location.kind === 'onsite' ? b.location.value : '' },
  }
}

export { findPublicEventType }
