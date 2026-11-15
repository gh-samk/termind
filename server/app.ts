import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ZodError } from 'zod'
import { firstMessage } from './lib/validate'
import { config } from './config'
import { EMBED_JS } from './embed'
import { RESERVED_HANDLES } from './lib/util'
import { AppError } from './lib/errors'
import { handleMcp } from './mcp/server'
import { apiRoutes } from './routes/api'
import { authRoutes } from './routes/auth'
import { type Env, resolveSessionActor, resolveTokenActor } from './routes/context'
import { bodyLimit } from 'hono/body-limit'
import { oauthRoutes, wellKnownRoutes } from './routes/oauth'
import { publicRoutes } from './routes/public'
import { cors } from 'hono/cors'

export function createApp() {
  const app = new Hono<Env>()

  /* Buchungsseiten dürfen auf fremden Webseiten eingebettet werden, der Admin-Bereich nicht. */
  app.use('*', async (c, next) => {
    await next()
    const p = c.req.path
    if (p === '/embed.js') {
      c.res.headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
      return
    }
    // Nur echte Buchungsseiten (/:handle, /:handle/:slug, /b/:token) dürfen eingebettet werden
    const segs = p.split('/').filter(Boolean)
    const embeddable =
      !p.includes('//') &&
      !p.includes('\\') &&
      segs.length >= 1 &&
      segs.length <= 2 &&
      (segs[0] === 'b'
        ? segs.length === 2 && /^[A-Za-z0-9_-]+$/.test(segs[1])
        : segs.every((s) => /^[a-z0-9-]+$/.test(s)) && !RESERVED_HANDLES.has(segs[0]))
    if (embeddable && c.res.headers.get('content-type')?.includes('text/html')) {
      c.res.headers.delete('X-Frame-Options')
      const csp = c.res.headers.get('Content-Security-Policy')
      if (csp) c.res.headers.set('Content-Security-Policy', csp.replace(/frame-ancestors [^;]+/, 'frame-ancestors *'))
    }
  })

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'self'"], // Buchungsseiten werden oben freigegeben
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
      crossOriginEmbedderPolicy: false,
    }),
  )

  app.get('/healthz', (c) => c.json({ ok: true }))
  app.get('/embed.js', (c) => c.body(EMBED_JS, 200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600' }))

  /* Größe von Anfragen begrenzen, damit niemand den kleinen Server mit riesigen Bodies lahmlegt */
  app.use(
    '*',
    bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: { code: 'too_large', message: 'Anfrage zu groß.' } }, 413) }),
  )

  /* Schutz vor CSRF: schreibende Anfragen an /api müssen von der eigenen Seite kommen. */
  app.use('/api/*', async (c, next) => {
    const m = c.req.method
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
      const origin = c.req.header('origin') ?? c.req.header('referer')
      let ok = false
      try {
        const allowed = [new URL(config.publicUrl).origin, new URL(c.req.url).origin]
        ok = !!origin && allowed.includes(new URL(origin).origin)
      } catch {
        ok = false
      }
      if (!ok) return c.json({ error: { code: 'forbidden', message: 'Anfrage von fremder Seite abgelehnt.' } }, 403)
    }
    await next()
  })

  app.use('/api/*', resolveSessionActor)
  app.use('/mcp', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Protocol-Version', 'Mcp-Session-Id', 'Last-Event-ID'], exposeHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'], maxAge: 86400 }))
  app.use('/mcp', resolveTokenActor)
  app.route('/.well-known', wellKnownRoutes)
  app.route('/oauth', oauthRoutes)
  app.route('/api/public', publicRoutes)
  app.route('/api/auth', authRoutes)
  app.route('/api', apiRoutes)
  app.all('/mcp', (c) => handleMcp(c.req.raw, c.get('actor')))

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400)
    if (err instanceof ZodError) {
      return c.json({ error: { code: 'invalid', message: firstMessage(err), issues: err.issues } }, 400)
    }
    if (err instanceof HTTPException) {
      // Ausnahmen mit eigener Antwort (z. B. aus Middleware) unverändert durchreichen
      if (err.res) return err.getResponse()
      const message = err.status === 400 ? 'Ungültiges JSON.' : err.status === 413 ? 'Anfrage zu groß.' : err.status === 401 || err.status === 403 ? 'Kein Zugriff.' : 'Anfrage konnte nicht verarbeitet werden.'
      return c.json({ error: { code: err.status === 400 ? 'invalid' : 'error', message } }, err.status)
    }
    if (err instanceof SyntaxError) return c.json({ error: { code: 'invalid', message: 'Ungültiges JSON.' } }, 400)
    console.error(err)
    return c.json({ error: { code: 'internal', message: 'Da ist etwas schiefgelaufen.' } }, 500)
  })

  /* Web-App ausliefern (Produktion). In der Entwicklung macht das Vite. */
  if (existsSync(join(config.webDir, 'index.html'))) {
    const root = relative(process.cwd(), config.webDir) || '.'
    const indexHtml = readFileSync(join(config.webDir, 'index.html'), 'utf8')
    app.use('/assets/*', serveStatic({ root, onFound: (_p, c) => c.header('cache-control', 'public, max-age=31536000, immutable') }))
    app.use('*', serveStatic({ root }))
    app.get('*', (c) => {
      if (c.req.path.startsWith('/api/')) return c.json({ error: { code: 'not_found', message: 'Unbekannter Endpunkt.' } }, 404)
      return c.html(indexHtml)
    })
  }

  return app
}
