import { and, count, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import { bookings, calendarConnections, eventTypes } from '../db/schema'
import { type Actor, requireOwner } from '../lib/actor'
import { nowIso } from '../lib/util'
import { getSetting, setSetting } from './settings'

export type OnboardingStepId = 'mail' | 'availability' | 'eventType' | 'legal' | 'calendar' | 'testBooking'

export interface OnboardingStep {
  id: OnboardingStepId
  done: boolean
  /** Kein Muss: zählt nicht zum Fortschritt */
  optional: boolean
}

/**
 * Checkliste „Erste Schritte“ mit echten Kriterien (nur für die Inhaberin / den Inhaber).
 * „Fertig“ heißt: alle Pflichtpunkte erledigt. Ausblenden speichert der Server in den Einstellungen.
 */
export async function getOnboarding(actor: Actor) {
  const a = requireOwner(actor)
  const [smtp, lastSmtpOk, branding, ob] = await Promise.all([getSetting('smtp'), getSetting('lastSmtpOk'), getSetting('branding'), getSetting('onboarding')])
  const n = async (table: typeof eventTypes | typeof calendarConnections, col: typeof eventTypes.userId | typeof calendarConnections.userId) =>
    (await db.select({ n: count() }).from(table).where(eq(col, a.userId)))[0]?.n ?? 0
  // Testbuchung: nur bestätigte oder angefragte Termine zählen, keine abgesagten oder abgelehnten
  const bookingCount = (await db.select({ n: count() }).from(bookings).where(and(eq(bookings.hostId, a.userId), inArray(bookings.status, ['confirmed', 'pending']))))[0]?.n ?? 0
  const [events, calendars] = await Promise.all([n(eventTypes, eventTypes.userId), n(calendarConnections, calendarConnections.userId)])
  const steps: OnboardingStep[] = [
    { id: 'mail', done: !!smtp && !!lastSmtpOk, optional: false },
    { id: 'availability', done: !!ob.availabilitySavedAt, optional: false },
    { id: 'eventType', done: events > 0, optional: false },
    { id: 'legal', done: !!branding.imprintUrl && !!branding.privacyUrl, optional: false },
    { id: 'calendar', done: calendars > 0, optional: true },
    { id: 'testBooking', done: bookingCount > 0, optional: false },
  ]
  const required = steps.filter((s) => !s.optional)
  return { steps, doneCount: required.filter((s) => s.done).length, total: required.length, allDone: required.every((s) => s.done), hidden: ob.hidden, celebrate: required.every((s) => s.done) && !ob.doneDismissed }
}

export async function setOnboardingHidden(actor: Actor, patch: { hidden?: boolean; doneDismissed?: boolean }) {
  requireOwner(actor)
  const next = { ...(await getSetting('onboarding')), ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}), ...(patch.doneDismissed !== undefined ? { doneDismissed: patch.doneDismissed } : {}) }
  await setSetting('onboarding', next)
  return { hidden: next.hidden, doneDismissed: next.doneDismissed }
}

/** Merkt sich, dass die Verfügbarkeit mindestens einmal gespeichert wurde. */
export async function markAvailabilitySaved() {
  const ob = await getSetting('onboarding')
  if (!ob.availabilitySavedAt) await setSetting('onboarding', { ...ob, availabilitySavedAt: nowIso() })
}
