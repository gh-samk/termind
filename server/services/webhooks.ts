import { createHmac } from 'node:crypto'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { bookings, eventTypes, jobs, webhookDeliveries, webhooks } from '../db/schema'
import { type Actor, requireHost, requireWrite } from '../lib/actor'
import { invalid, notFound } from '../lib/errors'
import { assertPublicUrl, safeFetch } from '../lib/safeFetch'
import { decrypt, encrypt, newId, nowIso, randomToken } from '../lib/util'
import { audit } from './audit'

export const WEBHOOK_EVENTS = ['booking.created', 'booking.requested', 'booking.confirmed', 'booking.rescheduled', 'booking.cancelled', 'booking.declined'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export const webhookInput = z.object({
  url: z.string().url().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  active: z.boolean().optional(),
})

const publicHook = (w: typeof webhooks.$inferSelect) => ({ id: w.id, url: w.url, events: w.events, active: w.active, createdAt: w.createdAt })

async function ownHook(userId: string, id: string) {
  const w = await db.query.webhooks.findFirst({ where: and(eq(webhooks.id, id), eq(webhooks.userId, userId)) })
  if (!w) throw notFound('Webhook')
  return w
}

export async function listWebhooks(actor: Actor) {
  const a = requireHost(actor)
  const rows = await db.query.webhooks.findMany({ where: eq(webhooks.userId, a.userId) })
  const out = []
  for (const w of rows) {
    const last = await db.query.webhookDeliveries.findMany({ where: eq(webhookDeliveries.webhookId, w.id), orderBy: desc(webhookDeliveries.createdAt), limit: 20 })
    out.push({ ...publicHook(w), deliveries: last })
  }
  return out
}

export async function createWebhook(actor: Actor, raw: unknown) {
  const a = requireWrite(actor)
  const input = webhookInput.parse(raw)
  await assertPublicUrl(input.url)
  const count = (await db.query.webhooks.findMany({ where: eq(webhooks.userId, a.userId), columns: { id: true } })).length
  if (count >= 20) throw invalid('Höchstens 20 Webhooks.')
  const secret = `whsec_${randomToken(24)}`
  const row = { id: newId(), userId: a.userId, url: input.url, secretEnc: encrypt(secret), events: input.events, active: input.active ?? true }
  await db.insert(webhooks).values(row)
  await audit(actor, 'Webhook angelegt', input.url, 'write')
  return { ...publicHook({ ...row, createdAt: nowIso() }), secret }
}

export async function updateWebhook(actor: Actor, id: string, raw: unknown) {
  const a = requireWrite(actor)
  const w = await ownHook(a.userId, id)
  const input = webhookInput.partial().parse(raw)
  if (input.url) await assertPublicUrl(input.url)
  await db.update(webhooks).set(input).where(eq(webhooks.id, id))
  await audit(actor, 'Webhook geändert', w.url, 'write')
  return publicHook(await ownHook(a.userId, id))
}

export async function deleteWebhook(actor: Actor, id: string) {
  const a = requireWrite(actor)
  const w = await ownHook(a.userId, id)
  await db.delete(webhooks).where(eq(webhooks.id, id))
  await audit(actor, 'Webhook gelöscht', w.url, 'write')
}

/* ---------------- Auslösen & Zustellen ---------------- */

/** Merkt Zustellungen für alle passenden Webhooks des Gastgebers in der Warteschlange vor. */
export async function emitBookingEvent(hostId: string, event: WebhookEvent, bookingId: string) {
  const hooks = await db.query.webhooks.findMany({ where: and(eq(webhooks.userId, hostId), eq(webhooks.active, true)) })
  for (const w of hooks.filter((h) => h.events.includes(event))) {
    await db.insert(jobs).values({ id: newId(), type: 'webhook', payload: { webhookId: w.id, event, bookingId, deliveryId: newId(), occurredAt: nowIso() }, runAt: nowIso() })
  }
}

async function payloadFor(event: string, bookingId: string | null, deliveryId: string, occurredAt: string) {
  if (!bookingId) return { id: deliveryId, event, createdAt: occurredAt, data: { message: 'Testzustellung von termind' } }
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) })
  if (!b) return null
  const ev = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, b.eventTypeId), columns: { id: true, slug: true, title: true, duration: true } })
  return {
    id: deliveryId,
    event,
    createdAt: occurredAt,
    data: {
      booking: {
        id: b.id,
        status: b.status,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        guest: b.anonymizedAt ? null : { name: b.guestName, email: b.guestEmail, timezone: b.guestTimezone, locale: b.locale },
        answers: b.anonymizedAt ? [] : b.answers,
        cancelReason: b.cancelReason,
        cancelledBy: b.cancelledBy,
        createdVia: b.createdVia,
        createdAt: b.createdAt,
      },
      eventType: ev,
    },
  }
}

export function sign(secret: string, timestamp: string, body: string) {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

/** Eine Zustellung. Wirft bei Fehler, damit die Warteschlange es später erneut versucht. */
export async function deliverWebhook(p: { webhookId: string; event: string; bookingId: string | null; deliveryId: string; occurredAt: string }, attempt: number) {
  const w = await db.query.webhooks.findFirst({ where: eq(webhooks.id, p.webhookId) })
  if (!w || !w.active) return { ok: true, skipped: true }
  const payload = await payloadFor(p.event, p.bookingId, p.deliveryId, p.occurredAt)
  if (!payload) return { ok: true, skipped: true }
  const body = JSON.stringify(payload)
  const ts = Math.floor(Date.now() / 1000).toString()
  let statusCode: number | null = null
  let error: string | null = null
  try {
    const res = await safeFetch(w.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'termind-webhooks/0.1',
        'x-termind-event': p.event,
        'x-termind-delivery': p.deliveryId,
        'x-termind-timestamp': ts,
        'x-termind-signature': sign(decrypt(w.secretEnc), ts, body),
      },
      body,
      signal: AbortSignal.timeout(5_000),
    })
    statusCode = res.status
    await res.body?.cancel().catch(() => {})
    if (!res.ok) error = `HTTP ${res.status}`
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 200)
  }
  await db.insert(webhookDeliveries).values({ id: newId(), webhookId: w.id, event: p.event, statusCode, ok: !error, error, attempt })
  // Nur die letzten 100 Zustellungen je Webhook behalten
  const old = await db.query.webhookDeliveries.findMany({ where: eq(webhookDeliveries.webhookId, w.id), orderBy: desc(webhookDeliveries.createdAt), offset: 100, columns: { id: true } })
  if (old.length) await db.delete(webhookDeliveries).where(inArray(webhookDeliveries.id, old.map((o) => o.id)))
  if (error) throw new Error(`Webhook ${w.url}: ${error}`)
  return { ok: true, statusCode }
}

export async function testWebhook(actor: Actor, id: string) {
  const a = requireWrite(actor)
  await ownHook(a.userId, id)
  try {
    const r = await deliverWebhook({ webhookId: id, event: 'ping', bookingId: null, deliveryId: newId(), occurredAt: nowIso() }, 1)
    return { ok: true, statusCode: 'statusCode' in r ? r.statusCode : null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function purgeOldDeliveries() {
  await db.delete(webhookDeliveries).where(lt(webhookDeliveries.createdAt, new Date(Date.now() - 30 * 86_400_000).toISOString()))
}
