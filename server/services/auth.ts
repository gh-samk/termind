import { timingSafeEqual } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { and, eq, isNull, lt, ne, or } from 'drizzle-orm'
import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'
import type { z } from 'zod'
import type { setupSchema } from '../../shared/schemas'
import { config } from '../config'
import { db } from '../db/client'
import { apiTokens, passkeys, sessions, settings, users } from '../db/schema'
import { type Actor, requireHost, requireWrite } from '../lib/actor'
import { AppError, invalid, notFound } from '../lib/errors'
import { clear, hit } from '../lib/rateLimit'
import { isValidTimeZone } from '../lib/time'
import { decrypt, encrypt, newId, nowIso, randomToken, RESERVED_HANDLES, sha256, slugify } from '../lib/util'
import { audit } from './audit'
import { createDefaultSchedule } from './schedules'
import { getSetting, setSetting } from './settings'

const SESSION_DAYS = 30
const argonOpts = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

/* ---------------- Ersteinrichtung ---------------- */

export async function isSetupComplete() {
  return getSetting('setupComplete')
}

export async function runSetup(input: z.infer<typeof setupSchema>, setupToken: string, userAgent?: string) {
  if (await isSetupComplete()) throw new AppError('conflict', 'Die Einrichtung ist bereits abgeschlossen.')
  if (!safeEqual(setupToken, config.setupToken)) throw new AppError('forbidden', 'Der Einrichtungslink ist ungültig. Den richtigen Link findest du im Server-Log.')
  if (!isValidTimeZone(input.timezone)) throw invalid('Unbekannte Zeitzone.')
  const userId = newId()
  const base = slugify(input.name.split(' ')[0]) || 'termine'
  const handle = RESERVED_HANDLES.has(base) ? `${base}-termine` : base
  const passwordHash = await hash(input.password, argonOpts)
  // Atomar: zwei gleichzeitige Aufrufe dürfen nicht zwei Inhaber erzeugen
  await db.transaction(async (tx) => {
    const existing = await tx.query.users.findFirst({ columns: { id: true } })
    if (existing) throw new AppError('conflict', 'Die Einrichtung ist bereits abgeschlossen.')
    await tx.insert(users).values({ id: userId, email: input.email.toLowerCase(), name: input.name, handle, role: 'owner', passwordHash, timezone: input.timezone })
    await tx.insert(settings).values({ key: 'setupComplete', value: true }).onConflictDoUpdate({ target: settings.key, set: { value: true } })
  })
  await createDefaultSchedule(userId, input.timezone)
  await setSetting('branding', { ...(await getSetting('branding')), instanceName: input.instanceName })
  return createSession(userId, false, userAgent)
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Nur angemeldete Menschen (keine API-Schlüssel, keine KI) dürfen Sicherheitseinstellungen ändern. */
function requireSession(actor: Actor) {
  const a = requireWrite(actor)
  if (a.type !== 'user') throw new AppError('forbidden', 'Nur in der Oberfläche möglich, nicht per API oder KI.')
  return a
}

/* ---------------- Sitzungen ---------------- */

async function createSession(userId: string, pendingSecondFactor: boolean, userAgent?: string) {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + (pendingSecondFactor ? 10 * 60_000 : SESSION_DAYS * 86_400_000)).toISOString()
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, pendingSecondFactor, userAgent: userAgent?.slice(0, 200) })
  return { token, expiresAt, pendingSecondFactor }
}

export async function sessionFromToken(token: string | undefined) {
  if (!token) return null
  const s = await db.query.sessions.findFirst({ where: eq(sessions.id, sha256(token)) })
  if (!s || s.expiresAt < nowIso()) return null
  return s
}

export async function actorFromSession(token: string | undefined): Promise<Actor | null> {
  const s = await sessionFromToken(token)
  if (!s || s.pendingSecondFactor) return null
  const u = await db.query.users.findFirst({ where: eq(users.id, s.userId), columns: { id: true, role: true } })
  return u ? { type: 'user', userId: u.id, role: u.role } : null
}

export async function logout(token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)))
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, nowIso()))
}

/* ---------------- Passwort & 2FA ---------------- */

