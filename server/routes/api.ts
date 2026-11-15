import { v } from '../lib/validate'
import { Hono } from 'hono'
import { z } from 'zod'
import { brandingSchema, cancelSchema, exceptionSchema, profileSchema, rescheduleSchema, scheduleUpdateSchema, smtpCheckSchema, smtpSchema } from '../../shared/schemas'
import { requireOwner } from '../lib/actor'
import { mailQueueStatus, retryFailedMails } from '../mail/queue'
import { checkSmtpConnection, sendTestMail } from '../mail/transport'
import { hit } from '../lib/rateLimit'
import { AppError } from '../lib/errors'
import { getOnboarding, setOnboardingHidden } from '../services/onboarding'
import { listAudit } from '../services/audit'
import * as calendars from '../services/calendars'
import * as oauth from '../services/oauth'
import * as webhooks from '../services/webhooks'
import * as privacy from '../services/privacy'
import { getMailTexts, previewMail, setMailText } from '../services/mailTexts'
import * as auth from '../services/auth'
import * as bookings from '../services/bookings'
import * as eventTypes from '../services/eventTypes'
import * as schedules from '../services/schedules'
import { getSetting, publicSmtp, updateBranding, updateSmtp } from '../services/settings'
import { me, updateProfile } from '../services/users'
import { getCookie } from 'hono/cookie'
import { type Env, requireLogin, SESSION_COOKIE } from './context'

