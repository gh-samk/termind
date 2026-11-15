import { v } from '../lib/validate'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { passwordResetConfirmSchema, passwordResetRequestSchema, setupSchema } from '../../shared/schemas'
import { config } from '../config'
import { AppError } from '../lib/errors'
import { hit } from '../lib/rateLimit'
import * as auth from '../services/auth'
import * as recovery from '../services/recovery'
import { me } from '../services/users'
import { clientIp, type Env, SESSION_COOKIE } from './context'

function setSession(c: Context, s: { token: string; expiresAt: string }) {
  setCookie(c, SESSION_COOKIE, s.token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.publicUrl.startsWith('https://'),
    path: '/',
    expires: new Date(s.expiresAt),
  })
}

export const authRoutes = new Hono<Env>()
  .get('/state', async (c) => {
    const setupComplete = await auth.isSetupComplete()
    const actor = c.get('actor')
    const session = await auth.sessionFromToken(getCookie(c, SESSION_COOKIE))
    return c.json({
      setupComplete,
      user: actor.type === 'user' ? await me(actor) : null,
      pendingSecondFactor: !!session?.pendingSecondFactor,
    })
  })
  /* Einrichtungscode früh prüfen, bevor das Formular ausgefüllt wird (ändert nichts) */
  .post('/setup/check', v('json', z.object({ token: z.string().min(1).max(200) })), async (c) => {
    if (!hit(`setup-check:${clientIp(c)}`, 30, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
    return c.json(await auth.checkSetupToken(c.req.valid('json').token))
  })
  .post('/setup', v('json', setupSchema.extend({ setupToken: z.string().min(1, 'Der Einrichtungscode fehlt.').max(200) })), async (c) => {
    if (!hit(`setup:${clientIp(c)}`, 10, 60 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche.')
    const { setupToken, ...input } = c.req.valid('json')
    setSession(c, await auth.runSetup(input, setupToken, c.req.header('user-agent')))
    return c.json({ ok: true })
  })
  .post('/login', v('json', z.object({ email: z.string().max(254), password: z.string().max(200) })), async (c) => {
    const { email, password } = c.req.valid('json')
    const s = await auth.login(email, password, clientIp(c), c.req.header('user-agent'))
    setSession(c, s)
    return c.json({ needsSecondFactor: s.pendingSecondFactor })
  })
  .post('/second-factor', v('json', z.object({ code: z.string().min(6).max(20), backup: z.boolean().optional() })), async (c) => {
    const { code, backup } = c.req.valid('json')
    setSession(c, await auth.verifySecondFactor(getCookie(c, SESSION_COOKIE), code, clientIp(c), !!backup))
    return c.json({ ok: true })
  })
  /* Passwort vergessen: Antwort immer gleich, egal ob es das Konto gibt */
  .post('/password-reset/request', v('json', passwordResetRequestSchema), async (c) => {
    await recovery.requestPasswordReset(c.req.valid('json').email, clientIp(c))
    return c.json({ ok: true })
  })
  .post('/password-reset/check', v('json', z.object({ token: z.string().max(200) })), async (c) => {
    if (!hit(`pwreset-check:${clientIp(c)}`, 30, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
    return c.json({ ok: await recovery.isResetTokenValid(c.req.valid('json').token) })
  })
  .post('/password-reset/confirm', v('json', passwordResetConfirmSchema), async (c) => {
    const { token, password } = c.req.valid('json')
    await recovery.resetPassword(token, password, clientIp(c))
    return c.json({ ok: true })
  })
  .post('/logout', async (c) => {
    await auth.logout(getCookie(c, SESSION_COOKIE))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })
  .post('/passkey/options', async (c) => {
    if (!hit(`pk:${clientIp(c)}`, 30, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche.')
    return c.json(await auth.passkeyLoginOptions())
  })
  .post('/passkey/verify', v('json', z.object({ challengeId: z.string().max(100), response: z.any() })), async (c) => {
    if (!hit(`pk:${clientIp(c)}`, 30, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche.')
    const { challengeId, response } = c.req.valid('json')
    setSession(c, await auth.passkeyLogin(challengeId, response, c.req.header('user-agent')))
    return c.json({ ok: true })
  })