export async function login(email: string, password: string, ip: string, userAgent?: string) {
  const key = `login:${ip}:${email.toLowerCase()}`
  if (!hit(key, 8, 15 * 60_000) || !hit(`login-ip:${ip}`, 30, 15 * 60_000)) {
    throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
  }
  const u = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) })
  // Immer hashen, damit die Antwortzeit nicht verrät, ob es das Konto gibt
  const ok = u ? await verify(u.passwordHash, password) : (await hash(password, argonOpts), false)
  if (!u || !ok) throw new AppError('unauthorized', 'E-Mail oder Passwort stimmen nicht.')
  clear(key)
  return createSession(u.id, u.totpEnabled, userAgent)
}

function totpFor(secretBase32: string, label: string) {
  return new OTPAuth.TOTP({ issuer: 'termind', label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) })
}

/** Prüft einen TOTP-Code und verhindert, dass derselbe Code zweimal funktioniert. */
async function checkTotp(u: typeof users.$inferSelect, code: string) {
  if (!u.totpSecret) return false
  const delta = totpFor(decrypt(u.totpSecret), u.email).validate({ token: code.replace(/\s/g, ''), window: 1 })
  if (delta === null) return false
  const step = Math.floor(Date.now() / 30_000) + delta
  // Atomar: nur wer den Zeitschritt als Erster setzt, kommt durch (kein doppeltes Einlösen)
  const claimed = await db
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, u.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id })
  return claimed.length === 1
}

export async function verifySecondFactor(sessionToken: string | undefined, code: string, ip: string) {
  const s = await sessionFromToken(sessionToken)
  if (!s || !s.pendingSecondFactor) throw new AppError('unauthorized', 'Bitte melde dich erneut an.')
  // Begrenzung pro Konto (über alle IPs) und pro Zwischensitzung
  if (!hit(`totp-user:${s.userId}`, 10, 15 * 60_000) || !hit(`totp-ip:${ip}`, 20, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
  if (!hit(`totp-session:${s.id}`, 5, 10 * 60_000)) {
    await db.delete(sessions).where(eq(sessions.id, s.id))
    throw new AppError('unauthorized', 'Zu viele Fehlversuche. Bitte melde dich erneut an.')
  }
  const u = await db.query.users.findFirst({ where: eq(users.id, s.userId) })
  if (!u?.totpSecret) throw new AppError('unauthorized', 'Bitte melde dich erneut an.')
  if (!(await checkTotp(u, code))) throw new AppError('unauthorized', 'Der Code stimmt nicht.')
  await db.delete(sessions).where(eq(sessions.id, s.id))
  return createSession(u.id, false)
}

export async function startTotpSetup(actor: Actor) {
  const a = requireSession(actor)
  const u = await db.query.users.findFirst({ where: eq(users.id, a.userId) })
  if (!u) throw notFound('Person')
  if (u.totpEnabled) throw invalid('Die Zwei-Faktor-Anmeldung ist schon aktiv. Schalte sie zuerst mit deinem Passwort aus.')
  const secret = new OTPAuth.Secret({ size: 20 })
  await db.update(users).set({ totpSecret: encrypt(secret.base32), totpEnabled: false, totpLastStep: null }).where(eq(users.id, u.id))
  const uri = totpFor(secret.base32, u.email).toString()
  return { uri, secret: secret.base32, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) }
}

export async function confirmTotpSetup(actor: Actor, code: string) {
  const a = requireSession(actor)
  if (!hit(`totp-setup:${a.userId}`, 10, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche.')
  const u = await db.query.users.findFirst({ where: eq(users.id, a.userId) })
  if (!u?.totpSecret || u.totpEnabled) throw invalid('Bitte starte die Einrichtung neu.')
  if (!(await checkTotp(u, code))) throw invalid('Der Code stimmt nicht.')
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, u.id))
  await audit(actor, 'Zwei-Faktor-Anmeldung aktiviert', '', 'write')
}

export async function disableTotp(actor: Actor, password: string) {
  const a = requireSession(actor)
  if (!hit(`pw-check:${a.userId}`, 8, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
  const u = await db.query.users.findFirst({ where: eq(users.id, a.userId) })
  if (!u || !(await verify(u.passwordHash, password))) throw invalid('Das Passwort stimmt nicht.')
  await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, u.id))
  await audit(actor, 'Zwei-Faktor-Anmeldung deaktiviert', '', 'write')
}

export async function changePassword(actor: Actor, current: string, next: string, currentSessionToken?: string) {
  const a = requireSession(actor)
  if (next.length < 10 || next.length > 200) throw invalid('Das neue Passwort braucht 10 bis 200 Zeichen.')
  if (!hit(`pw-check:${a.userId}`, 8, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
  const u = await db.query.users.findFirst({ where: eq(users.id, a.userId) })
  if (!u || !(await verify(u.passwordHash, current))) throw invalid('Das aktuelle Passwort stimmt nicht.')
  await db.update(users).set({ passwordHash: await hash(next, argonOpts) }).where(eq(users.id, u.id))
  // Alle anderen Sitzungen beenden (z. B. auf fremden Geräten)
  const keep = currentSessionToken ? sha256(currentSessionToken) : ''
  await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, keep)))
  await audit(actor, 'Passwort geändert, andere Sitzungen beendet', '', 'write')
}

