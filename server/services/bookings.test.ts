import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { jobs } from '../db/schema'
import type { Actor } from '../lib/actor'
import { db, initDbForTests } from '../test/db'
import { makeUser } from '../test/helpers'
import { cancelBooking, createBooking, getBooking, getSlots, guestHistory, guestReschedule, listBookings, rescheduleBooking } from './bookings'
import { createEventType, getEventType } from './eventTypes'
import { createDefaultSchedule } from './schedules'

beforeAll(initDbForTests)

type Host = Actor & { userId: string }
const host = async (email: string) => {
  const userId = await makeUser(email)
  await createDefaultSchedule(userId, 'Europe/Berlin')
  return { type: 'user', userId, role: 'owner' } as Host
}
const eventOf = (a: Host, title = 'Erstgespräch') =>
  createEventType(a, { title, duration: 30, location: { kind: 'onsite', value: 'Hauptstr. 1' }, minNoticeMinutes: 0, bufferAfter: 0 })

/** Alle freien Zeiten der nächsten drei Wochen, sortiert */
async function freeSlots(a: Host, eventTypeId: string) {
  const ev = await getEventType(a, eventTypeId)
  const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
  const map = await getSlots(ev, day(1), day(21), 'Europe/Berlin')
  return Object.values(map).flat().sort()
}

const mailsFor = async (bookingId: string) =>
  (await db.select().from(jobs)).filter((j) => j.type === 'booking-mail' && (j.payload as { bookingId?: string }).bookingId === bookingId).map((j) => (j.payload as { template: string }).template)
const remindersFor = async (bookingId: string) => (await mailsFor(bookingId)).filter((t) => t === 'guest.reminder').length

const input = (eventTypeId: string, start: string, extra: Record<string, unknown> = {}) => ({ eventTypeId, start, name: 'Max Muster', email: 'Max@Example.de', timezone: 'Europe/Berlin', ...extra })

