import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import { db } from '../db/client'
import { bookings, eventTypes, jobs, passwordResets, users } from '../db/schema'
import { decrypt, encrypt, newId, nowIso, sha256 } from '../lib/util'
import { syncBookingToCalendar } from '../services/calendars'
import { deliverWebhook } from '../services/webhooks'
import { getSetting } from '../services/settings'
import { type MailTemplate, renderMail, renderResetMail } from './templates'
import { explainSmtp, logSmtpError, sendMail } from './transport'
import { config } from '../config'

const MAX_ATTEMPTS = 8

export async function enqueueBookingMail(bookingId: string, template: MailTemplate, runAt = new Date(), extra: Record<string, unknown> = {}, dedupeKey?: string) {
  await db
    .insert(jobs)
    .values({ id: newId(), type: 'booking-mail', payload: { bookingId, template, ...extra }, runAt: runAt.toISOString(), dedupeKey })
    .onConflictDoNothing({ target: jobs.dedupeKey })
}

/**
 * Mail „Passwort zurücksetzen“. Der Token liegt nur verschlüsselt im Auftrag (nie im Klartext in der Datenbank)
 * und wird nach dem Versand entfernt.
 */
export async function enqueuePasswordResetMail(userId: string, token: string) {
  await db.insert(jobs).values({ id: newId(), type: 'password-reset', payload: { userId, tokenEnc: encrypt(token) }, runAt: nowIso() })
}

const MAIL_JOBS = new Set(['booking-mail', 'password-reset'])

/** Kalendereintrag der Buchung im CalDAV-Kalender des Gastgebers aktualisieren. */
export async function enqueueCalendarSync(bookingId: string) {
  await db.insert(jobs).values({ id: newId(), type: 'calendar-booking', payload: { bookingId }, runAt: nowIso() })
}

/** Erinnerungen an den Gast planen. Veraltete Jobs (nach Verschieben) prüfen beim Senden die Startzeit. */
export async function scheduleReminders(booking: { id: string; startsAt: string; sequence: number }, offsetsMinutes: number[]) {
  const start = new Date(booking.startsAt).getTime()
  for (const m of offsetsMinutes) {
    const at = new Date(start - m * 60_000)
    if (at.getTime() < Date.now() + 60_000) continue
    // Mit Änderungszähler im Schlüssel: auch nach Hin- und Zurückverschieben wird neu erinnert
    await enqueueBookingMail(booking.id, 'guest.reminder', at, { forStart: booking.startsAt }, `rem:${booking.id}:${m}:${booking.startsAt}:${booking.sequence}`)
  }
}

async function processJob(job: typeof jobs.$inferSelect) {
  if (job.type === 'calendar-booking') return syncBookingToCalendar((job.payload as { bookingId: string }).bookingId)
  if (job.type === 'webhook') return void (await deliverWebhook(job.payload as Parameters<typeof deliverWebhook>[0], job.attempts + 1))
  if (job.type === 'password-reset') {
    const { userId, tokenEnc } = job.payload as { userId: string; tokenEnc: string }
    const token = decrypt(tokenEnc)
    // Nur senden, solange der Link noch einlösbar ist
    const valid = await db.query.passwordResets.findFirst({ where: eq(passwordResets.id, sha256(token)) })
    if (!valid || valid.usedAt || valid.expiresAt < nowIso()) return
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user) return
    const link = `${config.publicUrl}/passwort-neu?token=${token}`
    return sendMail(renderResetMail(user, link, Math.round((new Date(valid.expiresAt).getTime() - new Date(valid.createdAt).getTime()) / 60_000), await getSetting('branding')))
  }
  if (job.type !== 'booking-mail') throw new Error(`Unbekannter Auftrag: ${job.type}`)
  const { bookingId, template, forStart } = job.payload as { bookingId: string; template: MailTemplate; forStart?: string }
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) })
  if (!booking || booking.anonymizedAt) return // gelöscht oder anonymisiert: nichts mehr zu senden
  // Erinnerung nur, wenn der Termin noch steht und nicht verschoben wurde
  // Veraltete Mails nicht mehr senden
  if (template === 'guest.reminder' && (booking.status !== 'confirmed' || booking.startsAt !== forStart || booking.startsAt < nowIso())) return
  if (template === 'guest.confirmed' && booking.status !== 'confirmed') return
  if ((template === 'guest.requested' || template === 'host.requested') && booking.status !== 'pending') return
  const event = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, booking.eventTypeId) })
  const host = await db.query.users.findFirst({ where: eq(users.id, booking.hostId) })
  if (!event || !host) return
  const mail = renderMail(template, { booking, event, host, branding: await getSetting('branding'), texts: await getSetting('mailTexts') })
  await sendMail(mail)
}

