import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { schedules, users } from '../db/schema'
import type { Actor } from '../lib/actor'
import { db, initDbForTests } from '../test/db'
import { makeUser } from '../test/helpers'
import { getOnboarding, setOnboardingHidden } from './onboarding'
import { createDefaultSchedule, updateSchedule } from './schedules'
import { getSetting, setSetting, updateBranding, updateSmtp } from './settings'
import { updateProfile } from './users'

beforeAll(initDbForTests)

const owner = async (email: string) => ({ type: 'user', userId: await makeUser(email), role: 'owner' }) as Actor & { userId: string }

describe('Checkliste „Erste Schritte“', () => {
  it('Pflichtpunkte erst mit echten Kriterien erledigt, Kalender zählt nicht mit', async () => {
    const a = await owner('check@example.de')
    await createDefaultSchedule(a.userId, 'Europe/Berlin')
    let o = await getOnboarding(a)
    expect(o.total).toBe(5)
    expect(o.doneCount).toBe(0)
    expect(o.steps.find((s) => s.id === 'calendar')?.optional).toBe(true)

    // Mail: nur Einstellungen reichen nicht, es braucht auch eine erfolgreiche Testmail
    await updateSmtp(a, { host: 'smtp.example.de', port: 587, security: 'starttls', user: 'u', password: 'pw', fromName: 'T', fromEmail: 'a@example.de', replyTo: '' })
    expect(o.steps.find((s) => s.id === 'mail')?.done).toBe(false)
    expect((await getOnboarding(a)).steps.find((s) => s.id === 'mail')?.done).toBe(false)
    await setSetting('lastSmtpOk', new Date().toISOString())
    expect((await getOnboarding(a)).steps.find((s) => s.id === 'mail')?.done).toBe(true)
    // Neue Zugangsdaten machen die letzte Testmail ungültig
    await updateSmtp(a, { host: 'smtp.anders.de', port: 587, security: 'starttls', user: 'u', password: 'neu', fromName: 'T', fromEmail: 'a@example.de', replyTo: '' })
    expect(await getSetting('lastSmtpOk')).toBe('')
    expect((await getOnboarding(a)).steps.find((s) => s.id === 'mail')?.done).toBe(false)

    // Impressum und Datenschutz: beide Links nötig
    await updateBranding(a, { imprintUrl: 'https://example.de/impressum' })
    expect((await getOnboarding(a)).steps.find((s) => s.id === 'legal')?.done).toBe(false)
    await updateBranding(a, { privacyUrl: 'https://example.de/datenschutz' })
    expect((await getOnboarding(a)).steps.find((s) => s.id === 'legal')?.done).toBe(true)

    // Verfügbarkeit: erst nach dem ersten Speichern
    expect((await getOnboarding(a)).steps.find((s) => s.id === 'availability')?.done).toBe(false)
    await updateSchedule(a, { name: 'Standardzeiten' })
    o = await getOnboarding(a)
    expect(o.steps.find((s) => s.id === 'availability')?.done).toBe(true)
    expect(o.doneCount).toBe(2)
    expect(o.allDone).toBe(false)
  })

  it('Ausblenden wird serverseitig gespeichert; Mitglieder dürfen nicht', async () => {
    const a = await owner('hide@example.de')
    await setOnboardingHidden(a, { hidden: true })
    expect((await getOnboarding(a)).hidden).toBe(true)
    await setOnboardingHidden(a, { hidden: false })
    expect((await getOnboarding(a)).hidden).toBe(false)
    await expect(getOnboarding({ type: 'user', userId: await makeUser('member@example.de'), role: 'member' })).rejects.toThrow()
  })
})

describe('Eine Zeitzone für alles', () => {
  it('Profil ändern zieht den einzigen Verfügbarkeitsplan mit', async () => {
    const a = await owner('tz1@example.de')
    const sid = await createDefaultSchedule(a.userId, 'Europe/Berlin')
    await updateProfile(a, { timezone: 'Europe/London' })
    expect((await db.query.schedules.findFirst({ where: eq(schedules.id, sid) }))?.timezone).toBe('Europe/London')
  })

  it('Verfügbarkeit ändern zieht das Profil mit', async () => {
    const a = await owner('tz2@example.de')
    await createDefaultSchedule(a.userId, 'Europe/Berlin')
    await updateSchedule(a, { timezone: 'Europe/Vienna' })
    expect((await db.query.users.findFirst({ where: eq(users.id, a.userId) }))?.timezone).toBe('Europe/Vienna')
  })

  it('bei mehreren Plänen bleibt jeder, wie er ist', async () => {
    const a = await owner('tz3@example.de')
    const s1 = await createDefaultSchedule(a.userId, 'Europe/Berlin')
    const s2 = await createDefaultSchedule(a.userId, 'Europe/Berlin')
    await updateProfile(a, { timezone: 'Asia/Tokyo' })
    for (const id of [s1, s2]) expect((await db.query.schedules.findFirst({ where: eq(schedules.id, id) }))?.timezone).toBe('Europe/Berlin')
  })
})
