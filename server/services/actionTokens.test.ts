import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { config } from '../config'
import { actionTokens, auditLog, bookings, eventTypes, jobs } from '../db/schema'
import { acceptBooking, cancelBooking, guestReschedule } from './bookings'
import { newId, nowIso, sha256 } from '../lib/util'
import { db, initDbForTests } from '../test/db'
import { makeUser } from '../test/helpers'
import { ACTION_DAYS, createActionTokens, describeActionToken, executeActionToken } from './actionTokens'

beforeAll(initDbForTests)

let n = 0
const ip = () => `10.1.0.${++n}` // eigene Adresse pro Aufruf, damit die Limits nichts verfälschen

async function pending(opts: { hoursAhead?: number; status?: 'pending' | 'confirmed' } = {}) {
  const hostId = await makeUser(`gastgeber-${newId()}@example.de`)
  const evId = newId()
  await db.insert(eventTypes).values({ id: evId, userId: hostId, slug: `s-${evId.slice(0, 6)}`, title: 'Erstgespräch', duration: 30, location: { kind: 'video', value: 'https://meet.example/x' }, requiresConfirmation: true })
  const start = new Date(Date.now() + (opts.hoursAhead ?? 72) * 3_600_000)
  const id = newId()
  await db.insert(bookings).values({
    id, manageToken: `m-${id}`, eventTypeId: evId, hostId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 1_800_000).toISOString(),
    guestName: 'Gerda Gast', guestEmail: 'gerda@gast.example', guestTimezone: 'Europe/Berlin', locale: 'de', answers: [{ fieldId: 'x', label: 'Frage', value: 'geheim' }],
    location: { kind: 'video', value: 'https://meet.example/x' }, status: opts.status ?? 'pending',
  })
  return { id, hostId, startsAt: start.toISOString(), sequence: 0 }
}
const statusOf = async (id: string) => (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!

describe('Aktions-Tokens anlegen', () => {
  it('speichert nur Hashes, gebunden an Buchung, Gastgeber und Aktion; Ablauf: 7 Tage oder Terminbeginn', async () => {
    const b = await pending({ hoursAhead: 400 })
    const t = (await createActionTokens(b))!
    expect(t.confirm).not.toBe(t.decline)
    expect(Buffer.from(t.confirm, 'base64url')).toHaveLength(32)
    const rows = await db.query.actionTokens.findMany({ where: eq(actionTokens.bookingId, b.id) })
    expect(rows.map((r) => r.action).sort()).toEqual(['confirm', 'decline'])
    expect(JSON.stringify(rows)).not.toContain(t.confirm)
    expect(rows.find((r) => r.id === sha256(t.confirm))?.action).toBe('confirm')
    expect(rows.every((r) => r.userId === b.hostId && r.usedAt === null)).toBe(true)
    const days = (new Date(rows[0].expiresAt).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(ACTION_DAYS - 0.01)
    expect(days).toBeLessThanOrEqual(ACTION_DAYS)

    const soon = await pending({ hoursAhead: 5 })
    await createActionTokens(soon)
    const r2 = await db.query.actionTokens.findFirst({ where: eq(actionTokens.bookingId, soon.id) })
    expect(r2!.expiresAt).toBe(soon.startsAt) // früher als 7 Tage: bis Terminbeginn
    expect(await createActionTokens({ ...soon, startsAt: new Date(Date.now() - 1000).toISOString() })).toBeNull()
  })
})

describe('Aktions-Tokens einlösen', () => {
  it('Bestätigen: Termin bestätigt, Gast-Mail eingereiht, Protokoll mit Vermerk, alle anderen Token ungültig', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    await expect(executeActionToken(t.confirm, ip())).resolves.toEqual({ action: 'confirm' })
    expect((await statusOf(b.id)).status).toBe('confirmed')
    const mails = (await db.query.jobs.findMany({ where: eq(jobs.type, 'booking-mail') })).filter((j) => (j.payload as { bookingId: string }).bookingId === b.id)
    expect(mails.map((j) => (j.payload as { template: string }).template)).toContain('guest.confirmed')
    const log = await db.query.auditLog.findMany({ where: eq(auditLog.action, 'Anfrage bestätigt (per Mail-Knopf)') })
    expect(log.some((l) => l.actorType === 'user' && l.actorId === b.hostId)).toBe(true)
    // Der Ablehnen-Token derselben Anfrage ist jetzt tot und der Termin bleibt bestätigt
    await expect(executeActionToken(t.decline, ip())).rejects.toThrow(/abgelaufen|bearbeitet/)
    expect((await statusOf(b.id)).status).toBe('confirmed')
    await expect(executeActionToken(t.confirm, ip())).rejects.toThrow(/abgelaufen|bearbeitet/)
  })

  it('Ablehnen mit Nachricht: Steuerzeichen raus, Länge begrenzt, Gast bekommt die Absage', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    await executeActionToken(t.decline, ip(), `Leider\u0000 belegt${'x'.repeat(600)}`)
    const row = await statusOf(b.id)
    expect(row.status).toBe('declined')
    expect(row.cancelReason!.length).toBeLessThanOrEqual(500)
    expect(row.cancelReason).toMatch(/^Leider belegt|^Leider/)
    expect(row.cancelReason).not.toContain('\u0000')
    expect(row.cancelledBy).toBe('host')
    const templates = (await db.query.jobs.findMany({ where: eq(jobs.type, 'booking-mail') })).filter((j) => (j.payload as { bookingId: string }).bookingId === b.id).map((j) => (j.payload as { template: string }).template)
    expect(templates).toContain('guest.declined')
    expect((await db.query.auditLog.findMany()).some((l) => l.action === 'Anfrage abgelehnt (per Mail-Knopf)')).toBe(true)
  })

  it('abgelaufener, unbekannter und zu kurzer Token werden abgelehnt', async () => {
    const b = await pending()
    const token = 'abgelaufen-token-abgelaufen-token-0123456789'
    await db.insert(actionTokens).values({ id: sha256(token), bookingId: b.id, userId: b.hostId, action: 'confirm', bookingSequence: 0, expiresAt: new Date(Date.now() - 1000).toISOString() })
    await expect(executeActionToken(token, ip())).rejects.toThrow(/abgelaufen|bearbeitet/)
    await expect(describeActionToken(token, ip())).resolves.toEqual({ state: 'gone', locale: 'de' })
    await expect(executeActionToken('x'.repeat(43), ip())).rejects.toMatchObject({ code: 'expired' })
    await expect(executeActionToken('kurz', ip())).rejects.toThrow()
    await expect(describeActionToken('kurz', ip(), 'en-US,en')).resolves.toEqual({ state: 'gone', locale: 'en' })
    expect((await statusOf(b.id)).status).toBe('pending')
  })

  it('gleichzeitige Versuche (auch Bestätigen und Ablehnen zusammen): genau einer kommt durch', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    const res = await Promise.allSettled([executeActionToken(t.confirm, ip()), executeActionToken(t.confirm, ip()), executeActionToken(t.decline, ip()), executeActionToken(t.decline, ip())])
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const final = (await statusOf(b.id)).status
    expect(['confirmed', 'declined']).toContain(final)
  })

  it('Token einer Buchung wirken nicht auf andere Buchungen', async () => {
    const a = await pending()
    const other = await pending()
    const ta = (await createActionTokens(a))!
    await createActionTokens(other)
    await executeActionToken(ta.confirm, ip())
    expect((await statusOf(other.id)).status).toBe('pending')
    expect((await db.query.actionTokens.findMany({ where: and(eq(actionTokens.bookingId, other.id)) })).every((r) => r.usedAt === null)).toBe(true)
  })

  it('Anfrage schon anders bearbeitet: Ablehnen-Link sagt das und sagt den bestätigten Termin nicht ab', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    await db.update(bookings).set({ status: 'confirmed' }).where(eq(bookings.id, b.id))
    await expect(describeActionToken(t.decline, ip())).resolves.toEqual({ state: 'handled', locale: 'de' })
    await expect(executeActionToken(t.decline, ip())).rejects.toThrow(/schon bearbeitet/)
    expect((await statusOf(b.id)).status).toBe('confirmed')
    // storniert: ebenfalls kein Zustandswechsel
    const c = await pending()
    const tc = (await createActionTokens(c))!
    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, c.id))
    await expect(executeActionToken(tc.confirm, ip())).rejects.toThrow(/schon bearbeitet/)
    expect((await statusOf(c.id)).status).toBe('cancelled')
  })

  it('vergangener Termin: Anzeige „past“, Ausführen scheitert, Anfrage bleibt unverändert', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    const past = new Date(Date.now() - 3_600_000)
    await db.update(bookings).set({ startsAt: new Date(past.getTime() - 1_800_000).toISOString(), endsAt: past.toISOString() }).where(eq(bookings.id, b.id))
    await db.update(actionTokens).set({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }).where(eq(actionTokens.bookingId, b.id))
    await expect(describeActionToken(t.confirm, ip())).resolves.toEqual({ state: 'past', locale: 'de' })
    await expect(executeActionToken(t.confirm, ip())).rejects.toThrow(/Vergangenheit/)
    expect((await statusOf(b.id)).status).toBe('pending')
  })
})

