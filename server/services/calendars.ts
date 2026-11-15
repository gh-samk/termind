import { and, eq, gt, inArray, lt, max } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { bookings, calendarBusy, calendarConnections, eventTypes, users, type RemoteCalendar } from '../db/schema'
import { busyFromIcs } from '../calendar/ical'
import { deleteEvent, discoverCalendars, fetchCalendarData, putEvent } from '../calendar/caldav'
import { type Actor, requireHost, requireWrite } from '../lib/actor'
import { invalid, notFound } from '../lib/errors'
import { fetchText } from '../lib/safeFetch'
import { decrypt, encrypt, newId, nowIso } from '../lib/util'
import { buildIcs } from '../mail/ics'
import { audit } from './audit'
import { locationLabel } from './eventTypes'

type Conn = typeof calendarConnections.$inferSelect

export const caldavInput = z.object({
  url: z.string().min(8).max(500),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  name: z.string().max(80).optional(),
})
export const icsInput = z.object({ url: z.string().min(8).max(2000), name: z.string().max(80).optional() })
export const connectionUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
  calendars: z.array(z.object({ url: z.string(), checkBusy: z.boolean() })).optional(),
  /** Kalender für neue Termine; null = nicht eintragen */
  writeCalendarUrl: z.string().nullable().optional(),
  password: z.string().min(1).max(500).optional(),
  username: z.string().min(1).max(200).optional(),
})

function publicConn(c: Conn) {
  const { passwordEnc: _p, ...rest } = c
  return rest
}

const creds = (c: Conn) => ({ url: c.url, username: c.username ?? '', password: c.passwordEnc ? decrypt(c.passwordEnc) : '' })

async function ownConn(userId: string, id: string) {
  const c = await db.query.calendarConnections.findFirst({ where: and(eq(calendarConnections.id, id), eq(calendarConnections.userId, userId)) })
  if (!c) throw notFound('Kalenderverbindung')
  return c
}

/* ---------------- Verwalten ---------------- */

export async function listConnections(actor: Actor) {
  const a = requireHost(actor)
  const rows = await db.query.calendarConnections.findMany({ where: eq(calendarConnections.userId, a.userId) })
  return rows.map(publicConn)
}

const MAX_CONNECTIONS = 10

async function assertConnectionLimit(userId: string) {
  const n = (await db.query.calendarConnections.findMany({ where: eq(calendarConnections.userId, userId), columns: { id: true } })).length
  if (n >= MAX_CONNECTIONS) throw invalid(`Höchstens ${MAX_CONNECTIONS} Kalenderverbindungen.`)
}

export async function addCaldav(actor: Actor, raw: unknown) {
  const a = requireWrite(actor)
  const input = caldavInput.parse(raw)
  await assertConnectionLimit(a.userId)
  const found = await discoverCalendars(input)
  if (found.length === 0) throw invalid('Verbindung klappt, aber es wurde kein Kalender gefunden.')
  const hasWriter = await db.query.calendarConnections.findFirst({ where: and(eq(calendarConnections.userId, a.userId), gt(calendarConnections.writeCalendarUrl, '')) })
  const row = {
    id: newId(),
    userId: a.userId,
    kind: 'caldav' as const,
    name: input.name?.trim() || new URL(input.url).hostname,
    url: input.url,
    username: input.username,
    passwordEnc: encrypt(input.password),
    calendars: found.map((k): RemoteCalendar => ({ ...k, checkBusy: true })),
    writeCalendarUrl: hasWriter ? null : found[0].url,
  }
  await db.insert(calendarConnections).values(row)
  await audit(actor, 'Kalender verbunden', `${row.name} (CalDAV, ${found.length} Kalender)`, 'write')
  await syncConnection(row.id)
  return publicConn((await ownConn(a.userId, row.id))!)
}

