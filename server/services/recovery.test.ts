import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { db, initDbForTests } from '../test/db'
import { makeUser } from '../test/helpers'
import { backupCodes, jobs, passwordResets, sessions, settings, users } from '../db/schema'
import { newId, sha256 } from '../lib/util'
import * as auth from './auth'
import { consumeBackupCode, createResetToken, emergencyReset, isResetTokenValid, remainingBackupCodes, replaceBackupCodes, requestPasswordReset, resetPassword } from './recovery'
import { setSetting } from './settings'

beforeAll(initDbForTests)

let ipCounter = 0
const ip = () => `10.0.0.${++ipCounter}` // eigene Adresse pro Aufruf, damit das IP-Limit nichts verfälscht
const NEW_PW = 'ganz-neues-passwort-42'

async function session(userId: string, pending = false) {
  const id = newId()
  await db.insert(sessions).values({ id, userId, expiresAt: new Date(Date.now() + 3600_000).toISOString(), pendingSecondFactor: pending })
  return id
}

describe('Passwort zurücksetzen', () => {
  it('gültiger Token setzt das Passwort, beendet alle Sitzungen und verwirft andere Tokens', async () => {
    const uid = await makeUser('gueltig@example.de')
    await session(uid)
    await session(uid)
    const { token } = await createResetToken(uid)
    const other = await createResetToken(uid)
    // In der Datenbank steht nur der Hash
    const row = await db.query.passwordResets.findFirst({ where: eq(passwordResets.userId, uid) })
    expect(row && [sha256(token), sha256(other.token)].includes(row.id)).toBe(true)
    expect(JSON.stringify(await db.query.passwordResets.findMany())).not.toContain(token)

    await resetPassword(token, NEW_PW, ip())

    expect(await db.query.sessions.findMany({ where: eq(sessions.userId, uid) })).toHaveLength(0)
    expect(await db.query.passwordResets.findMany({ where: eq(passwordResets.userId, uid) })).toHaveLength(0)
    await expect(auth.login('gueltig@example.de', 'altes-passwort-123', ip())).rejects.toThrow()
    await expect(auth.login('gueltig@example.de', NEW_PW, ip())).resolves.toBeTruthy()
    // der zweite Token ist mit verworfen
    await expect(resetPassword(other.token, NEW_PW + 'x', ip())).rejects.toThrow(/abgelaufen|benutzt/)
  })

  it('abgelaufener Token wird abgelehnt', async () => {
    const uid = await makeUser('abgelaufen@example.de')
    const token = 'abgelaufen-token-abgelaufen-token-0123456789'
    await db.insert(passwordResets).values({ id: sha256(token), userId: uid, expiresAt: new Date(Date.now() - 1000).toISOString() })
    expect(await isResetTokenValid(token)).toBe(false)
    await expect(resetPassword(token, NEW_PW, ip())).rejects.toThrow(/abgelaufen/)
    await expect(auth.login('abgelaufen@example.de', 'altes-passwort-123', ip())).resolves.toBeTruthy()
  })

  it('Token lässt sich nur einmal einlösen, auch bei gleichzeitigen Versuchen', async () => {
    const uid = await makeUser('doppelt@example.de')
    const { token } = await createResetToken(uid)
    const results = await Promise.allSettled([resetPassword(token, NEW_PW, ip()), resetPassword(token, NEW_PW + '1', ip()), resetPassword(token, NEW_PW + '2', ip())])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await expect(resetPassword(token, NEW_PW, ip())).rejects.toThrow(/abgelaufen|benutzt/)
  })

  it('falscher Token und zu kurzes Passwort werden abgelehnt, ein zu kurzes Passwort verbraucht den Token nicht', async () => {
    const uid = await makeUser('falsch@example.de')
    await expect(resetPassword('x'.repeat(43), NEW_PW, ip())).rejects.toThrow(/abgelaufen|benutzt/)
    const { token } = await createResetToken(uid)
    await expect(resetPassword(token, 'kurz', ip())).rejects.toThrow(/Mindestens 10/)
    expect(await isResetTokenValid(token)).toBe(true)
    await expect(resetPassword(token, NEW_PW, ip())).resolves.toBeUndefined()
  })

  it('Zwei-Faktor bleibt nach dem Zurücksetzen bestehen', async () => {
    const uid = await makeUser('zweifaktor@example.de', 'altes-passwort-123', { totpEnabled: true, totpSecret: 'x' })
    const { token } = await createResetToken(uid)
    await resetPassword(token, NEW_PW, ip())
    const u = await db.query.users.findFirst({ where: eq(users.id, uid) })
    expect(u?.totpEnabled).toBe(true)
    const s = await auth.login('zweifaktor@example.de', NEW_PW, ip())
    expect(s.pendingSecondFactor).toBe(true)
  })

  it('Anfrage: gleiche Antwort mit und ohne Konto, nur für echte Konten wird eine Mail eingereiht', async () => {
    await setSetting('smtp', { host: 'smtp.example.de', port: 587, security: 'starttls', user: '', passwordEnc: null, fromName: 'T', fromEmail: 'a@example.de', replyTo: '' })
    const uid = await makeUser('anfrage@example.de')
    const t0 = Date.now()
    const a = await requestPasswordReset('Anfrage@Example.de ', ip())
    const tReal = Date.now() - t0
    const t1 = Date.now()
    const b = await requestPasswordReset('gibt-es-nicht@example.de', ip())
    const tFake = Date.now() - t1
    expect(a).toBeUndefined()
    expect(b).toBeUndefined()
    // Laufzeit ist aufgefüllt, beide ähnlich lang
    expect(tReal).toBeGreaterThanOrEqual(550)
    expect(tFake).toBeGreaterThanOrEqual(550)
    expect(Math.abs(tReal - tFake)).toBeLessThan(250)
    expect(await db.query.passwordResets.findMany({ where: eq(passwordResets.userId, uid) })).toHaveLength(1)
    const queued = await db.query.jobs.findMany({ where: eq(jobs.type, 'password-reset') })
    expect(queued).toHaveLength(1)
    // Der Token steht nicht im Klartext im Auftrag
    const payload = queued[0].payload as { tokenEnc: string }
    expect(payload.tokenEnc.startsWith('v1.')).toBe(true)
  })

  it('Anfrage: nach 3 Anfragen pro Adresse wird still nichts mehr erzeugt, die Antwort bleibt gleich', async () => {
    const uid = await makeUser('limit@example.de')
    for (let i = 0; i < 5; i++) await expect(requestPasswordReset('limit@example.de', ip())).resolves.toBeUndefined()
    expect(await db.query.passwordResets.findMany({ where: eq(passwordResets.userId, uid) })).toHaveLength(3)
  }, 15_000)

  it('Anfrage ohne eingerichteten Mail-Versand erzeugt nichts, antwortet aber gleich', async () => {
    await db.delete(settings).where(eq(settings.key, 'smtp'))
    const uid = await makeUser('ohnemail@example.de')
    await expect(requestPasswordReset('ohnemail@example.de', ip())).resolves.toBeUndefined()
    expect(await db.query.passwordResets.findMany({ where: eq(passwordResets.userId, uid) })).toHaveLength(0)
  })

  it('Notfall-Befehl: Link, Sitzungen weg, auf Wunsch ohne Zwei-Faktor', async () => {
    const uid = await makeUser('notfall@example.de', 'altes-passwort-123', { totpEnabled: true, totpSecret: 'x' })
    await replaceBackupCodes(uid)
    await session(uid)
    expect(await emergencyReset('gibtsnicht@example.de', false)).toBeNull()
    const r = await emergencyReset('Notfall@example.de', true)
    expect(r?.link).toMatch(/^http:\/\/localhost:3000\/passwort-neu\?token=[A-Za-z0-9_-]{43}$/)
    const u = await db.query.users.findFirst({ where: eq(users.id, uid) })
    expect(u?.totpEnabled).toBe(false)
    expect(u?.totpSecret).toBeNull()
    expect(await remainingBackupCodes(uid)).toBe(0)
    expect(await db.query.sessions.findMany({ where: eq(sessions.userId, uid) })).toHaveLength(0)
    const token = new URL(r!.link).searchParams.get('token')!
    await resetPassword(token, NEW_PW, ip())
    await expect(auth.login('notfall@example.de', NEW_PW, ip())).resolves.toMatchObject({ pendingSecondFactor: false })
  })
})

