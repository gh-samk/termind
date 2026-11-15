import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AppError } from '../lib/errors'
import { hit } from '../lib/rateLimit'
import { authorizationServerMetadata, OAuthError, protectedResourceMetadata, registerClient, revokeToken, startAuthorization, token } from '../services/oauth'
import { clientIp, type Env } from './context'

const corsAll = cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Protocol-Version'], maxAge: 86400 })

const oauthError = (e: unknown) => {
  if (e instanceof OAuthError) return { body: { error: e.error, error_description: e.description }, status: e.status }
  if (e instanceof AppError) return { body: { error: e.code === 'rate_limited' ? 'slow_down' : 'invalid_request', error_description: e.message }, status: e.status }
  console.error('[oauth]', e)
  return { body: { error: 'server_error', error_description: 'Interner Fehler.' }, status: 500 }
}

/** Metadaten unter /.well-known (RFC 8414, RFC 9728). */
export const wellKnownRoutes = new Hono<Env>()
  .use('*', corsAll)
  .get('/oauth-authorization-server', (c) => c.json(authorizationServerMetadata()))
  .get('/oauth-authorization-server/*', (c) => c.json(authorizationServerMetadata()))
  .get('/openid-configuration', (c) => c.json(authorizationServerMetadata()))
  .get('/oauth-protected-resource', (c) => c.json(protectedResourceMetadata()))
  .get('/oauth-protected-resource/*', (c) => c.json(protectedResourceMetadata()))

export const oauthRoutes = new Hono<Env>()
  .use('/register', corsAll)
  .use('/token', corsAll)
  .use('/revoke', corsAll)
  .post('/register', async (c) => {
    try {
      if (!hit(`dcr:${clientIp(c)}`, 20, 60 * 60_000)) throw new AppError('rate_limited', 'Zu viele Registrierungen.')
      return c.json(await registerClient(await c.req.json().catch(() => ({}))), 201)
    } catch (e) {
      const r = oauthError(e)
      return c.json(r.body, r.status as 400)
    }
  })
  .get('/authorize', async (c) => {
    if (!hit(`authorize:${clientIp(c)}`, 30, 10 * 60_000)) return c.text('Zu viele Anfragen. Bitte später noch einmal.', 429)
    const q = c.req.query()
    if (Object.values(q).some((v) => typeof v === 'string' && v.length > 2000)) return c.text('Anfrage zu lang.', 400)
    const r = await startAuthorization(q)
    if ('error' in r) {
      return c.html(
        `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Verbindung nicht möglich</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 20px;color:#26231f"><h1 style="font-size:22px">Verbindung nicht möglich</h1><p>${r.error.replace(/</g, '&lt;')}</p></body></html>`,
        400,
      )
    }
    return c.redirect(r.redirect, 302)
  })
  .post('/token', async (c) => {
    c.header('Cache-Control', 'no-store')
    try {
      if (!hit(`token:${clientIp(c)}`, 60, 60_000)) throw new AppError('rate_limited', 'Zu viele Anfragen.')
      const body = await c.req.parseBody()
      const form = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
      return c.json(await token(form))
    } catch (e) {
      const r = oauthError(e)
      return c.json(r.body, r.status as 400)
    }
  })
  .post('/revoke', async (c) => {
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
    if (typeof body.token === 'string') await revokeToken(body.token)
    return c.body(null, 200)
  })