export async function addIcs(actor: Actor, raw: unknown) {
  const a = requireWrite(actor)
  const input = icsInput.parse(raw)
  await assertConnectionLimit(a.userId)
  const url = input.url.trim().replace(/^webcals?:\/\//i, 'https://')
  const text = await fetchText(url)
  if (!/BEGIN:VCALENDAR/i.test(text)) throw invalid('Unter dieser Adresse liegt keine Kalenderdatei (.ics).')
  const row = { id: newId(), userId: a.userId, kind: 'ics' as const, name: input.name?.trim() || new URL(url).hostname, url, calendars: [{ url, name: input.name?.trim() || 'Kalender', checkBusy: true }] }
  await db.insert(calendarConnections).values(row)
  await audit(actor, 'Kalender-Abo verbunden', row.name, 'write')
  await syncConnection(row.id)
  return publicConn(await ownConn(a.userId, row.id))
}

export async function updateConnection(actor: Actor, id: string, raw: unknown) {
  const a = requireWrite(actor)
  const c = await ownConn(a.userId, id)
  const input = connectionUpdate.parse(raw)
  const patch: Partial<Conn> = {}
  if (input.name) patch.name = input.name
  if (input.username) patch.username = input.username
  if (input.password) patch.passwordEnc = encrypt(input.password)
  if (input.calendars) patch.calendars = c.calendars.map((k) => ({ ...k, checkBusy: input.calendars!.find((x) => x.url === k.url)?.checkBusy ?? k.checkBusy }))
  if (input.writeCalendarUrl !== undefined) {
    if (input.writeCalendarUrl && (c.kind !== 'caldav' || !c.calendars.some((k) => k.url === input.writeCalendarUrl))) throw invalid('Diesen Kalender gibt es in der Verbindung nicht.')
    // Nur ein Zielkalender pro Person
    if (input.writeCalendarUrl) await db.update(calendarConnections).set({ writeCalendarUrl: null }).where(eq(calendarConnections.userId, a.userId))
    patch.writeCalendarUrl = input.writeCalendarUrl
  }
  await db.update(calendarConnections).set(patch).where(eq(calendarConnections.id, id))
  await audit(actor, 'Kalenderverbindung geändert', c.name, 'write')
  if (input.password || input.username || input.calendars) await syncConnection(id)
  return publicConn(await ownConn(a.userId, id))
}

export async function deleteConnection(actor: Actor, id: string) {
  const a = requireWrite(actor)
  const c = await ownConn(a.userId, id)
  await db.delete(calendarConnections).where(eq(calendarConnections.id, id))
  await audit(actor, 'Kalenderverbindung entfernt', c.name, 'write')
}

export async function syncNow(actor: Actor, id: string) {
  const a = requireWrite(actor)
  await ownConn(a.userId, id)
  await syncConnection(id)
  return publicConn(await ownConn(a.userId, id))
}

/* ---------------- Abgleich ---------------- */

/** Wie weit in die Zukunft abgeglichen wird: längstes Buchungsfenster, mind. 60, max. 370 Tage. */
async function horizonDays(userId: string) {
  const r = await db.select({ m: max(eventTypes.windowDays) }).from(eventTypes).where(eq(eventTypes.userId, userId))
  return Math.min(370, Math.max(60, (r[0]?.m ?? 60) + 2))
}

export async function syncConnection(id: string) {
  const c = await db.query.calendarConnections.findFirst({ where: eq(calendarConnections.id, id) })
  if (!c) return
  const user = await db.query.users.findFirst({ where: eq(users.id, c.userId), columns: { timezone: true } })
  const from = new Date(Date.now() - 86_400_000)
  const to = new Date(Date.now() + (await horizonDays(c.userId)) * 86_400_000)
  try {
    const active = c.calendars.filter((k) => k.checkBusy).map((k) => k.url)
    const texts = active.length === 0 ? [] : c.kind === 'caldav' ? await fetchCalendarData(creds(c), active, from, to) : [await fetchText(c.url, 10 * 1024 * 1024)]
    // Ein Abo, das plötzlich keine Kalenderdatei mehr liefert, darf nicht alle belegten Zeiten löschen
    if (c.kind === 'ics' && texts[0] !== undefined && !/BEGIN:VCALENDAR/i.test(texts[0])) throw new Error('Unter der Adresse liegt keine Kalenderdatei mehr.')
    const busy = busyFromIcs(texts, from, to, user?.timezone ?? 'Europe/Berlin')
    await db.transaction(async (tx) => {
      await tx.delete(calendarBusy).where(eq(calendarBusy.connectionId, c.id))
      for (let i = 0; i < busy.length; i += 200) {
        await tx.insert(calendarBusy).values(busy.slice(i, i + 200).map((b) => ({ connectionId: c.id, userId: c.userId, startsAt: b.start.toISOString(), endsAt: b.end.toISOString() })))
      }
    })
    await db.update(calendarConnections).set({ status: 'ok', lastError: null, lastSyncAt: nowIso() }).where(eq(calendarConnections.id, c.id))
  } catch (e) {
    // Alte belegte Zeiten bleiben stehen: lieber zu vorsichtig als Doppelbuchungen
    const msg = e instanceof Error ? e.message : String(e)
    await db.update(calendarConnections).set({ status: 'error', lastError: msg.slice(0, 300) }).where(eq(calendarConnections.id, c.id))
  }
}

let syncing = false
/** Alle Verbindungen abgleichen, höchstens 2 gleichzeitig, nie zwei Läufe übereinander. */
export async function syncAll() {
  if (syncing) return
  syncing = true
  try {
    const queue = (await db.query.calendarConnections.findMany({ columns: { id: true } })).map((c) => c.id)
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await syncConnection(id)
    }
    await Promise.all([worker(), worker()])
  } finally {
    syncing = false
  }
}

