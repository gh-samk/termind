import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { v } from './validate'

const app = new Hono()
  .post('/x', v('json', z.object({ name: z.string().min(1, 'Bitte einen Namen angeben'), age: z.number() })), (c) => c.json(c.req.valid('json')))
  .get('/q', v('query', z.object({ from: z.string().regex(/^\d{4}$/, 'Jahr im Format JJJJ') })), (c) => c.json(c.req.valid('query')))

const post = (body: unknown) => app.request('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('Validator-Wrapper', () => {
  it('lässt gültige Eingaben durch', async () => {
    const res = await post({ name: 'Anna', age: 3 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'Anna', age: 3 })
  })
  it('liefert Fehler im Format { error: { code, message } } mit Status 400', async () => {
    const res = await post({ name: '', age: 3 })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: { code: 'invalid', message: 'Bitte einen Namen angeben' } })
  })
  it('zeigt eigene Meldungen aus Query-Schemas', async () => {
    const res = await app.request('/q?from=abc')
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('Jahr im Format JJJJ')
  })
  it('nutzt deutsche Standardtexte und gibt kein rohes Zod-Ergebnis zurück', async () => {
    const res = await post({ name: 'Anna', age: 'x' })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(Object.keys(body)).toEqual(['error'])
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message'])
    expect(body.error.message).not.toMatch(/Invalid|expected|received|erwartet|erhalten/)
  })
})

describe('Fehlerbehandlung in der App', () => {
  it('liefert bei kaputtem oder leerem JSON 400 mit code invalid', async () => {
    const { createApp } = await import('../app')
    const app = createApp()
    for (const body of ['{kaputt', '']) {
      const res = await app.request('/api/public/b/abc/cancel', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: { code: 'invalid', message: 'Ungültiges JSON.' } })
    }
  })
  it('meldet fehlende Pflichtfelder auf Deutsch', async () => {
    const res = await post({ age: 3 })
    expect((await res.json()).error.message).toBe('Bitte fülle alle Pflichtfelder aus.')
  })
})
