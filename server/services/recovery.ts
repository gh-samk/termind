import { createHmac, randomInt } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { config } from '../config'
import { db } from '../db/client'
import { backupCodes, passwordResets, sessions, users } from '../db/schema'
import { AppError, invalid } from '../lib/errors'
import { hashPassword } from '../lib/password'
import { hit } from '../lib/rateLimit'
import { newId, nowIso, randomToken, sha256 } from '../lib/util'
import { enqueuePasswordResetMail } from '../mail/queue'
import { getSetting } from './settings'
import { audit } from './audit'
import { newPasswordSchema } from '../../shared/schemas'

/* Ausgesperrt-Schutz: „Passwort vergessen“ per Mail-Link und Ersatzcodes für die Zwei-Faktor-Anmeldung. */

export const RESET_MINUTES = 30
export const BACKUP_CODE_COUNT = 10
/** Ohne leicht verwechselbare Zeichen (0/O, 1/I/L). 31 Zeichen, 10 Stellen ≈ 49 Bit. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const RESET_RESPONSE_MS = 600

export const resetLink = (token: string) => `${config.publicUrl}/passwort-neu?token=${token}`

/* ---------------- Passwort vergessen ---------------- */

/** Erzeugt einen Einmal-Token (32 Byte zufällig). In der Datenbank liegt nur der SHA-256-Hash. */
export async function createResetToken(userId: string) {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + RESET_MINUTES * 60_000).toISOString()
  await db.insert(passwordResets).values({ id: sha256(token), userId, expiresAt })
  return { token, expiresAt }
}

/**
 * „Passwort vergessen?“ Die Antwort ist immer dieselbe, egal ob es ein Konto gibt,
 * ob der Mail-Versand eingerichtet ist oder ob das Limit pro Adresse erreicht ist.
 * Die Dauer wird auf mindestens 600 ms aufgefüllt, damit sie nichts verrät.
 * Nur das Limit pro IP antwortet mit 429 (hängt nicht vom Konto ab).
 */
export async function requestPasswordReset(emailRaw: string, ip: string) {
  const started = Date.now()
  if (!hit(`pwreset-ip:${ip}`, 10, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
  const email = emailRaw.trim().toLowerCase().slice(0, 254)
  const withinLimit = hit(`pwreset-mail:${sha256(email)}`, 3, 60 * 60_000)
  try {
    const smtp = await getSetting('smtp')
    const u = withinLimit && smtp ? await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } }) : undefined
    if (u) {
      const { token } = await createResetToken(u.id)
      await enqueuePasswordResetMail(u.id, token)
    } else {
      // Gleiche Arbeit ohne Wirkung
      sha256(randomToken(32))
      await db.query.users.findFirst({ where: eq(users.email, '-'), columns: { id: true } })
    }
  } catch (e) {
    console.error('[passwort-vergessen]', e instanceof Error ? e.message : e)
  }
  await sleep(Math.max(0, RESET_RESPONSE_MS - (Date.now() - started)))
}

/**
 * Neues Passwort mit dem Token aus der Mail. Der Token wird atomar als verbraucht markiert
 * (nur wer ihn zuerst einlöst, kommt durch). Danach: alle Sitzungen des Kontos beenden,
 * alle übrigen Reset-Tokens verwerfen. Zwei-Faktor-Anmeldung bleibt unverändert.
 */
export async function resetPassword(token: string, password: string, ip: string) {
  if (!hit(`pwreset-use:${ip}`, 10, 15 * 60_000)) throw new AppError('rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.')
  const parsed = newPasswordSchema.safeParse(password)
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Ungültiges Passwort.')
  // Zuerst hashen: scheitert das, bleibt der Token unverbraucht
  const passwordHash = await hashPassword(parsed.data)
  const claimed = await db
    .update(passwordResets)
    .set({ usedAt: nowIso() })
    .where(and(eq(passwordResets.id, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, nowIso())))
    .returning({ userId: passwordResets.userId })
  if (claimed.length !== 1) throw invalid('Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere auf der Anmeldeseite einen neuen an.')
  const userId = claimed[0].userId
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
    await tx.delete(passwordResets).where(eq(passwordResets.userId, userId))
  })
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true } })
  await audit({ type: 'system' }, 'Passwort über Mail-Link zurückgesetzt, alle Sitzungen beendet', u?.email ?? '', 'write')
}