/** Alle Sitzungen außer der aktuellen beenden. */
export async function logoutOthers(actor: Actor, currentSessionToken?: string) {
  const a = requireSession(actor)
  await db.delete(sessions).where(and(eq(sessions.userId, a.userId), ne(sessions.id, currentSessionToken ? sha256(currentSessionToken) : '')))
  await audit(actor, 'Andere Sitzungen beendet', '', 'write')
}

/* ---------------- Passkeys ---------------- */

const challenges = new Map<string, { challenge: string; userId?: string; expires: number }>()
function storeChallenge(challenge: string, userId?: string) {
  if (challenges.size > 5000) challenges.delete(challenges.keys().next().value!)
  const id = randomToken(16)
  challenges.set(id, { challenge, userId, expires: Date.now() + 5 * 60_000 })
  for (const [k, v] of challenges) if (v.expires < Date.now()) challenges.delete(k)
  return id
}
function takeChallenge(id: string) {
  const c = challenges.get(id)
  challenges.delete(id)
  if (!c || c.expires < Date.now()) throw invalid('Die Anfrage ist abgelaufen. Bitte versuch es noch einmal.')
  return c
}
const origin = () => new URL(config.publicUrl).origin
const rpName = async () => (await getSetting('branding')).instanceName

export async function passkeyRegistrationOptions(actor: Actor) {
  const a = requireSession(actor)
  const u = await db.query.users.findFirst({ where: eq(users.id, a.userId) })
  if (!u) throw notFound('Person')
  const existing = await db.query.passkeys.findMany({ where: eq(passkeys.userId, u.id) })
  const options = await generateRegistrationOptions({
    rpName: await rpName(),
    rpID: config.rpId,
    userName: u.email,
    userDisplayName: u.name,
    userID: new TextEncoder().encode(u.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as never })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })
  return { options, challengeId: storeChallenge(options.challenge, u.id) }
}

export async function passkeyRegister(actor: Actor, challengeId: string, response: RegistrationResponseJSON, name?: string) {
  const a = requireSession(actor)
  const c = takeChallenge(challengeId)
  if (c.userId !== a.userId) throw invalid('Ungültige Anfrage.')
  let v: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge: c.challenge, expectedOrigin: origin(), expectedRPID: config.rpId })
  } catch {
    throw invalid('Der Passkey konnte nicht bestätigt werden.')
  }
  if (!v.verified) throw invalid('Der Passkey konnte nicht bestätigt werden.')
  if ((await db.query.passkeys.findMany({ where: eq(passkeys.userId, a.userId), columns: { id: true } })).length >= 20) throw invalid('Höchstens 20 Passkeys.')
  const { credential, passkeyProviderMetadata } = v.registrationInfo
  const row = {
    id: credential.id,
    userId: a.userId,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    name: name?.trim() || Object.values(passkeyProviderMetadata?.friendlyNames ?? {})[0] || 'Passkey',
  }
  await db.insert(passkeys).values(row)
  await audit(actor, 'Passkey hinzugefügt', row.name, 'write')
  return { id: row.id, name: row.name }
}

