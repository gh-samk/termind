import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { auditLog, bookings, eventTypes } from '../db/schema'
import { type Actor, requireHost, requireOwner, requireWrite } from '../lib/actor'
import { invalid } from '../lib/errors'
import { nowIso, randomToken } from '../lib/util'
import { enqueueCalendarSync } from '../mail/queue'
import { audit } from './audit'
import { getSetting, setSetting } from './settings'

const normEmail = (e: string) => {
  const v = e.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw invalid('Bitte eine gültige E-Mail-Adresse angeben.')
  return v
}

/** Art. 15 DSGVO: alles, was zu einer E-Mail-Adresse gespeichert ist. */
export async function exportPersonalData(actor: Actor, email: string) {
  const a = requireHost(actor)
  const e = normEmail(email)
  const rows = await db
    .select({ b: bookings, title: eventTypes.title })
    .from(bookings)
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .where(and(eq(bookings.hostId, a.userId), eq(bookings.guestEmail, e)))
  await audit(actor, 'Datenauskunft erstellt', `${rows.length} Termin(e)`, 'read')
  return {
    email: e,
    exportedAt: nowIso(),
    bookings: rows.map(({ b, title }) => ({
      id: b.id,
      termin: title,
      beginn: b.startsAt,
      ende: b.endsAt,
      status: b.status,
      name: b.guestName,
      email: b.guestEmail,
      zeitzone: b.guestTimezone,
      sprache: b.locale,
      angaben: b.answers.map((x) => ({ frage: x.label, antwort: x.value })),
      nachricht: b.cancelReason,
      gebuchtAm: b.createdAt,
      gebuchtUeber: b.createdVia,
    })),
  }
}

async function anonymize(ids: string[]) {
  if (ids.length === 0) return
  const now = nowIso()
  for (const id of ids) {
    const b = await db.query.bookings.findFirst({ where: eq(bookings.id, id), columns: { calendarRef: true } })
    await db
      .update(bookings)
      .set({ guestName: 'Gelöscht', guestEmail: `geloescht-${id.slice(0, 8)}@anonym.invalid`, answers: [], note: '', cancelReason: null, manageToken: `x_${randomToken(24)}`, anonymizedAt: now, updatedAt: now })
      .where(eq(bookings.id, id))
    // Kalendereintrag mit dem Namen des Gastes ebenfalls entfernen
    if (b?.calendarRef) await enqueueCalendarSync(id)
  }
}

/** Art. 17 DSGVO: anonymisiert alle Termine einer Person, künftige werden still abgesagt. */
export async function erasePersonalData(actor: Actor, email: string) {
  const a = requireWrite(actor)
  const e = normEmail(email)
  const rows = await db.query.bookings.findMany({ where: and(eq(bookings.hostId, a.userId), eq(bookings.guestEmail, e)) })
  const now = nowIso()
  const future = rows.filter((b) => b.endsAt > now && (b.status === 'confirmed' || b.status === 'pending'))
  for (const b of future) {
    await db.update(bookings).set({ status: 'cancelled', cancelledBy: 'host', sequence: b.sequence + 1, updatedAt: now }).where(eq(bookings.id, b.id))
    await enqueueCalendarSync(b.id)
  }
  // Das Protokoll enthält keine Gastnamen; Einträge mit genau dieser E-Mail-Adresse (z. B. aus Suchen) entfernen
  await db.delete(auditLog).where(sql`instr(lower(${auditLog.detail}), ${e}) > 0`)
  await anonymize(rows.map((b) => b.id))
  await audit(actor, 'Personenbezogene Daten gelöscht', `${rows.length} Termin(e)`, 'write')
  return { anonymized: rows.length, cancelled: future.length }
}

/** Täglich: vergangene Termine nach der eingestellten Frist anonymisieren, altes Protokoll löschen. */
export async function runRetention() {
  const months = await getSetting('retentionMonths')
  if (!months || months <= 0) return { anonymized: 0 }
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const old = await db.query.bookings.findMany({ where: and(lt(bookings.endsAt, cutoff.toISOString()), isNull(bookings.anonymizedAt)), columns: { id: true } })
  await anonymize(old.map((b) => b.id))
  await db.delete(auditLog).where(lt(auditLog.at, cutoff.toISOString()))
  return { anonymized: old.length }
}

export function startRetention() {
  const run = () => void runRetention().catch((e) => console.error('[datenschutz]', e))
  setTimeout(run, 30_000).unref()
  setInterval(run, 24 * 60 * 60_000).unref()
}

export async function getPrivacySettings(actor: Actor) {
  requireHost(actor)
  return { retentionMonths: await getSetting('retentionMonths') }
}

export async function setRetention(actor: Actor, months: number) {
  requireOwner(actor)
  if (![0, 3, 6, 12, 24, 36].includes(months)) throw invalid('Ungültige Frist.')
  await setSetting('retentionMonths', months)
  await audit(actor, 'Aufbewahrungsfrist geändert', months ? `${months} Monate` : 'aus', 'write')
  return { retentionMonths: months }
}