async function runJob(job: typeof jobs.$inferSelect) {
  // Atomar beanspruchen: nur wer den Status von queued auf running setzt, bearbeitet den Job
  const claimed = await db.update(jobs).set({ status: 'running' }).where(and(eq(jobs.id, job.id), eq(jobs.status, 'queued'))).returning({ id: jobs.id })
  if (claimed.length === 0) return
  try {
    await processJob(job)
    await db.update(jobs).set({ status: 'done', attempts: job.attempts + 1, lastError: null, ...(job.type === 'password-reset' ? { payload: {} } : {}) }).where(eq(jobs.id, job.id))
  } catch (err) {
    const attempts = job.attempts + 1
    // Mails: verständliche Erklärung für die Oberfläche, der Rohfehler nur ins Server-Log
    const isMail = MAIL_JOBS.has(job.type)
    const msg = isMail ? explainSmtp(err) : err instanceof Error ? err.message : String(err)
    const failed = attempts >= MAX_ATTEMPTS || (job.type === 'password-reset' && attempts >= 3)
    // Exponentielles Warten: 1, 2, 4 … Minuten
    const next = new Date(Date.now() + 2 ** (attempts - 1) * 60_000).toISOString()
    await db
      .update(jobs)
      .set({ status: failed ? 'failed' : 'queued', attempts, lastError: msg.slice(0, 500), runAt: next, ...(failed && job.type === 'password-reset' ? { payload: {} } : {}) })
      .where(eq(jobs.id, job.id))
    if (isMail) logSmtpError(`${job.type} ${failed ? 'endgültig fehlgeschlagen' : 'Fehler, neuer Versuch später'}`, err)
    else console.warn(`[warteschlange] ${job.type} ${failed ? 'endgültig fehlgeschlagen' : 'Fehler, neuer Versuch später'}: ${msg}`)
  }
}

/**
 * Zwei getrennte Spuren: Mails/Kalender nacheinander, Webhooks parallel (max. 4).
 * So kann ein langsamer Webhook-Empfänger keine Bestätigungsmail aufhalten.
 */
const lanes = {
  mail: { types: ['booking-mail', 'calendar-booking', 'password-reset'], parallel: 1, running: false },
  webhook: { types: ['webhook'], parallel: 4, running: false },
}

async function tick(lane: keyof typeof lanes) {
  const l = lanes[lane]
  if (l.running) return
  l.running = true
  try {
    const due = await db.query.jobs.findMany({ where: and(eq(jobs.status, 'queued'), lte(jobs.runAt, nowIso()), inArray(jobs.type, l.types)), orderBy: asc(jobs.runAt), limit: 20 })
    for (let i = 0; i < due.length; i += l.parallel) await Promise.all(due.slice(i, i + l.parallel).map(runJob))
  } finally {
    l.running = false
  }
}

export async function startWorker(intervalMs = 3000) {
  // Nach einem Absturz hängengebliebene Aufträge wieder einreihen
  await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.status, 'running'))
  const timers = (Object.keys(lanes) as (keyof typeof lanes)[]).map((lane) => {
    const t = setInterval(() => void tick(lane).catch((e) => console.error('[warteschlange]', e)), intervalMs)
    t.unref()
    return t
  })
  return () => timers.forEach(clearInterval)
}

/** Für die Oberfläche: Status der Warteschlange. */
export async function mailQueueStatus() {
  const rows = await db.query.jobs.findMany({ where: inArray(jobs.status, ['queued', 'failed']), columns: { status: true, lastError: true } })
  return {
    queued: rows.filter((r) => r.status === 'queued').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    lastError: rows.find((r) => r.lastError)?.lastError ?? null,
  }
}

/** Fehlgeschlagene Mails erneut versuchen (z. B. nach SMTP-Korrektur). */
/** Fehlgeschlagene und gerade wartende Wiederholungen sofort neu versuchen. Geplante Erinnerungen bleiben unberührt. */
export async function retryFailedMails() {
  await db.update(jobs).set({ status: 'queued', attempts: 0, runAt: nowIso() }).where(eq(jobs.status, 'failed'))
  await db.update(jobs).set({ runAt: nowIso() }).where(and(eq(jobs.status, 'queued'), gt(jobs.attempts, 0)))
}