describe('Termin eintragen (Gastgeber)', () => {
  it('mit Benachrichtigung: Bestätigung und Erinnerungen an den Gast, Notiz gespeichert', async () => {
    const a = await host('eintragen1@example.de')
    const ev = await eventOf(a)
    const [start] = await freeSlots(a, ev.id)
    const b = await createBooking(a, input(ev.id, start, { note: 'Am Telefon vereinbart' }))
    expect(b.status).toBe('confirmed')
    expect(b.createdVia).toBe('admin')
    expect((await getBooking(a, b.id)).note).toBe('Am Telefon vereinbart')
    const mails = await mailsFor(b.id)
    expect(mails).toContain('guest.confirmed')
    expect(await remindersFor(b.id)).toBeGreaterThan(0)
  })

  it('ohne Benachrichtigung: keine Mail und keine Erinnerung an den Gast', async () => {
    const a = await host('eintragen2@example.de')
    const ev = await eventOf(a)
    const [, start] = await freeSlots(a, ev.id)
    const b = await createBooking(a, input(ev.id, start, { notifyGuest: false }))
    const mails = await mailsFor(b.id)
    expect(mails).not.toContain('guest.confirmed')
    expect(await remindersFor(b.id)).toBe(0)
    expect(mails).toContain('host.new')
  })

  it('Gäste können die Benachrichtigung nicht abschalten', async () => {
    const a = await host('eintragen3@example.de')
    const ev = await eventOf(a)
    const [start] = await freeSlots(a, ev.id)
    const b = await createBooking({ type: 'guest' }, input(ev.id, start, { notifyGuest: false, anyTime: true, note: 'x', consent: true }))
    expect(await mailsFor(b.id)).toContain('guest.confirmed')
    expect(b.note).toBe('')
  })

  it('Konflikt: dieselbe Zeit ist nicht doppelt buchbar, auch nicht mit „andere Zeit“', async () => {
    const a = await host('eintragen4@example.de')
    const ev = await eventOf(a)
    const [start] = await freeSlots(a, ev.id)
    await createBooking(a, input(ev.id, start))
    await expect(createBooking(a, input(ev.id, start))).rejects.toMatchObject({ code: 'slot_taken' })
    await expect(createBooking(a, input(ev.id, start, { anyTime: true }))).rejects.toMatchObject({ code: 'slot_taken' })
  })

  it('außerhalb der Verfügbarkeit nur mit „andere Zeit“, nie in der Vergangenheit', async () => {
    const a = await host('eintragen5@example.de')
    const ev = await eventOf(a)
    const night = new Date(Date.now() + 5 * 864e5)
    night.setUTCHours(2, 0, 0, 0)
    await expect(createBooking(a, input(ev.id, night.toISOString()))).rejects.toMatchObject({ code: 'slot_taken' })
    const b = await createBooking(a, input(ev.id, night.toISOString(), { anyTime: true }))
    expect(b.status).toBe('confirmed')
    await expect(createBooking(a, input(ev.id, new Date(Date.now() - 864e5).toISOString(), { anyTime: true }))).rejects.toThrow()
  })

  it('fremde Terminseite ist nicht auffindbar', async () => {
    const a = await host('eintragen6@example.de')
    const other = await host('eintragen7@example.de')
    const ev = await eventOf(other)
    const [start] = await freeSlots(other, ev.id)
    await expect(createBooking(a, input(ev.id, start))).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('Verschieben durch den Gastgeber', () => {
  it('auf freie Zeit, mit Nachricht; Konflikt wird verständlich gemeldet', async () => {
    const a = await host('verschieben1@example.de')
    const ev = await eventOf(a)
    const [s1, s2, s3] = await freeSlots(a, ev.id)
    const b = await createBooking(a, input(ev.id, s1))
    const other = await createBooking(a, input(ev.id, s3, { name: 'Anna' }))
    const moved = await rescheduleBooking(a, b.id, s2, 'Mir kam etwas dazwischen')
    expect(moved.startsAt).toBe(new Date(s2).toISOString())
    expect(moved.cancelReason).toBe('Mir kam etwas dazwischen')
    expect(await mailsFor(b.id)).toContain('guest.rescheduled')
    await expect(rescheduleBooking(a, b.id, s3)).rejects.toMatchObject({ code: 'slot_taken', message: expect.stringContaining('nicht frei') })
    expect((await getBooking(a, other.id)).startsAt).toBe(new Date(s3).toISOString())
  })

  it('eigene bisherige Zeit zählt beim Prüfen nicht als belegt (exclude)', async () => {
    const a = await host('verschieben2@example.de')
    const ev = await eventOf(a)
    const [s1] = await freeSlots(a, ev.id)
    const b = await createBooking(a, input(ev.id, s1))
    const day = s1.slice(0, 10)
    expect(Object.values(await getSlots(ev, day, day, 'Europe/Berlin')).flat()).not.toContain(s1)
    expect(Object.values(await getSlots(ev, day, day, 'Europe/Berlin', b.id)).flat()).toContain(s1)
  })

  it('andere Zeit nur mit anyTime, fremde Termine nicht verschiebbar', async () => {
    const a = await host('verschieben3@example.de')
    const stranger = await host('verschieben4@example.de')
    const ev = await eventOf(a)
    const [s1] = await freeSlots(a, ev.id)
    const b = await createBooking(a, input(ev.id, s1))
    const night = new Date(Date.now() + 6 * 864e5)
    night.setUTCHours(2, 0, 0, 0)
    await expect(rescheduleBooking(a, b.id, night.toISOString())).rejects.toMatchObject({ code: 'slot_taken' })
    expect((await rescheduleBooking(a, b.id, night.toISOString(), undefined, { anyTime: true })).startsAt).toBe(night.toISOString())
    await expect(rescheduleBooking(stranger, b.id, s1)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('Frühere Termine eines Gastes', () => {
  it('nur eigene, nur frühere, begrenzt auf 20, mit Gesamtzahl', async () => {
    const a = await host('historie1@example.de')
    const stranger = await host('historie2@example.de')
    const ev = await eventOf(a)
    const evOther = await eventOf(stranger)
    const slots = await freeSlots(a, ev.id)
    // 22 frühere Termine am selben Tag zu je einer anderen Zeit, plus einer später
    const picks = slots.slice(0, 23)
    for (const s of picks) await createBooking(a, input(ev.id, s))
    const all = await listBookings(a, { view: 'all' })
    const latest = all.sort((x, y) => y.startsAt.localeCompare(x.startsAt))[0]
    // gleicher Gast bei einem anderen Gastgeber taucht nicht auf
    const [os] = await freeSlots(stranger, evOther.id)
    await createBooking(stranger, input(evOther.id, os))
    const h = await guestHistory(a, latest.id)
    expect(h.total).toBe(22)
    expect(h.items).toHaveLength(20)
    expect(h.items[0].startsAt > h.items[19].startsAt).toBe(true)
    expect(h.items.every((x) => x.startsAt < latest.startsAt)).toBe(true)
    // der andere Gastgeber darf den Termin nicht einmal ansehen
    await expect(guestHistory(stranger, latest.id)).rejects.toMatchObject({ code: 'not_found' })
    // Gäste ohne Anmeldung auch nicht
    await expect(guestHistory({ type: 'guest' }, latest.id)).rejects.toThrow()
  })
})

describe('Filter der Terminliste', () => {
  it('Abgesagte stehen nicht unter „Vergangen“, sondern unter „Abgesagt“; Terminseite und Zeitraum filtern', async () => {
    const a = await host('filter1@example.de')
    const evA = await eventOf(a, 'Seite A')
    const evB = await eventOf(a, 'Seite B')
    const [s1, s2, s3] = await freeSlots(a, evA.id)
    const x = await createBooking(a, input(evA.id, s1))
    const y = await createBooking(a, input(evB.id, s2, { name: 'Bea' }))
    const z = await createBooking(a, input(evA.id, s3, { name: 'Cem' }))

    // Vergangene Termine direkt in der Datenbank herstellen (Zeitreise ist über den Service nicht möglich)
    const { bookings } = await import('../db/schema')
    const past = (n: number) => new Date(Date.now() - n * 864e5)
    const set = async (id: string, startsAt: Date, status: 'confirmed' | 'cancelled' | 'declined') =>
      db.update(bookings).set({ startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(), status }).where(eq(bookings.id, id))
    await set(x.id, past(3), 'confirmed')
    await set(y.id, past(2), 'cancelled')
    await set(z.id, past(10), 'declined')

    const ids = async (f: Parameters<typeof listBookings>[1]) => (await listBookings(a, f)).map((b) => b.id)
    expect(await ids({ view: 'past' })).toEqual([x.id])
    expect((await ids({ view: 'cancelled' })).sort()).toEqual([y.id, z.id].sort())
    expect(await ids({ view: 'upcoming' })).toEqual([])
    expect(await ids({ view: 'cancelled', eventTypeId: evB.id })).toEqual([y.id])
    expect(await ids({ view: 'cancelled', from: past(5).toISOString() })).toEqual([y.id])
    expect(await ids({ view: 'cancelled', to: past(5).toISOString() })).toEqual([z.id])
  })
})

describe('Still eingetragene Termine (ohne Benachrichtigung)', () => {
  it('Verschieben und Absagen schicken dem Gast nichts, dem Gastgeber weiter alles', async () => {
    const a = await host('still1@example.de')
    const ev = await eventOf(a)
    const [s1, s2] = await freeSlots(a, ev.id)
    const b = await createBooking(a, input(ev.id, s1, { notifyGuest: false }))
    expect(b.notifyGuest).toBe(false)
    await rescheduleBooking(a, b.id, s2, 'Neue Zeit')
    expect(await remindersFor(b.id)).toBe(0)
    await cancelBooking(a, b.id)
    const mails = await mailsFor(b.id)
    expect(mails.filter((t) => t.startsWith('guest.'))).toEqual([])
    expect(mails).toContain('host.new')
  })

  it('mit Benachrichtigung bekommt der Gast beides', async () => {
    const a = await host('still2@example.de')
    const ev = await eventOf(a)
    const [s1, s2] = await freeSlots(a, ev.id)
    const b = await createBooking(a, input(ev.id, s1))
    await rescheduleBooking(a, b.id, s2)
    await cancelBooking(a, b.id)
    const mails = await mailsFor(b.id)
    expect(mails).toContain('guest.rescheduled')
    expect(mails).toContain('guest.cancelled')
  })
})

describe('Verschieben durch Gäste', () => {
  it('verschiebt der Gast eine offene Anfrage, geht eine neue Anfrage raus statt einer Verschiebe-Mail', async () => {
    const a = await host('gast1@example.de')
    const ev = await createEventType(a, { title: 'Mit Bestätigung', duration: 30, location: { kind: 'onsite', value: 'Hier' }, minNoticeMinutes: 0, requiresConfirmation: true })
    const [s1, s2] = await freeSlots(a, ev.id)
    const b = await createBooking({ type: 'guest' }, input(ev.id, s1, { consent: true }))
    expect(b.status).toBe('pending')
    await guestReschedule(b.manageToken, s2)
    const moved = await getBooking(a, b.id)
    expect(moved.status).toBe('pending')
    const mails = await mailsFor(b.id)
    expect(mails.filter((t) => t === 'guest.requested')).toHaveLength(2)
    expect(mails.filter((t) => t === 'host.requested')).toHaveLength(2)
    expect(mails).not.toContain('guest.rescheduled')
    expect(mails).not.toContain('host.rescheduled')
  })

  it('Grenze zählt nur Verschiebungen des Gasts, nicht Statuswechsel oder Gastgeber', async () => {
    const a = await host('gast2@example.de')
    const ev = await eventOf(a)
    const [s1, s2, s3] = await freeSlots(a, ev.id)
    const b = await createBooking({ type: 'guest' }, input(ev.id, s1, { consent: true }))
    // Gastgeber verschiebt oft: zählt nicht
    for (let i = 0; i < 12; i++) await rescheduleBooking(a, b.id, i % 2 ? s1 : s2)
    expect((await getBooking(a, b.id)).guestMoves).toBe(0)
    for (let i = 0; i < 10; i++) await guestReschedule(b.manageToken, i % 2 ? s2 : s3)
    expect((await getBooking(a, b.id)).guestMoves).toBe(10)
    await expect(guestReschedule(b.manageToken, s1)).rejects.toThrow(/sehr oft/)
    // Gastgeber darf trotzdem
    await rescheduleBooking(a, b.id, s1)
  })
})