describe('Ersatzcodes', () => {
  it('erzeugt 10 Codes im Format xxxxx-xxxxx ohne verwechselbare Zeichen und speichert nur Hashes', async () => {
    const uid = await makeUser('codes@example.de')
    const codes = await replaceBackupCodes(uid)
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/)
    const stored = JSON.stringify(await db.query.backupCodes.findMany({ where: eq(backupCodes.userId, uid) }))
    for (const c of codes) expect(stored).not.toContain(c.replace('-', ''))
    expect(await remainingBackupCodes(uid)).toBe(10)
  })

  it('jeder Code gilt genau einmal, Schreibweise egal', async () => {
    const uid = await makeUser('einmal@example.de')
    const [a, b] = await replaceBackupCodes(uid)
    expect(await consumeBackupCode(uid, a)).toBe(true)
    expect(await consumeBackupCode(uid, a)).toBe(false)
    expect(await consumeBackupCode(uid, b.toLowerCase().replace('-', ' '))).toBe(true)
    expect(await remainingBackupCodes(uid)).toBe(8)
  })

  it('falsche Codes und Codes eines anderen Kontos funktionieren nicht', async () => {
    const u1 = await makeUser('c1@example.de')
    const u2 = await makeUser('c2@example.de')
    const [code] = await replaceBackupCodes(u1)
    expect(await consumeBackupCode(u1, 'AAAAA-AAAAA')).toBe(false)
    expect(await consumeBackupCode(u1, 'kurz')).toBe(false)
    expect(await consumeBackupCode(u2, code)).toBe(false)
    expect(await consumeBackupCode(u1, code)).toBe(true)
  })

  it('gleichzeitiges Einlösen desselben Codes klappt nur einmal', async () => {
    const uid = await makeUser('race@example.de')
    const [code] = await replaceBackupCodes(uid)
    const r = await Promise.all([consumeBackupCode(uid, code), consumeBackupCode(uid, code), consumeBackupCode(uid, code)])
    expect(r.filter(Boolean)).toHaveLength(1)
  })

  it('nach dem Neuerzeugen sind alle alten Codes ungültig', async () => {
    const uid = await makeUser('neu@example.de')
    const old = await replaceBackupCodes(uid)
    const fresh = await replaceBackupCodes(uid)
    expect(await consumeBackupCode(uid, old[0])).toBe(false)
    expect(await consumeBackupCode(uid, fresh[0])).toBe(true)
    expect(await remainingBackupCodes(uid)).toBe(9)
  })

  it('Neu erzeugen verlangt das Passwort', async () => {
    const uid = await makeUser('regen@example.de', 'altes-passwort-123', { totpEnabled: true, totpSecret: 'x' })
    const a = { type: 'user', userId: uid, role: 'owner' } as const
    await expect(auth.regenerateBackupCodes(a, 'falsch')).rejects.toThrow(/Passwort stimmt nicht/)
    expect((await auth.regenerateBackupCodes(a, 'altes-passwort-123')).backupCodes).toHaveLength(10)
  })

  it('Anmeldung mit Ersatzcode im zweiten Schritt, danach ist der Code verbraucht', async () => {
    const uid = await makeUser('login2fa@example.de', 'altes-passwort-123', { totpEnabled: true, totpSecret: 'x' })
    const [code] = await replaceBackupCodes(uid)
    const pending = await auth.login('login2fa@example.de', 'altes-passwort-123', ip())
    expect(pending.pendingSecondFactor).toBe(true)
    await expect(auth.verifySecondFactor(pending.token, 'AAAAA-AAAAA', ip(), true)).rejects.toThrow(/Ersatzcode/)
    const ok = await auth.verifySecondFactor(pending.token, code, ip(), true)
    expect(ok.pendingSecondFactor).toBe(false)
    const again = await auth.login('login2fa@example.de', 'altes-passwort-123', ip())
    await expect(auth.verifySecondFactor(again.token, code, ip(), true)).rejects.toThrow(/Ersatzcode/)
    expect(await db.query.backupCodes.findMany({ where: and(eq(backupCodes.userId, uid)) })).toHaveLength(10)
  })
})
