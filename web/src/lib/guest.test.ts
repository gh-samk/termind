import { describe, expect, it } from 'vitest'
import { defaultH12, fmtTimeRange, googleCalendarUrl, localizeTimezoneGroups, looksLikeEmail, prefillFrom, tzShort } from './guest'

describe('fmtTimeRange', () => {
  // 13:00 UTC = 14:00 Berlin (Winter), 08:00 New York
  const s = '2026-01-15T13:00:00.000Z'
  const e = '2026-01-15T13:30:00.000Z'
  it('deutsch 24 h mit Uhr', () => expect(fmtTimeRange(s, e, 'Europe/Berlin', 'de', false)).toBe('14:00–14:30 Uhr'))
  it('englisch 24 h ohne Uhr', () => expect(fmtTimeRange(s, e, 'Europe/Berlin', 'en', false)).toBe('14:00–14:30'))
  it('12 h nennt am/pm einmal', () => expect(fmtTimeRange(s, e, 'Europe/Berlin', 'en', true)).toBe('2:00–2:30 pm'))
  it('12 h über Mittag nennt beide', () => expect(fmtTimeRange('2026-01-15T10:30:00Z', '2026-01-15T11:30:00Z', 'Europe/Berlin', 'en', true)).toBe('11:30 am–12:30 pm'))
  it('beachtet die Zeitzone', () => expect(fmtTimeRange(s, e, 'America/New_York', 'en', true)).toBe('8:00–8:30 am'))
})

describe('tzShort', () => {
  it('Stadt und Abstand', () => expect(tzShort('Europe/Berlin', new Date('2026-01-15T12:00:00Z'))).toBe('Berlin (UTC+1)'))
  it('Sommerzeit', () => expect(tzShort('Europe/Berlin', new Date('2026-07-15T12:00:00Z'))).toBe('Berlin (UTC+2)'))
  it('UTC ohne Doppelung', () => expect(tzShort('UTC')).toBe('UTC'))
  it('deutsche Städtenamen', () => expect(tzShort('Europe/Vienna', new Date('2026-01-15T12:00:00Z'), 'de')).toBe('Wien (UTC+1)'))
  it('englische Städtenamen', () => expect(tzShort('Europe/Vienna', new Date('2026-01-15T12:00:00Z'), 'en')).toBe('Vienna (UTC+1)'))
})

describe('googleCalendarUrl', () => {
  const base = { title: 'Kennenlernen · Anna', start: '2026-03-02T13:00:00.000Z', durationMin: 30 }
  it('Zeiten in UTC', () => {
    const u = new URL(googleCalendarUrl(base))
    expect(u.searchParams.get('dates')).toBe('20260302T130000Z/20260302T133000Z')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
  })
  it('Ort und Details mit Verwalten-Link, Sonderzeichen bleiben erhalten', () => {
    const u = new URL(googleCalendarUrl({ ...base, location: 'Straße 5 & Hof, Köln', description: 'Zeile 1\nZeile 2 #x=1', footer: 'Termin verwalten: Link in deiner Bestätigungsmail' }))
    expect(u.searchParams.get('location')).toBe('Straße 5 & Hof, Köln')
    const d = u.searchParams.get('details')!
    expect(d).toContain('Zeile 2 #x=1')
    expect(d.endsWith('Termin verwalten: Link in deiner Bestätigungsmail')).toBe(true)
    expect(d).not.toContain('http')
  })
  it('kürzt lange Beschreibungen, der Hinweis bleibt', () => {
    const url = googleCalendarUrl({ ...base, location: 'ä'.repeat(2000), description: 'ö'.repeat(5000), footer: 'Hinweis am Ende' })
    expect(url.length).toBeLessThanOrEqual(2000)
    expect(new URL(url).searchParams.get('details')).toContain('Hinweis am Ende')
  })
  it('ohne Ort und Details keine leeren Parameter', () => {
    const u = new URL(googleCalendarUrl(base))
    expect(u.searchParams.has('location')).toBe(false)
    expect(u.searchParams.has('details')).toBe(false)
  })
})

describe('Kleinkram', () => {
  it('12 h nur englisch und amerikanisch', () => {
    expect(defaultH12('en', 'America/Chicago')).toBe(true)
    expect(defaultH12('de', 'America/Chicago')).toBe(false)
    expect(defaultH12('en', 'Europe/London')).toBe(false)
  })
  it('E-Mail-Plausibilität', () => {
    expect(looksLikeEmail('a@b.de')).toBe(true)
    expect(looksLikeEmail('a@b')).toBe(false)
    expect(looksLikeEmail('a b@c.de')).toBe(false)
  })
  it('Vorbelegung nur aus State, bereinigt und begrenzt', () => {
    expect(prefillFrom({ name: 'Bea', email: 'b@c.de' })).toEqual({ name: 'Bea', email: 'b@c.de' })
    expect(prefillFrom(undefined)).toEqual({ name: '', email: '' })
    expect(prefillFrom({ name: 'x'.repeat(500) }).name).toHaveLength(80)
  })
  it('englische Zeitzonen-Gruppen', () => {
    const g = localizeTimezoneGroups([{ label: 'Europa', zones: [{ id: 'Europe/Berlin', label: 'x' }] }, { label: 'Empfohlen', zones: [{ id: 'Europe/Berlin', label: 'Empfohlen: x' }] }], 'en', new Date('2026-01-15T12:00:00Z'))
    expect(g[0]).toEqual({ label: 'Europe', zones: [{ id: 'Europe/Berlin', label: 'Berlin, UTC+1' }] })
    expect(g[1].zones[0].label).toBe('Recommended: Berlin, UTC+1')
  })
})
