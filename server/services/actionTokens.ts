import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { ACTION_MESSAGE_MAX } from '../../shared/schemas'
import { db } from '../db/client'
import { actionTokens, bookings, eventTypes, users } from '../db/schema'
import type { Actor } from '../lib/actor'
import { AppError } from '../lib/errors'
import { hit } from '../lib/rateLimit'
import { nowIso, randomToken, sha256 } from '../lib/util'
import { acceptBooking, cancelBooking } from './bookings'

/*
 * Direkt-Knöpfe „Bestätigen“ / „Ablehnen“ in der Anfrage-Mail an den Gastgeber.
 *
 * - Token: 32 Byte zufällig (base64url). In der Datenbank steht nur der SHA-256-Hash.
 * - Pro Mail zwei Token (confirm, decline), gebunden an Buchung, Gastgeber und Aktion.
 * - Gültig 7 Tage, höchstens bis zum Terminbeginn.
 * - Wer einen Token einlöst, macht alle anderen Token derselben Buchung ungültig.
 * - Anzeigen (describe) verbraucht nichts; erst execute (POST) ändert die Buchung.
 */

export const ACTION_DAYS = 7
export type ActionKind = 'confirm' | 'decline'

const GONE = 'Dieser Link ist abgelaufen oder ungültig. Du kannst die Anfrage auch im Bereich „Termine“ bearbeiten.'
const HANDLED = 'Diese Anfrage wurde schon bearbeitet.'
const handled = () => new AppError('handled', HANDLED)
const expired = () => new AppError('expired', GONE)

/** Legt zwei Token für eine offene Anfrage an. Gibt null zurück, wenn der Termin schon begonnen hat. */
export async function createActionTokens(b: { id: string; hostId: string; startsAt: string; sequence: number }) {
  const now = Date.now()
  const limit = Math.min(now + ACTION_DAYS * 86_400_000, new Date(b.startsAt).getTime())
  if (limit <= now) return null
  const expiresAt = new Date(limit).toISOString()
  const confirm = randomToken(32)
  const decline = randomToken(32)
  // Gebunden an den Stand der Buchung: wird sie bestätigt, abgelehnt, abgesagt oder verschoben, sind die Links tot
  await db.insert(actionTokens).values([
    { id: sha256(confirm), bookingId: b.id, userId: b.hostId, action: 'confirm', bookingSequence: b.sequence, expiresAt },
    { id: sha256(decline), bookingId: b.id, userId: b.hostId, action: 'decline', bookingSequence: b.sequence, expiresAt },
  ])
  return { confirm, decline }
}

const tooMany = () => new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')

type Locale = 'de' | 'en'
export type ActionView =
  | { state: 'open'; action: ActionKind; eventTitle: string; startsAt: string; endsAt: string; guestName: string; timezone: string; locale: Locale }
  | { state: 'handled' | 'past' | 'gone'; locale: Locale }

/** Sprache aus dem Accept-Language-Header, wenn der Link nichts verrät (Standard: Deutsch). */
export const localeFromHeader = (h?: string | null): Locale => (/^\s*en/i.test(h ?? '') ? 'en' : 'de')

/**
 * Was hinter einem Link steckt (nur Anzeige, ändert nichts). Unbekannt und abgelaufen sehen gleich aus ('gone').
 * Ein Link gilt nur, solange die Buchung noch im selben Stand ist wie beim Versand der Mail.
 */
export async function describeActionToken(token: string, ip: string, acceptLanguage?: string | null): Promise<ActionView> {
  if (!hit(`aktion-get:${ip}`, 60, 60_000)) throw tooMany()
  const fallback = localeFromHeader(acceptLanguage)
  const row = token.length >= 20 && token.length <= 100 ? await db.query.actionTokens.findFirst({ where: eq(actionTokens.id, sha256(token)) }) : undefined
  if (!row) return { state: 'gone', locale: fallback }
  if (row.expiresAt <= nowIso()) {
    // Abgelaufen, weil der Termin begonnen hat (Ablauf = Terminbeginn): eigene Meldung statt „ungültig“
    const pb = await db.query.bookings.findFirst({ where: eq(bookings.id, row.bookingId), columns: { startsAt: true, hostId: true, anonymizedAt: true } })
    if (pb && pb.hostId === row.userId && !pb.anonymizedAt && pb.startsAt <= nowIso()) {
      const h = await db.query.users.findFirst({ where: eq(users.id, row.userId), columns: { locale: true } })
      return { state: 'past', locale: h?.locale ?? fallback }
    }
    return { state: 'gone', locale: fallback }
  }
  const [b, host] = await Promise.all([
    db.query.bookings.findFirst({ where: eq(bookings.id, row.bookingId) }),
    db.query.users.findFirst({ where: eq(users.id, row.userId), columns: { timezone: true, locale: true } }),
  ])
  if (!b || !host || b.hostId !== row.userId || b.anonymizedAt) return { state: 'gone', locale: fallback }
  const locale = host.locale
  if (row.usedAt || b.status !== 'pending' || b.sequence !== row.bookingSequence) return { state: 'handled', locale }
  if (b.endsAt < nowIso()) return { state: 'past', locale }
  const ev = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, b.eventTypeId), columns: { title: true } })
  if (!ev) return { state: 'gone', locale }
  return { state: 'open', action: row.action, eventTitle: ev.title, startsAt: b.startsAt, endsAt: b.endsAt, guestName: b.guestName, timezone: host.timezone, locale }
}