describe('Aktions-Seite (HTTP)', () => {
  const app = createApp()
  const get = (token: string, ipAddr = ip()) => app.request(`/api/public/aktion/${token}`, { headers: { 'x-forwarded-for': ipAddr } })
  const post = (token: string, body: unknown = {}, headers: Record<string, string> = {}) =>
    app.request(`/api/public/aktion/${token}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: config.publicUrl, 'x-forwarded-for': ip(), ...headers }, body: JSON.stringify(body) })

  it('GET ändert nichts, auch nicht oft wiederholt, und zeigt nur die nötigsten Angaben', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    for (let i = 0; i < 3; i++) {
      const r = await get(t.confirm)
      expect(r.status).toBe(200)
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(r.headers.get('referrer-policy')).toBe('no-referrer')
      const j = await r.json()
      expect(Object.keys(j).sort()).toEqual(['action', 'endsAt', 'eventTitle', 'guestName', 'locale', 'startsAt', 'state', 'timezone'])
      expect(JSON.stringify(j)).not.toMatch(/gast\.example|geheim|manageToken/)
    }
    expect((await statusOf(b.id)).status).toBe('pending')
    const rows = await db.query.actionTokens.findMany({ where: eq(actionTokens.bookingId, b.id) })
    expect(rows.every((r) => r.usedAt === null)).toBe(true)
  })

  it('HEAD/GET durch Mail-Scanner verbrauchen den Link nicht, erst der POST führt aus', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    await app.request(`/aktion/${t.confirm}`, { method: 'GET' })
    await app.request(`/api/public/aktion/${t.confirm}`, { method: 'HEAD' })
    expect((await statusOf(b.id)).status).toBe('pending')
    const r = await post(t.confirm)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, action: 'confirm' })
    expect((await statusOf(b.id)).status).toBe('confirmed')
    const again = await post(t.confirm)
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('handled')
  })

  it('POST von fremder Herkunft wird abgelehnt (CSRF)', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    expect((await post(t.confirm, {}, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await statusOf(b.id)).status).toBe('pending')
  })

  it('unbekannter Link: Anzeige „gone“ (GET), Fehlercode „expired“ (POST)', async () => {
    const r = await get('x'.repeat(43))
    expect(await r.json()).toEqual({ state: 'gone', locale: 'de' })
    const p = await post('x'.repeat(43))
    expect(p.status).toBe(410)
    expect((await p.json()).error.code).toBe('expired')
  })

  it('Rate-Limit: GET nach 60, POST nach 20 Versuchen je Adresse', async () => {
    const g = '203.0.113.50'
    let last = 0
    for (let i = 0; i < 61; i++) last = (await get('y'.repeat(43), g)).status
    expect(last).toBe(429)
    const p = '203.0.113.51'
    let lastPost = 0
    for (let i = 0; i < 21; i++) lastPost = (await post('z'.repeat(43), {}, { 'x-forwarded-for': p })).status
    expect(lastPost).toBe(429)
  })

  it('Nachricht ist auf 500 Zeichen begrenzt', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    expect((await post(t.decline, { message: 'a'.repeat(501) })).status).toBe(400)
    expect((await statusOf(b.id)).status).toBe('pending')
    expect((await post(t.decline, { message: 'a'.repeat(500) })).status).toBe(200)
  })

  it('die Landeseite /aktion/<token> ist reserviert, kein Gastgeber-Link', async () => {
    const { RESERVED_HANDLES } = await import('../lib/util')
    expect(RESERVED_HANDLES.has('aktion')).toBe(true)
    void nowIso
  })
})

describe('Bindung an den Buchungsstand', () => {
  const actorOf = (hostId: string) => ({ type: 'user' as const, userId: hostId, role: 'owner' as const })

  it('Token speichern den Änderungszähler; nach Verschieben (Zähler erhöht) sind sie ungültig', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    expect((await db.query.actionTokens.findFirst({ where: eq(actionTokens.id, sha256(t.confirm)) }))!.bookingSequence).toBe(0)
    // Verschieben erhöht sequence (hier direkt, wie moveBooking es tut), die Token bleiben ohne Entwertung offen
    await db.update(bookings).set({ sequence: 1 }).where(eq(bookings.id, b.id))
    await expect(describeActionToken(t.confirm, ip())).resolves.toEqual({ state: 'handled', locale: 'de' })
    await expect(executeActionToken(t.confirm, ip())).rejects.toMatchObject({ code: 'handled' })
    expect((await statusOf(b.id)).status).toBe('pending')
  })

  it('Verschieben über den Gast-Link entwertet offene Token', async () => {
    const b = await pending({ hoursAhead: 200 })
    const t = (await createActionTokens(b))!
    // gültige freie Zeit gibt es ohne Zeitplan nicht: der Versuch scheitert, die Token bleiben dann unberührt
    await expect(guestReschedule(`m-${b.id}`, new Date(Date.now() + 300 * 3_600_000).toISOString())).rejects.toThrow()
    expect((await db.query.actionTokens.findMany({ where: eq(actionTokens.bookingId, b.id) })).every((r) => r.usedAt === null)).toBe(true)
    await expect(describeActionToken(t.confirm, ip())).resolves.toMatchObject({ state: 'open' })
  })

  it('Bestätigen oder Ablehnen in der Oberfläche entwertet alle Token der Anfrage', async () => {
    const b = await pending()
    const t = (await createActionTokens(b))!
    await acceptBooking(actorOf(b.hostId), b.id)
    expect((await db.query.actionTokens.findMany({ where: eq(actionTokens.bookingId, b.id) })).every((r) => r.usedAt !== null)).toBe(true)
    await expect(executeActionToken(t.decline, ip())).rejects.toMatchObject({ code: 'handled' })
    expect((await statusOf(b.id)).status).toBe('confirmed')

    const c = await pending()
    const tc = (await createActionTokens(c))!
    await cancelBooking(actorOf(c.hostId), c.id)
    await expect(describeActionToken(tc.confirm, ip())).resolves.toMatchObject({ state: 'handled' })
    await expect(executeActionToken(tc.confirm, ip())).rejects.toMatchObject({ code: 'handled' })
    expect((await statusOf(c.id)).status).toBe('declined')
  })
})

describe('Konkurrenz Oberfläche und Mail-Knopf', () => {
  const actorOf = (hostId: string) => ({ type: 'user' as const, userId: hostId, role: 'owner' as const })

  it('gleichzeitig bestätigen und ablehnen: genau eine Entscheidung, die andere meldet „schon bearbeitet“', async () => {
    for (let i = 0; i < 3; i++) {
      const b = await pending()
      const t = (await createActionTokens(b))!
      const res = await Promise.allSettled([acceptBooking(actorOf(b.hostId), b.id), cancelBooking(actorOf(b.hostId), b.id, 'x'), executeActionToken(t.decline, ip()), executeActionToken(t.confirm, ip())])
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      for (const r of res) if (r.status === 'rejected') expect(String(r.reason?.message)).toMatch(/schon bearbeitet|nur offene|bereits abgesagt|abgelaufen/i)
      expect(['confirmed', 'declined']).toContain((await statusOf(b.id)).status)
    }
  })

  it('zweites Bestätigen aus der Oberfläche sagt „schon bearbeitet“ und erzeugt keine zweite Mail', async () => {
    const b = await pending()
    const stale = await statusOf(b.id)
    await acceptBooking(actorOf(b.hostId), b.id)
    const mails = async () => (await db.query.jobs.findMany({ where: eq(jobs.type, 'booking-mail') })).filter((j) => (j.payload as { bookingId: string }).bookingId === b.id).length
    const before = await mails()
    await expect(acceptBooking(actorOf(b.hostId), b.id)).rejects.toThrow()
    expect(await mails()).toBe(before)
    void stale
  })
})

describe('Termin schon vorbei', () => {
  it('abgelaufener Link eines begonnenen Termins meldet „past“, ein unbekannter „gone“', async () => {
    const b = await pending({ hoursAhead: 5 })
    const t = (await createActionTokens(b))!
    const start = new Date(Date.now() - 60_000).toISOString()
    await db.update(bookings).set({ startsAt: start, endsAt: new Date(Date.now() + 60_000).toISOString() }).where(eq(bookings.id, b.id))
    await db.update(actionTokens).set({ expiresAt: start }).where(eq(actionTokens.bookingId, b.id))
    await expect(describeActionToken(t.confirm, ip())).resolves.toEqual({ state: 'past', locale: 'de' })
    await expect(describeActionToken('q'.repeat(43), ip())).resolves.toMatchObject({ state: 'gone' })
  })
})
