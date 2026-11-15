import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Actor } from '../lib/actor'
import { AppError } from '../lib/errors'
import { actorFromApiToken, actorFromSession } from '../services/auth'
import { actorFromOAuth } from '../services/oauth'

export const SESSION_COOKIE = 'termind_session'

export type Env = { Variables: { actor: Actor } }

/** IPv6-Adressen auf das /64-Netz kürzen: ein Angreifer hat meist ein ganzes /64. */
function bucketIp(ip: string) {
  const v = ip.replace(/^::ffff:/i, '')
  if (!v.includes(':')) return v
  const parts = v.split('::')
  const head = parts[0].split(':').filter(Boolean)
  const tail = parts.length > 1 ? parts[1].split(':').filter(Boolean) : []
  const full = [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail]
  return full.slice(0, 4).join(':') + '::/64'
}

export function clientIp(c: Context) {
  // Nur hinter einem eigenen Reverse-Proxy (Caddy) vertrauen, sonst wäre die IP fälschbar.
  // Genommen wird der letzte Eintrag: den hat der eigene Proxy gesetzt.
  const fwd = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()
  if (fwd && process.env.TRUST_PROXY === 'true') return bucketIp(fwd.slice(0, 64))
  try {
    return bucketIp(getConnInfo(c).remote.address ?? 'unknown')
  } catch {
    return 'unknown'
  }
}

/**
 * Oberfläche und REST-API (/api): nur die Sitzung per Cookie. API-Schlüssel und OAuth-Tokens
 * gelten bewusst nicht hier, sondern ausschließlich am MCP-Endpunkt mit seinen Rückfragen.
 */
export const resolveSessionActor: MiddlewareHandler<Env> = async (c, next) => {
  c.set('actor', (await actorFromSession(getCookie(c, SESSION_COOKIE))) ?? { type: 'guest' as const })
  await next()
}

/** MCP (/mcp): nur Bearer-Token (API-Schlüssel tmd_… oder OAuth tmo_…), keine Cookies. */
export const resolveTokenActor: MiddlewareHandler<Env> = async (c, next) => {
  const auth = c.req.header('authorization')
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : undefined
  const actor = bearer && bearer.length < 200 ? ((await actorFromApiToken(bearer)) ?? (await actorFromOAuth(bearer))) : null
  c.set('actor', actor ?? { type: 'guest' as const })
  await next()
}

export const requireLogin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get('actor').type === 'guest') throw new AppError('unauthorized', 'Bitte melde dich an.')
  await next()
}
