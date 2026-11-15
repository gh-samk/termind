import { createHash, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { config } from '../config'
import { db } from '../db/client'
import { oauthClients, oauthCodes, oauthGrants, users } from '../db/schema'
import { type Actor, requireHost } from '../lib/actor'
import { AppError, notFound } from '../lib/errors'
import { fetchText } from '../lib/safeFetch'
import { newId, nowIso, randomToken, sha256 } from '../lib/util'
import { audit } from './audit'
import { getSetting } from './settings'

/**
 * OAuth 2.1 Authorization Server für MCP-Connectors (Web-Assistenten, Apps, ChatGPT …).
 * Öffentliche Clients mit PKCE (S256), Dynamic Client Registration (RFC 7591),
 * Client-ID-Metadatendokumente, Protected Resource Metadata (RFC 9728), Resource Indicators (RFC 8707).
 */

export const issuer = () => config.publicUrl
export const mcpResource = () => `${config.publicUrl}/mcp`
const ACCESS_TTL = 60 * 60 // Sekunden
const REFRESH_TTL = 60 * 86_400

export class OAuthError extends Error {
  constructor(
    public error: string,
    public description: string,
    public status = 400,
  ) {
    super(description)
  }
}

export function authorizationServerMetadata() {
  const i = issuer()
  return {
    issuer: i,
    authorization_endpoint: `${i}/oauth/authorize`,
    token_endpoint: `${i}/oauth/token`,
    registration_endpoint: `${i}/oauth/register`,
    revocation_endpoint: `${i}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['termind:read', 'termind:write'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: ['termind:read', 'termind:write'],
    bearer_methods_supported: ['header'],
    resource_name: 'termind',
  }
}

/* ---------------- Clients ---------------- */

function validRedirect(uri: string) {
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.hash || u.username || u.password) return false
  if (u.protocol === 'https:') return true
  // Native Apps (RFC 8252): Loopback über http
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return true
  // Private URI-Schemes von Desktop-Apps (z. B. cursor://), aber keine gefährlichen Schemes
  return /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/i.test(u.protocol) || /^(cursor|vscode|chatgpt):$/i.test(u.protocol)
}

const registerSchema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

export async function registerClient(raw: unknown) {
  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) throw new OAuthError('invalid_client_metadata', 'Ungültige Client-Metadaten.')
  const b = parsed.data
  if (b.token_endpoint_auth_method && b.token_endpoint_auth_method !== 'none') throw new OAuthError('invalid_client_metadata', 'Nur öffentliche Clients (token_endpoint_auth_method "none") werden unterstützt.')
  if (!b.redirect_uris.every(validRedirect)) throw new OAuthError('invalid_redirect_uri', 'Ungültige redirect_uri.')
  const id = `tmc_${randomToken(18)}`
  const name = (b.client_name ?? 'KI-Client').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 100) || 'KI-Client'
  await db.insert(oauthClients).values({ id, name, redirectUris: b.redirect_uris, kind: 'dcr' })
  return {
    client_id: id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: b.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }
}

/** Client laden; https-client_id = Client-ID-Metadatendokument (wird geladen und zwischengespeichert). */
async function resolveClient(clientId: string) {
  const known = await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, clientId) })
  const fresh = known && (known.kind === 'dcr' || Date.now() - Date.parse(known.lastUsedAt ?? known.createdAt) < 86_400_000)
  if (fresh) return known
  if (!/^https:\/\//.test(clientId) || clientId.length > 500) return null
  const failedUntil = cimdFailures.get(clientId)
  if (failedUntil && failedUntil > Date.now()) return known ?? null
  try {
    // Anonym auslösbar: daher immer nur öffentliche Adressen, egal was ALLOW_PRIVATE_HOSTS sagt
    const doc = JSON.parse(await fetchText(clientId, 64 * 1024, { accept: 'application/json' }, { forcePublic: true })) as { client_id?: string; client_name?: string; redirect_uris?: string[] }
    if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0 || !doc.redirect_uris.every((r) => typeof r === 'string' && validRedirect(r))) {
      rememberFailure(clientId)
      return null
    }
    const row = { id: clientId, name: String(doc.client_name ?? new URL(clientId).hostname).slice(0, 100), redirectUris: doc.redirect_uris.slice(0, 10), kind: 'cimd' as const, lastUsedAt: nowIso() }
    await db.insert(oauthClients).values(row).onConflictDoUpdate({ target: oauthClients.id, set: { name: row.name, redirectUris: row.redirectUris, lastUsedAt: row.lastUsedAt } })
    return { ...row, createdAt: row.lastUsedAt }
  } catch {
    rememberFailure(clientId)
    return known ?? null
  }
}

/** Fehlgeschlagene Metadaten-Abrufe 10 Minuten nicht wiederholen. */
const cimdFailures = new Map<string, number>()
function rememberFailure(url: string) {
  if (cimdFailures.size > 2000) cimdFailures.clear()
  cimdFailures.set(url, Date.now() + 10 * 60_000)
}

function redirectMatches(registered: string[], uri: string) {
  if (registered.includes(uri)) return true
  // Loopback: Port darf abweichen (RFC 8252 7.3)
  try {
    const u = new URL(uri)
    if (u.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return false
    return registered.some((r) => {
      const x = new URL(r)
      return x.protocol === u.protocol && x.hostname === u.hostname && x.pathname === u.pathname && x.search === u.search
    })
  } catch {
    return false
  }
}

const normResource = (r: string) => r.replace(/\/+$/, '')

/* ---------------- Autorisierung ---------------- */

interface PendingRequest {
  clientId: string
  clientName: string
  redirectUri: string
  state?: string
  codeChallenge: string
  scope: 'read' | 'write'
  resource: string | null
  expires: number
}
const pending = new Map<string, PendingRequest>()

/** Prüft /oauth/authorize. Liefert entweder eine Fehlerseite (ungültiger Client) oder die Weiterleitung. */
export async function startAuthorization(q: Record<string, string | undefined>): Promise<{ redirect: string } | { error: string }> {
  const clientId = q.client_id ?? ''
  const client = clientId ? await resolveClient(clientId) : null
  if (!client) return { error: 'Unbekannter Client. Bitte die Verbindung im KI-Assistenten neu einrichten.' }
  const redirectUri = q.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : '')
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return { error: 'Die Rücksprungadresse (redirect_uri) passt nicht zum Client.' }

  const fail = (error: string, desc: string) => {
    const u = new URL(redirectUri)
    u.searchParams.set('error', error)
    u.searchParams.set('error_description', desc)
    if (q.state) u.searchParams.set('state', q.state)
    u.searchParams.set('iss', issuer())
    return { redirect: u.href }
  }
  if (q.response_type !== 'code') return fail('unsupported_response_type', 'Nur response_type=code.')
  if (!q.code_challenge || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge)) return fail('invalid_request', 'PKCE mit S256 ist Pflicht.')
  if (q.resource && normResource(q.resource) !== normResource(mcpResource())) return fail('invalid_target', 'Unbekannte Ressource.')
  const scopes = (q.scope ?? '').split(/\s+/).filter(Boolean)
  if (scopes.some((s) => !['termind:read', 'termind:write'].includes(s))) return fail('invalid_scope', 'Unbekannter Scope.')
  const scope = scopes.length === 0 || scopes.includes('termind:write') ? 'write' : 'read'

  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k)
  // Älteste offene Anfrage verwerfen statt neue abzulehnen
  while (pending.size >= 2000) pending.delete(pending.keys().next().value!)
  const id = randomToken(18)
  pending.set(id, { clientId: client.id, clientName: client.name, redirectUri, state: q.state, codeChallenge: q.code_challenge, scope, resource: q.resource ? normResource(q.resource) : null, expires: Date.now() + 10 * 60_000 })
  return { redirect: `/oauth/consent?req=${id}` }
}

function getPendingOrFail(id: string) {
  const p = pending.get(id)
  if (!p || p.expires < Date.now()) throw notFound('Anfrage')
  return p
}

export async function describeRequest(actor: Actor, id: string) {
  requireHost(actor)
  if (actor.type === 'token') throw new AppError('forbidden', 'Nur in der Oberfläche möglich.')
  const p = getPendingOrFail(id)
  return { clientName: p.clientName, redirectHost: new URL(p.redirectUri).host, scope: p.scope, instanceName: (await getSetting('branding')).instanceName }
}

export async function decide(actor: Actor, id: string, approve: boolean, scope?: 'read' | 'write') {
  const a = requireHost(actor)
  if (a.type === 'token') throw new AppError('forbidden', 'Nur in der Oberfläche möglich.')
  const p = getPendingOrFail(id)
  pending.delete(id)
  const u = new URL(p.redirectUri)
  if (p.state) u.searchParams.set('state', p.state)
  u.searchParams.set('iss', issuer())
  if (!approve) {
    u.searchParams.set('error', 'access_denied')
    return { redirect: u.href }
  }
  const code = randomToken(32)
  // Gewährt wird höchstens, was angefragt wurde
  const granted = p.scope === 'read' ? 'read' : (scope ?? 'write')
  await db.insert(oauthCodes).values({ id: sha256(code), clientId: p.clientId, userId: a.userId, redirectUri: p.redirectUri, codeChallenge: p.codeChallenge, scope: granted, resource: p.resource, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() })
  await audit(actor, 'KI-Connector zugelassen', `${p.clientName} (${granted === 'write' ? 'verwalten' : 'nur lesen'})`, 'write')
  u.searchParams.set('code', code)
  return { redirect: u.href }
}

/* ---------------- Token ---------------- */

const s256 = (v: string) => createHash('sha256').update(v).digest('base64url')
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

async function issue(grantId: string | null, base: { clientId: string; clientName: string; userId: string; scope: 'read' | 'write'; resource: string | null }) {
  const access = `tmo_${randomToken(32)}`
  const refresh = `tmr_${randomToken(32)}`
  const vals = {
    scope: base.scope,
    accessHash: sha256(access),
    accessExpiresAt: new Date(Date.now() + ACCESS_TTL * 1000).toISOString(),
    refreshHash: sha256(refresh),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL * 1000).toISOString(),
  }
  if (grantId) await db.update(oauthGrants).set(vals).where(eq(oauthGrants.id, grantId))
  else await db.insert(oauthGrants).values({ id: newId(), ...base, ...vals })
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: `termind:${base.scope}` }
}

export async function token(form: Record<string, string>) {
  const grantType = form.grant_type
  if (grantType === 'authorization_code') {
    const { code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId } = form
    if (!code || !verifier || !clientId) throw new OAuthError('invalid_request', 'code, code_verifier und client_id sind Pflicht.')
    const row = await db.query.oauthCodes.findFirst({ where: eq(oauthCodes.id, sha256(code)) })
    if (!row || row.expiresAt < nowIso()) throw new OAuthError('invalid_grant', 'Code ungültig oder abgelaufen.')
    if (row.usedAt) {
      // Wiederverwendung: alle daraus entstandenen Zugänge sperren
      await db.update(oauthGrants).set({ revokedAt: nowIso() }).where(and(eq(oauthGrants.clientId, row.clientId), eq(oauthGrants.userId, row.userId), isNull(oauthGrants.revokedAt)))
      throw new OAuthError('invalid_grant', 'Code wurde bereits benutzt.')
    }
    if (row.clientId !== clientId) throw new OAuthError('invalid_grant', 'Code gehört zu einem anderen Client.')
    if (redirectUri && redirectUri !== row.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri stimmt nicht.')
    if (verifier.length < 43 || verifier.length > 128 || !same(s256(verifier), row.codeChallenge)) throw new OAuthError('invalid_grant', 'PKCE-Prüfung fehlgeschlagen.')
    if (form.resource && normResource(form.resource) !== normResource(mcpResource())) throw new OAuthError('invalid_target', 'Unbekannte Ressource.')
    // Atomar einlösen: bei gleichzeitigen Anfragen gewinnt genau eine
    const claimed = await db.update(oauthCodes).set({ usedAt: nowIso() }).where(and(eq(oauthCodes.id, row.id), isNull(oauthCodes.usedAt))).returning({ id: oauthCodes.id })
    if (claimed.length === 0) throw new OAuthError('invalid_grant', 'Code wurde bereits benutzt.')
    const client = await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, row.clientId) })
    await db.update(oauthClients).set({ lastUsedAt: nowIso() }).where(eq(oauthClients.id, row.clientId))
    return issue(null, { clientId: row.clientId, clientName: client?.name ?? 'KI-Client', userId: row.userId, scope: row.scope, resource: row.resource })
  }
  if (grantType === 'refresh_token') {
    const rt = form.refresh_token
    if (!rt || !form.client_id) throw new OAuthError('invalid_request', 'refresh_token und client_id sind Pflicht.')
    const g = await db.query.oauthGrants.findFirst({ where: eq(oauthGrants.refreshHash, sha256(rt)) })
    if (!g || g.revokedAt || !g.refreshExpiresAt || g.refreshExpiresAt < nowIso() || g.clientId !== form.client_id) throw new OAuthError('invalid_grant', 'Refresh-Token ungültig.')
    if (form.resource && normResource(form.resource) !== normResource(mcpResource())) throw new OAuthError('invalid_target', 'Unbekannte Ressource.')
    // Scope darf nur verkleinert werden
    const scope = form.scope?.includes('termind:write') || !form.scope ? g.scope : 'read'
    return issue(g.id, { ...g, scope })
  }
  throw new OAuthError('unsupported_grant_type', 'Nicht unterstützter grant_type.')
}

export async function revokeToken(tokenValue: string) {
  const h = sha256(tokenValue)
  const g = (await db.query.oauthGrants.findFirst({ where: eq(oauthGrants.accessHash, h) })) ?? (await db.query.oauthGrants.findFirst({ where: eq(oauthGrants.refreshHash, h) }))
  if (g) await db.update(oauthGrants).set({ revokedAt: nowIso() }).where(eq(oauthGrants.id, g.id))
}

export async function actorFromOAuth(bearer: string): Promise<Actor | null> {
  if (!bearer.startsWith('tmo_')) return null
  const g = await db.query.oauthGrants.findFirst({ where: eq(oauthGrants.accessHash, sha256(bearer)) })
  if (!g || g.revokedAt || g.accessExpiresAt < nowIso()) return null
  if (g.resource && normResource(g.resource) !== normResource(mcpResource())) return null
  const u = await db.query.users.findFirst({ where: eq(users.id, g.userId), columns: { role: true } })
  if (!u) return null
  if (!g.lastUsedAt || Date.now() - Date.parse(g.lastUsedAt) > 60_000) await db.update(oauthGrants).set({ lastUsedAt: nowIso() }).where(eq(oauthGrants.id, g.id))
  return { type: 'token', userId: g.userId, role: u.role, tokenId: g.id, scope: g.scope, client: g.clientName }
}

/* ---------------- Verwaltung in der Oberfläche ---------------- */

export async function listGrants(actor: Actor) {
  const a = requireHost(actor)
  const rows = await db.query.oauthGrants.findMany({ where: and(eq(oauthGrants.userId, a.userId), isNull(oauthGrants.revokedAt)) })
  return rows
    .filter((g) => (g.refreshExpiresAt ?? g.accessExpiresAt) > nowIso())
    .map((g) => ({ id: g.id, clientName: g.clientName, scope: g.scope, lastUsedAt: g.lastUsedAt, createdAt: g.createdAt }))
}

export async function revokeGrant(actor: Actor, id: string) {
  const a = requireHost(actor)
  if (a.type === 'token' && a.scope !== 'write') throw new AppError('forbidden', 'Dafür fehlen die Rechte.')
  const g = await db.query.oauthGrants.findFirst({ where: and(eq(oauthGrants.id, id), eq(oauthGrants.userId, a.userId)) })
  if (!g) throw notFound('Zugang')
  await db.update(oauthGrants).set({ revokedAt: nowIso() }).where(eq(oauthGrants.id, id))
  await audit(actor, 'KI-Connector entzogen', g.clientName, 'write')
}

export const _test = { validRedirect, redirectMatches }