export function startCalendarSync() {
  const minutes = Math.max(1, Number(process.env.CALENDAR_SYNC_MINUTES ?? 5))
  const timer = setInterval(() => void syncAll().catch((e) => console.error('[kalender]', e)), minutes * 60_000)
  timer.unref()
  setTimeout(() => void syncAll().catch(() => {}), 5_000).unref()
}

/** Belegte Zeiten aus allen verbundenen Kalendern eines Gastgebers. */
export async function externalBusy(userId: string, from: Date, to: Date) {
  const rows = await db.query.calendarBusy.findMany({
    where: and(eq(calendarBusy.userId, userId), lt(calendarBusy.startsAt, to.toISOString()), gt(calendarBusy.endsAt, from.toISOString())),
    columns: { startsAt: true, endsAt: true },
  })
  return rows.map((r) => ({ start: new Date(r.startsAt), end: new Date(r.endsAt) }))
}

/* ---------------- Termine in den Kalender schreiben ---------------- */

/** Bringt den Kalendereintrag einer Buchung auf den aktuellen Stand (anlegen, ändern, löschen). */
export async function syncBookingToCalendar(bookingId: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) })
  if (!b) return
  const target = await db.query.calendarConnections.findFirst({ where: and(eq(calendarConnections.userId, b.hostId), eq(calendarConnections.kind, 'caldav'), gt(calendarConnections.writeCalendarUrl, '')) })
  const refConn = b.calendarRef ? await db.query.calendarConnections.findFirst({ where: eq(calendarConnections.id, b.calendarRef.connectionId) }) : null

  if (b.status !== 'confirmed' || b.anonymizedAt) {
    if (b.calendarRef && refConn) await deleteEvent(creds(refConn), b.calendarRef.objectUrl, b.calendarRef.etag)
    if (b.calendarRef) await db.update(bookings).set({ calendarRef: null }).where(eq(bookings.id, b.id))
    return
  }
  const conn = refConn ?? target
  if (!conn || (!conn.writeCalendarUrl && !refConn)) return
  const ev = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, b.eventTypeId) })
  const host = await db.query.users.findFirst({ where: eq(users.id, b.hostId) })
  if (!ev || !host) return

  const join = b.location.kind === 'video' ? b.location.value : null
  const where = b.location.kind === 'onsite' ? b.location.value : b.location.kind === 'phone-host-calls' ? `Anrufen: ${b.answers.find((a) => a.fieldId === 'phone')?.value ?? ''}` : (join ?? locationLabel(b.location))
  const ics = buildIcs({
    uid: `${b.id}@termind`,
    sequence: b.sequence,
    method: null,
    start: new Date(b.startsAt),
    end: new Date(b.endsAt),
    summary: `${ev.title} · ${b.guestName}`,
    description: [`${b.guestName} <${b.guestEmail}>`, ...b.answers.map((a) => `${a.label}: ${a.value}`), join ? `Videocall: ${join}` : '', b.note ? `Notiz: ${b.note}` : ''].filter(Boolean).join('\n'),
    location: where,
    url: join ?? undefined,
    organizer: { name: host.name, email: host.email },
    attendee: { name: b.guestName, email: b.guestEmail },
    alarm: false,
  })
  const ref = await putEvent(creds(conn), conn.writeCalendarUrl ?? '', b.id, ics, b.calendarRef && refConn ? b.calendarRef : undefined)
  await db.update(bookings).set({ calendarRef: { connectionId: conn.id, ...ref } }).where(eq(bookings.id, b.id))
}

/** Für die Oberfläche: Verbindungen mit Fehler. */
export async function connectionProblems(userId: string) {
  return db.query.calendarConnections.findMany({ where: and(eq(calendarConnections.userId, userId), inArray(calendarConnections.status, ['error'])), columns: { id: true, name: true, lastError: true, lastSyncAt: true } })
}