const cleanMessage = (m?: string) => (m ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, ACTION_MESSAGE_MAX) || undefined

/**
 * Löst den Token ein (POST). Atomar: nur der erste Versuch kommt durch, danach sind alle Token der Buchung verbraucht.
 * Ausgeführt wird über dieselben Funktionen wie in der Oberfläche, mit dem Gastgeber als Akteur (Vermerk „per Mail-Knopf“ im Protokoll).
 * Fehlercodes: 'handled' (schon bearbeitet / Termin geändert), 'expired' (abgelaufen oder ungültig).
 */
export async function executeActionToken(token: string, ip: string, message?: string) {
  if (!hit(`aktion-post:${ip}`, 20, 15 * 60_000)) throw tooMany()
  if (token.length < 20 || token.length > 100) throw expired()
  const id = sha256(token)
  if (!hit(`aktion-token:${id}`, 10, 60 * 60_000)) throw tooMany()

  /*
   * Beanspruchen in EINER Anweisung (atomar, ohne Transaktion): nur wenn der Token offen und nicht abgelaufen ist
   * und kein anderer Token derselben Buchung schon benutzt wurde. Dadurch kommen auch Bestätigen und Ablehnen,
   * die gleichzeitig eintreffen, nicht beide durch.
   */
  const now = nowIso()
  const mine = await db
    .update(actionTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(actionTokens.id, id),
        isNull(actionTokens.usedAt),
        gt(actionTokens.expiresAt, now),
        sql`NOT EXISTS (SELECT 1 FROM action_tokens o WHERE o.booking_id = action_tokens.booking_id AND o.used_at IS NOT NULL)`,
      ),
    )
    .returning({ bookingId: actionTokens.bookingId, userId: actionTokens.userId, action: actionTokens.action, bookingSequence: actionTokens.bookingSequence })
  if (mine.length !== 1) {
    const row = await db.query.actionTokens.findFirst({ where: eq(actionTokens.id, id), columns: { usedAt: true, bookingId: true, expiresAt: true } })
    if (row && row.expiresAt > now) throw handled() // schon benutzt oder durch eine andere Entscheidung entwertet
    throw expired()
  }
  const claim = mine[0]
  const restore = [id]
  const wanted = claim.action === 'confirm' ? 'confirmed' : 'declined'

  try {
    // Übrige Token der Buchung entwerten (gehört zum Versuch: scheitert es, werden alle wieder freigegeben)
    const others = await db
      .update(actionTokens)
      .set({ usedAt: now })
      .where(and(eq(actionTokens.bookingId, claim.bookingId), isNull(actionTokens.usedAt)))
      .returning({ id: actionTokens.id })
    restore.push(...others.map((o) => o.id))

    const b = await db.query.bookings.findFirst({ where: eq(bookings.id, claim.bookingId) })
    const host = await db.query.users.findFirst({ where: eq(users.id, claim.userId), columns: { id: true, role: true } })
    if (!b || !host || b.hostId !== host.id || b.anonymizedAt) throw expired()
    // Nur im selben Stand wie beim Versand der Mail (nicht verschoben, nicht anders entschieden)
    if (b.status !== 'pending' || b.sequence !== claim.bookingSequence) throw handled()
    const actor: Actor = { type: 'user', userId: host.id, role: host.role, via: 'mail-link' }
    if (claim.action === 'confirm') await acceptBooking(actor, b.id)
    else await cancelBooking(actor, b.id, cleanMessage(message))
    return { action: claim.action }
  } catch (e) {
    const now2 = await db.query.bookings.findFirst({ where: eq(bookings.id, claim.bookingId), columns: { status: true, sequence: true } }).catch(() => undefined)
    // Status ist schon gesetzt, nur Folgeaktionen (Mails, Kalender, Webhook) sind gescheitert: Entscheidung gilt, Fehler nur ins Log
    if (now2?.status === wanted && !(e instanceof AppError && (e.code === 'handled' || e.code === 'expired'))) {
      console.error('[aktion] Folgeaktion nach der Entscheidung fehlgeschlagen:', e instanceof Error ? e.message : e)
      return { action: claim.action }
    }
    // Sonst bleibt der Link benutzbar, solange die Anfrage unverändert offen ist
    if (now2?.status === 'pending' && now2.sequence === claim.bookingSequence && !(e instanceof AppError && e.code === 'handled')) {
      await db.update(actionTokens).set({ usedAt: null }).where(inArray(actionTokens.id, restore)).catch(() => {})
    }
    throw e
  }
}