export async function passkeyLoginOptions() {
  const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'preferred' })
  return { options, challengeId: storeChallenge(options.challenge) }
}

export async function passkeyLogin(challengeId: string, response: AuthenticationResponseJSON, userAgent?: string) {
  const c = takeChallenge(challengeId)
  const pk = typeof response?.id === 'string' ? await db.query.passkeys.findFirst({ where: eq(passkeys.id, response.id) }) : undefined
  if (!pk) throw new AppError('unauthorized', 'Dieser Passkey ist hier nicht bekannt.')
  let v: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: c.challenge,
      expectedOrigin: origin(),
      expectedRPID: config.rpId,
      credential: { id: pk.id, publicKey: new Uint8Array(Buffer.from(pk.publicKey, 'base64url')), counter: pk.counter, transports: pk.transports as never },
    })
  } catch {
    throw new AppError('unauthorized', 'Anmeldung mit Passkey fehlgeschlagen.')
  }
  if (!v.verified) throw new AppError('unauthorized', 'Anmeldung mit Passkey fehlgeschlagen.')
  await db.update(passkeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: nowIso() }).where(eq(passkeys.id, pk.id))
  // Ein Passkey ist bereits ein starker Faktor, daher kein zusätzlicher TOTP-Code.
  return createSession(pk.userId, false, userAgent)
}

export async function listPasskeys(actor: Actor) {
  const a = requireHost(actor)
  const rows = await db.query.passkeys.findMany({ where: eq(passkeys.userId, a.userId) })
  return rows.map(({ id, name, createdAt, lastUsedAt }) => ({ id, name, createdAt, lastUsedAt }))
}

export async function deletePasskey(actor: Actor, id: string) {
  const a = requireSession(actor)
  await db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, a.userId)))
  await audit(actor, 'Passkey entfernt', '', 'write')
}

/* ---------------- API-Schlüssel (für MCP & Automatisierung) ---------------- */

export async function createApiToken(actor: Actor, name: string, scope: 'read' | 'write') {
  const a = requireWrite(actor)
  if (a.type === 'token') throw invalid('API-Schlüssel können nur in der Oberfläche erstellt werden.')
  const plain = `tmd_${randomToken(30)}`
  const row = { id: newId(), userId: a.userId, name: name.trim().slice(0, 80) || 'API-Schlüssel', tokenHash: sha256(plain), prefix: plain.slice(0, 8), scope }
  await db.insert(apiTokens).values(row)
  await audit(actor, 'API-Schlüssel erstellt', `${row.name} (${scope === 'write' ? 'verwalten' : 'nur lesen'})`, 'write')
  return { id: row.id, name: row.name, scope, prefix: row.prefix, token: plain }
}

export async function listApiTokens(actor: Actor) {
  const a = requireHost(actor)
  const rows = await db.query.apiTokens.findMany({ where: and(eq(apiTokens.userId, a.userId), isNull(apiTokens.revokedAt)) })
  return rows.map(({ id, name, scope, prefix, lastUsedAt, createdAt }) => ({ id, name, scope, prefix, lastUsedAt, createdAt }))
}

export async function revokeApiToken(actor: Actor, id: string) {
  const a = requireSession(actor)
  await db.update(apiTokens).set({ revokedAt: nowIso() }).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, a.userId)))
  await audit(actor, 'API-Schlüssel entzogen', id, 'write')
}

export async function actorFromApiToken(bearer: string | undefined): Promise<Actor | null> {
  if (!bearer?.startsWith('tmd_')) return null
  const t = await db.query.apiTokens.findFirst({ where: and(eq(apiTokens.tokenHash, sha256(bearer)), isNull(apiTokens.revokedAt)) })
  if (!t) return null
  const u = await db.query.users.findFirst({ where: eq(users.id, t.userId), columns: { role: true } })
  if (!u) return null
  // lastUsedAt höchstens einmal pro Minute schreiben
  if (!t.lastUsedAt || Date.now() - new Date(t.lastUsedAt).getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: nowIso() }).where(eq(apiTokens.id, t.id))
  }
  return { type: 'token', userId: t.userId, role: u.role, tokenId: t.id, scope: t.scope, client: t.name }
}
