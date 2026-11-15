import { v } from '../lib/validate'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { setupSchema } from '../../shared/schemas'
import { config } from '../config'
import { AppError } from '../lib/errors'
import { hit } from '../lib/rateLimit'
import * as auth from '../services/auth'
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
  .post('/setup', v('json', setupSchema.extend({ setupToken: z.string().max(200).default('') })), async (c) => {
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
  .post('/second-factor', v('json', z.object({ code: z.string().min(6).max(10) })), async (c) => {
    setSession(c, await auth.verifySecondFactor(getCookie(c, SESSION_COOKIE), c.req.valid('json').code, clientIp(c)))
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
