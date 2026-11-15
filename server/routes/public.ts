import { v } from '../lib/validate'
import { Hono } from 'hono'
import { z } from 'zod'
import { cancelSchema, rescheduleSchema } from '../../shared/schemas'
import { db } from '../db/client'
import { AppError, notFound } from '../lib/errors'
import { hit } from '../lib/rateLimit'
import { renderMail } from '../mail/templates'
import { createBooking, getBookingByToken, getSlots, guestCancel, guestReschedule, publicBooking } from '../services/bookings'
import { findPublicEventType, listPublicEventTypes, toPublicEventType } from '../services/eventTypes'
import { getSetting } from '../services/settings'
import { getUserByHandle } from '../services/users'
import { clientIp, type Env } from './context'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const slotQuery = z.object({ from: date, to: date, tz: z.string().min(1).max(64) })
const locale = (c: { req: { query: (k: string) => string | undefined } }) => (c.req.query('lang') === 'en' ? 'en' : 'de')

const publicHost = (u: NonNullable<Awaited<ReturnType<typeof getUserByHandle>>>) => ({ name: u.name, handle: u.handle, subtitle: u.subtitle, timezone: u.timezone })

export const publicRoutes = new Hono<Env>()
  .get('/instance', async (c) => {
    return c.json({ setupComplete: await getSetting('setupComplete'), branding: await getSetting('branding') })
  })
  .get('/u/:handle', async (c) => {
    const u = await getUserByHandle(c.req.param('handle'))
    if (!u) throw notFound('Seite')
    const events = await listPublicEventTypes(u.id)
    return c.json({ host: publicHost(u), eventTypes: events.map((e) => toPublicEventType(e, locale(c))) })
  })
  .get('/u/:handle/:slug', async (c) => {
    const u = await getUserByHandle(c.req.param('handle'))
    if (!u) throw notFound('Seite')
    const e = await findPublicEventType(u.id, c.req.param('slug'))
    return c.json({ host: publicHost(u), eventType: toPublicEventType(e, locale(c)) })
  })
  .get('/event-types/:id/slots', v('query', slotQuery), async (c) => {
    if (!hit(`slots:${clientIp(c)}`, 120, 60_000)) throw new AppError('rate_limited', 'Zu viele Anfragen. Bitte kurz warten.')
    const { from, to, tz } = c.req.valid('query')
    const e = await db.query.eventTypes.findFirst({ where: (t, { eq, and }) => and(eq(t.id, c.req.param('id')), eq(t.active, true)) })
    if (!e) throw notFound('Terminseite')
    return c.json({ slots: await getSlots(e, from, to, tz) })
  })
  .post('/bookings', async (c) => {
    const ip = clientIp(c)
    if (!hit(`book:${ip}`, 12, 60 * 60_000)) throw new AppError('rate_limited', 'Zu viele Buchungen in kurzer Zeit. Bitte versuch es später noch einmal.')
    const b = await createBooking({ type: 'guest' }, await c.req.json())
    return c.json({ manageToken: b.manageToken, status: b.status }, 201)
  })
  .get('/b/:token', async (c) => {
    if (!hit(`manage:${clientIp(c)}`, 60, 60_000)) throw new AppError('rate_limited', 'Zu viele Anfragen.')
    const { booking, eventType, host } = await getBookingByToken(c.req.param('token'))
    return c.json({ booking: publicBooking(booking, eventType), host: publicHost(host), eventType: toPublicEventType(eventType, booking.locale) })
  })
  .get('/b/:token/slots', v('query', slotQuery), async (c) => {
    if (!hit(`slots:${clientIp(c)}`, 120, 60_000)) throw new AppError('rate_limited', 'Zu viele Anfragen. Bitte kurz warten.')
    const { from, to, tz } = c.req.valid('query')
    const { booking, eventType } = await getBookingByToken(c.req.param('token'))
    return c.json({ slots: await getSlots(eventType, from, to, tz, booking.id) })
  })
  .post('/b/:token/cancel', v('json', cancelSchema), async (c) => {
    if (!hit(`cancel:${clientIp(c)}`, 20, 60 * 60_000)) throw new AppError('rate_limited', 'Zu viele Anfragen.')
    await guestCancel(c.req.param('token'), c.req.valid('json').reason)
    return c.json({ ok: true })
  })
  .post('/b/:token/reschedule', v('json', rescheduleSchema), async (c) => {
    if (!hit(`move:${clientIp(c)}`, 10, 60 * 60_000) || !hit(`move-token:${c.req.param('token')}`, 5, 60 * 60_000)) throw new AppError('rate_limited', 'Zu viele Änderungen. Bitte später noch einmal.')
    await guestReschedule(c.req.param('token'), c.req.valid('json').start)
    return c.json({ ok: true })
  })
  .get('/b/:token/ics', async (c) => {
    const { booking, eventType, host } = await getBookingByToken(c.req.param('token'))
    if (booking.status !== 'confirmed') throw notFound('Kalendereintrag')
    const m = renderMail('guest.confirmed', { booking, event: eventType, host, branding: await getSetting('branding') })
    return c.body(m.ics!.content, 200, {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="termin.ics"`,
    })
  })

