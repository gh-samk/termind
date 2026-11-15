import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { actionTokens, bookings, eventTypes, jobs } from '../db/schema'
import { newId, sha256 } from '../lib/util'
import { executeActionToken } from '../services/actionTokens'
import { db, initDbForTests } from '../test/db'
import { makeUser } from '../test/helpers'
import { enqueueBookingMail, startWorker } from './queue'
import type { OutgoingMail } from './transport'

const sent: OutgoingMail[] = []
vi.mock('./transport', async (orig) => ({ ...(await orig<typeof import('./transport')>()), sendMail: async (m: OutgoingMail) => void sent.push(m) }))

beforeAll(initDbForTests)

describe('Anfrage-Mail an den Gastgeber', () => {
  it('Token entstehen erst beim Erzeugen der Mail, stehen nie in der Warteschlange und funktionieren', async () => {
    const hostId = await makeUser('queue-host@example.de')
    const evId = newId()
    await db.insert(eventTypes).values({ id: evId, userId: hostId, slug: 'q', title: 'Erstgespräch', duration: 30, location: { kind: 'video', value: 'https://meet.example/x' }, requiresConfirmation: true })
    const start = new Date(Date.now() + 5 * 86_400_000)
    const id = newId()
    await db.insert(bookings).values({
      id, manageToken: `m-${id}`, eventTypeId: evId, hostId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 1_800_000).toISOString(),
      guestName: 'Gerda Gast', guestEmail: 'gerda@gast.example', guestTimezone: 'Europe/Berlin', locale: 'de', location: { kind: 'video', value: 'https://meet.example/x' }, status: 'pending',
    })
    await enqueueBookingMail(id, 'guest.requested')
    await enqueueBookingMail(id, 'host.requested')
    expect(await db.query.actionTokens.findMany({ where: eq(actionTokens.bookingId, id) })).toHaveLength(0)

    const stop = await startWorker(25)
    for (let i = 0; i < 100 && sent.length < 2; i++) await new Promise((r) => setTimeout(r, 25))
    stop()
    expect(sent).toHaveLength(2)

    const hostMail = sent.find((m) => m.to.email === 'queue-host@example.de')!
    const guestMail = sent.find((m) => m.to.email === 'gerda@gast.example')!
    expect(guestMail.html).not.toContain('/aktion/')
    const links = [...hostMail.html.matchAll(/href="http:\/\/localhost:3000\/aktion\/([A-Za-z0-9_-]{43})"/g)].map((m) => m[1])
    expect(links).toHaveLength(2)
    expect(hostMail.replyTo).toEqual({ name: 'Gerda Gast', email: 'gerda@gast.example' })

    // In der Datenbank (Warteschlange und Tabelle) steht kein Klartext-Token, nur Hashes
    const dump = JSON.stringify(await db.query.jobs.findMany()) + JSON.stringify(await db.query.actionTokens.findMany())
    for (const t of links) expect(dump).not.toContain(t)
    const rows = await db.query.actionTokens.findMany({ where: eq(actionTokens.bookingId, id) })
    expect(rows.map((r) => r.id).sort()).toEqual(links.map(sha256).sort())
    expect((await db.query.jobs.findMany({ where: eq(jobs.type, 'booking-mail') })).every((j) => !JSON.stringify(j.payload).includes('aktion'))).toBe(true)

    // Der Bestätigen-Link aus der Mail klappt
    const confirmUrl = /href="[^"]*\/aktion\/([A-Za-z0-9_-]{43})"[^>]*>Bestätigen</.exec(hostMail.html)![1]
    await expect(executeActionToken(confirmUrl, '10.9.9.9')).resolves.toEqual({ action: 'confirm' })
    expect((await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!.status).toBe('confirmed')
  })
})
