import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config'
import { createApp } from '../app'
import { db, initDbForTests } from '../test/db'
import { settings } from '../db/schema'

beforeAll(initDbForTests)

const app = createApp()
let n = 0
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: config.publicUrl, 'x-forwarded-for': `192.0.2.${++n}`, ...headers }, body: JSON.stringify(body) })

describe('POST /api/auth/setup/check', () => {
  it('richtiger Code: ok, falscher oder leerer Code: nicht ok', async () => {
    const good = await post('/api/auth/setup/check', { token: config.setupToken })
    expect(good.status).toBe(200)
    expect(await good.json()).toEqual({ ok: true, done: false })
    expect(await (await post('/api/auth/setup/check', { token: config.setupToken + 'x' })).json()).toEqual({ ok: false, done: false })
  })

  it('leerer Code wird nie akzeptiert', async () => {
    expect((await post('/api/auth/setup/check', { token: '' })).status).toBe(400)
    expect((await post('/api/auth/setup', { token: '', name: 'A', email: 'a@example.de', password: 'langes-passwort-1', timezone: 'Europe/Berlin', instanceName: 'X', setupToken: '' })).status).toBe(400)
    const { checkSetupToken } = await import('../services/auth')
    expect((await checkSetupToken('')).ok).toBe(false)
  })

  it('fremde Herkunft wird wie bei allen schreibenden Anfragen abgelehnt (CSRF)', async () => {
    const r = await post('/api/auth/setup/check', { token: config.setupToken }, { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
  })

  it('Rate-Limit: nach 30 Versuchen von derselben Adresse 429', async () => {
    const h = { 'x-forwarded-for': '198.51.100.7' }
    let last = 0
    for (let i = 0; i < 31; i++) last = (await post('/api/auth/setup/check', { token: 'falsch' }, h)).status
    expect(last).toBe(429)
  })

  it('nach der Einrichtung: ok=false, done=true', async () => {
    await db.insert(settings).values({ key: 'setupComplete', value: true })
    expect(await (await post('/api/auth/setup/check', { token: config.setupToken })).json()).toEqual({ ok: false, done: true })
  })
})

describe('Passwort-vergessen-Routen', () => {
  it('liegen hinter dem CSRF-Schutz und antworten auf jede Adresse gleich', async () => {
    const evil = await post('/api/auth/password-reset/request', { email: 'a@example.de' }, { origin: 'https://evil.example' })
    expect(evil.status).toBe(403)
    const a = await post('/api/auth/password-reset/request', { email: 'gibt-es-nicht@example.de' })
    const b = await post('/api/auth/password-reset/request', { email: 'auch-nicht@example.de' })
    expect(a.status).toBe(200)
    expect(await a.json()).toEqual(await b.json())
  })

  it('Einlösen mit falschem Token: verständliche Meldung', async () => {
    const r = await post('/api/auth/password-reset/confirm', { token: 'x'.repeat(43), password: 'ein-langes-passwort' })
    expect(r.status).toBe(400)
    expect((await r.json()).error.message).toMatch(/abgelaufen oder wurde schon benutzt/)
  })
})