/** Der geheime Verwaltungslink des Gastes verlässt den Server nie über die API. */
const hideSecrets = <T extends { manageToken?: string; calendarRef?: unknown }>(b: T) => {
  const { manageToken: _m, calendarRef: _c, ...rest } = b
  return rest
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const apiRoutes = new Hono<Env>()
  .use(requireLogin)
  /* Profil */
  .get('/me', async (c) => c.json(await me(c.get('actor'))))
  .patch('/me', v('json', profileSchema), async (c) => c.json(await updateProfile(c.get('actor'), c.req.valid('json'))))

  /* Terminseiten */
  .get('/event-types', async (c) => c.json(await eventTypes.listEventTypes(c.get('actor'))))
  .post('/event-types', async (c) => c.json(await eventTypes.createEventType(c.get('actor'), await c.req.json()), 201))
  .get('/event-types/:id', async (c) => c.json(await eventTypes.getEventType(c.get('actor'), c.req.param('id'))))
  .patch('/event-types/:id', async (c) => c.json(await eventTypes.updateEventType(c.get('actor'), c.req.param('id'), await c.req.json())))
  .delete('/event-types/:id', async (c) => c.json(await eventTypes.deleteEventType(c.get('actor'), c.req.param('id'))))
  .get('/event-types/:id/slots', v('query', z.object({ from: date, to: date, tz: z.string() })), async (c) => {
    const e = await eventTypes.getEventType(c.get('actor'), c.req.param('id'))
    const { from, to, tz } = c.req.valid('query')
    return c.json({ slots: await bookings.getSlots(e, from, to, tz) })
  })

  /* Verfügbarkeit */
  .get('/schedule', async (c) => c.json(await schedules.getSchedule(c.get('actor'))))
  .patch('/schedule', v('json', scheduleUpdateSchema), async (c) => c.json(await schedules.updateSchedule(c.get('actor'), c.req.valid('json'))))
  .post('/schedule/exceptions', v('json', exceptionSchema), async (c) => c.json(await schedules.addException(c.get('actor'), c.req.valid('json')), 201))
  .delete('/schedule/exceptions/:id', async (c) => {
    await schedules.deleteException(c.get('actor'), c.req.param('id'))
    return c.json({ ok: true })
  })

  /* Termine */
  .get('/bookings', v('query', z.object({ view: z.enum(['upcoming', 'pending', 'past', 'all']).optional(), q: z.string().max(100).optional() })), async (c) =>
    c.json((await bookings.listBookings(c.get('actor'), c.req.valid('query'))).map(hideSecrets)),
  )
  .post('/bookings', async (c) => c.json(hideSecrets(await bookings.createBooking(c.get('actor'), await c.req.json())), 201))
  .get('/bookings/:id', async (c) => c.json(hideSecrets(await bookings.getBooking(c.get('actor'), c.req.param('id')))))
  .patch('/bookings/:id', v('json', z.object({ note: z.string().max(4000) })), async (c) =>
    c.json(hideSecrets(await bookings.updateBookingNote(c.get('actor'), c.req.param('id'), c.req.valid('json').note))),
  )
  .post('/bookings/:id/cancel', v('json', cancelSchema), async (c) => c.json(hideSecrets(await bookings.cancelBooking(c.get('actor'), c.req.param('id'), c.req.valid('json').reason))))
  .post('/bookings/:id/accept', async (c) => c.json(hideSecrets(await bookings.acceptBooking(c.get('actor'), c.req.param('id')))))
  .post('/bookings/:id/reschedule', v('json', rescheduleSchema), async (c) => {
    const { start, reason } = c.req.valid('json')
    return c.json(hideSecrets(await bookings.rescheduleBooking(c.get('actor'), c.req.param('id'), start, reason)))
  })

  /* Einstellungen */
  .get('/settings', async (c) => {
    requireOwner(c.get('actor'))
    return c.json({ branding: await getSetting('branding'), smtp: publicSmtp(await getSetting('smtp')), mail: await mailQueueStatus(), lastSmtpOk: (await getSetting('lastSmtpOk')) || null })
  })
  .put('/settings/branding', v('json', brandingSchema), async (c) => c.json(await updateBranding(c.get('actor'), c.req.valid('json'))))
  .put('/settings/smtp', v('json', smtpSchema), async (c) => c.json(await updateSmtp(c.get('actor'), c.req.valid('json'))))
  .post('/settings/smtp/test', v('json', z.object({ to: z.email() })), async (c) => {
    requireOwner(c.get('actor'))
    await sendTestMail(c.req.valid('json').to)
    return c.json({ ok: true })
  })
  /* Verbindung mit den Werten aus dem Formular prüfen (nichts wird gespeichert, keine Mail verschickt) */
  .post('/settings/smtp/check', v('json', smtpCheckSchema), async (c) => {
    const a = requireOwner(c.get('actor'))
    if (!hit(`smtp-check:${a.userId}`, 10, 10 * 60_000)) throw new AppError('rate_limited', 'Zu viele Tests. Bitte warte ein paar Minuten.')
    await checkSmtpConnection(c.req.valid('json'))
    return c.json({ ok: true })
  })
  .post('/settings/mail/retry', async (c) => {
    requireOwner(c.get('actor'))
    await retryFailedMails()
    return c.json({ ok: true })
  })

  /* Checkliste „Erste Schritte“ */
  .get('/onboarding', async (c) => c.json(await getOnboarding(c.get('actor'))))
  .put('/onboarding', v('json', z.object({ hidden: z.boolean().optional(), doneDismissed: z.boolean().optional() })), async (c) => c.json(await setOnboardingHidden(c.get('actor'), c.req.valid('json'))))

  /* Mail-Texte */
  .get('/settings/mail-texts', async (c) => c.json(await getMailTexts(c.get('actor'))))
  .put('/settings/mail-texts/:template/:locale', async (c) => c.json(await setMailText(c.get('actor'), c.req.param('template'), c.req.param('locale'), await c.req.json())))
  .delete('/settings/mail-texts/:template/:locale', async (c) => c.json(await setMailText(c.get('actor'), c.req.param('template'), c.req.param('locale'), null)))
  .post('/settings/mail-texts/:template/:locale/preview', async (c) => c.json(await previewMail(c.get('actor'), c.req.param('template'), c.req.param('locale'), await c.req.json())))

  /* OAuth-Zustimmung & Connectors */
  .get('/oauth/requests/:id', async (c) => c.json(await oauth.describeRequest(c.get('actor'), c.req.param('id'))))
  .post('/oauth/requests/:id/decision', v('json', z.object({ approve: z.boolean(), scope: z.enum(['read', 'write']).optional() })), async (c) => {
    const { approve, scope } = c.req.valid('json')
    return c.json(await oauth.decide(c.get('actor'), c.req.param('id'), approve, scope))
  })
  .get('/oauth/grants', async (c) => c.json(await oauth.listGrants(c.get('actor'))))
  .delete('/oauth/grants/:id', async (c) => {
    await oauth.revokeGrant(c.get('actor'), c.req.param('id'))
    return c.json({ ok: true })
  })

  /* Datenschutz */
  .get('/privacy', async (c) => c.json(await privacy.getPrivacySettings(c.get('actor'))))
  .put('/privacy', v('json', z.object({ retentionMonths: z.number().int() })), async (c) => c.json(await privacy.setRetention(c.get('actor'), c.req.valid('json').retentionMonths)))
  .post('/privacy/export', v('json', z.object({ email: z.string().max(200) })), async (c) => c.json(await privacy.exportPersonalData(c.get('actor'), c.req.valid('json').email)))
  .post('/privacy/erase', v('json', z.object({ email: z.string().max(200) })), async (c) => c.json(await privacy.erasePersonalData(c.get('actor'), c.req.valid('json').email)))

  /* Webhooks */
  .get('/webhooks', async (c) => c.json(await webhooks.listWebhooks(c.get('actor'))))
  .post('/webhooks', async (c) => c.json(await webhooks.createWebhook(c.get('actor'), await c.req.json()), 201))
  .patch('/webhooks/:id', async (c) => c.json(await webhooks.updateWebhook(c.get('actor'), c.req.param('id'), await c.req.json())))
  .post('/webhooks/:id/test', async (c) => c.json(await webhooks.testWebhook(c.get('actor'), c.req.param('id'))))
  .delete('/webhooks/:id', async (c) => {
    await webhooks.deleteWebhook(c.get('actor'), c.req.param('id'))
    return c.json({ ok: true })
  })

  /* Kalender */
  .get('/calendars', async (c) => c.json(await calendars.listConnections(c.get('actor'))))
  .post('/calendars/caldav', async (c) => c.json(await calendars.addCaldav(c.get('actor'), await c.req.json()), 201))
  .post('/calendars/ics', async (c) => c.json(await calendars.addIcs(c.get('actor'), await c.req.json()), 201))
  .patch('/calendars/:id', async (c) => c.json(await calendars.updateConnection(c.get('actor'), c.req.param('id'), await c.req.json())))
  .post('/calendars/:id/sync', async (c) => c.json(await calendars.syncNow(c.get('actor'), c.req.param('id'))))
  .delete('/calendars/:id', async (c) => {
    await calendars.deleteConnection(c.get('actor'), c.req.param('id'))
    return c.json({ ok: true })
  })

  /* Sicherheit */
  .post('/security/password', v('json', z.object({ current: z.string().max(200), next: z.string().max(200) })), async (c) => {
    const { current, next } = c.req.valid('json')
    await auth.changePassword(c.get('actor'), current, next, getCookie(c, SESSION_COOKIE))
    return c.json({ ok: true })
  })
  .post('/security/logout-others', async (c) => {
    await auth.logoutOthers(c.get('actor'), getCookie(c, SESSION_COOKIE))
    return c.json({ ok: true })
  })
  .post('/security/totp/start', async (c) => c.json(await auth.startTotpSetup(c.get('actor'))))
  .post('/security/totp/confirm', v('json', z.object({ code: z.string() })), async (c) => c.json({ ok: true, ...(await auth.confirmTotpSetup(c.get('actor'), c.req.valid('json').code)) }))
  .get('/security/backup-codes', async (c) => c.json(await auth.backupCodeStatus(c.get('actor'))))
  .post('/security/backup-codes', v('json', z.object({ password: z.string().max(200) })), async (c) => c.json(await auth.regenerateBackupCodes(c.get('actor'), c.req.valid('json').password)))
  .post('/security/totp/disable', v('json', z.object({ password: z.string() })), async (c) => {
    await auth.disableTotp(c.get('actor'), c.req.valid('json').password)
    return c.json({ ok: true })
  })
  .get('/passkeys', async (c) => c.json(await auth.listPasskeys(c.get('actor'))))
  .post('/passkeys/options', async (c) => c.json(await auth.passkeyRegistrationOptions(c.get('actor'))))
  .post('/passkeys', v('json', z.object({ challengeId: z.string(), response: z.any(), name: z.string().max(80).optional() })), async (c) => {
    const { challengeId, response, name } = c.req.valid('json')
    return c.json(await auth.passkeyRegister(c.get('actor'), challengeId, response, name), 201)
  })
  .delete('/passkeys/:id', async (c) => {
    await auth.deletePasskey(c.get('actor'), c.req.param('id'))
    return c.json({ ok: true })
  })

  /* API-Schlüssel & Protokoll */
  .get('/tokens', async (c) => c.json(await auth.listApiTokens(c.get('actor'))))
  .post('/tokens', v('json', z.object({ name: z.string().min(1).max(80), scope: z.enum(['read', 'write']) })), async (c) => {
    const { name, scope } = c.req.valid('json')
    return c.json(await auth.createApiToken(c.get('actor'), name, scope), 201)
  })
  .delete('/tokens/:id', async (c) => {
    await auth.revokeApiToken(c.get('actor'), c.req.param('id'))
    return c.json({ ok: true })
  })
  .get('/audit', async (c) => {
    requireOwner(c.get('actor'))
    return c.json(await listAudit(200))
  })