/** Ob ein Reset-Token noch einlösbar ist (für die Anzeige der Seite, ohne etwas zu verbrauchen). */
export async function isResetTokenValid(token: string) {
  const row = await db.query.passwordResets.findFirst({ where: and(eq(passwordResets.id, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, nowIso())), columns: { id: true } })
  return !!row
}

/* ---------------- Ersatzcodes ---------------- */

function newCode() {
  let c = ''
  for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return `${c.slice(0, 5)}-${c.slice(5)}`
}

/** Eingabe vereinheitlichen: Groß-/Kleinschreibung, Bindestrich und Leerzeichen sind egal. */
export const normalizeBackupCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Gespeichert wird ein HMAC mit dem Instanz-Schlüssel: Eine gestohlene Datenbank allein reicht nicht zum Durchprobieren. */
const codeHash = (userId: string, normalized: string) => createHmac('sha256', config.secret).update(`backup:${userId}:${normalized}`).digest('hex')

/** Erzeugt einen neuen Satz Ersatzcodes. Alte Codes werden dabei ungültig. Die Klartext-Codes gibt es nur hier, einmal. */
export async function replaceBackupCodes(userId: string) {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, newCode)
  await db.transaction(async (tx) => {
    await tx.delete(backupCodes).where(eq(backupCodes.userId, userId))
    await tx.insert(backupCodes).values(codes.map((c) => ({ id: newId(), userId, codeHash: codeHash(userId, normalizeBackupCode(c)) })))
  })
  return codes
}

export async function deleteBackupCodes(userId: string) {
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId))
}

export async function remainingBackupCodes(userId: string) {
  const rows = await db.query.backupCodes.findMany({ where: and(eq(backupCodes.userId, userId), isNull(backupCodes.usedAt)), columns: { id: true } })
  return rows.length
}

/** Löst einen Ersatzcode ein. Atomar: derselbe Code funktioniert nur einmal, auch bei gleichzeitigen Versuchen. */
export async function consumeBackupCode(userId: string, input: string) {
  const n = normalizeBackupCode(input)
  if (n.length !== CODE_LENGTH) return false
  const claimed = await db
    .update(backupCodes)
    .set({ usedAt: nowIso() })
    .where(and(eq(backupCodes.userId, userId), eq(backupCodes.codeHash, codeHash(userId, n)), isNull(backupCodes.usedAt)))
    .returning({ id: backupCodes.id })
  return claimed.length === 1
}

/* ---------------- Notfall auf dem Server (Kommandozeile) ---------------- */

/**
 * `node server/index.js reset-password <email> [--disable-2fa]`
 * Erzeugt einen Reset-Link (30 Minuten) und beendet alle Sitzungen. Mit `disable2fa` wird zusätzlich
 * die Zwei-Faktor-Anmeldung abgeschaltet (Handy verloren, Ersatzcodes weg). Passkeys bleiben.
 */
export async function emergencyReset(emailRaw: string, disable2fa: boolean) {
  const u = await db.query.users.findFirst({ where: eq(users.email, emailRaw.trim().toLowerCase()) })
  if (!u) return null
  await db.delete(sessions).where(eq(sessions.userId, u.id))
  if (disable2fa) {
    await db.update(users).set({ totpEnabled: false, totpSecret: null, totpLastStep: null }).where(eq(users.id, u.id))
    await deleteBackupCodes(u.id)
  }
  const { token } = await createResetToken(u.id)
  await audit({ type: 'system' }, `Notfall-Zurücksetzung auf dem Server${disable2fa ? ' (Zwei-Faktor ausgeschaltet)' : ''}`, u.email, 'write')
  return { link: resetLink(token), disabled2fa: disable2fa }
}
