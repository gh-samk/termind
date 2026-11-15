import { describe, expect, it } from 'vitest'
import { portAfterSecurityChange, providerForHost, SMTP_PROVIDERS } from './smtpProviders'
import { cityName, timezoneGroups, timezoneLabel, timezoneName, utcOffset } from './timezones'

const winter = new Date('2026-01-15T12:00:00Z')
const summer = new Date('2026-07-15T12:00:00Z')

describe('Zeitzonen-Anzeige', () => {
  it('Abstand zu UTC, mit Sommerzeit, halben Stunden und Minuszeichen', () => {
    expect(utcOffset('Europe/Berlin', winter)).toBe('UTC+1')
    expect(utcOffset('Europe/Berlin', summer)).toBe('UTC+2')
    expect(utcOffset('Asia/Kolkata', winter)).toBe('UTC+5:30')
    expect(utcOffset('America/New_York', winter)).toBe('UTC−5')
    expect(utcOffset('UTC', winter)).toBe('UTC')
    expect(utcOffset('Gibt/Es_Nicht', winter)).toBe('')
  })

  it('Klarnamen für häufige Zonen, Städtenamen für den Rest', () => {
    expect(timezoneName('Europe/Berlin')).toBe('Deutschland (Berlin)')
    expect(timezoneName('Europe/Vienna')).toBe('Österreich (Wien)')
    expect(timezoneName('Europe/Zurich')).toBe('Schweiz (Zürich)')
    expect(timezoneName('Asia/Tokyo')).toBe('Tokyo')
    expect(cityName('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
    expect(timezoneLabel('Europe/Berlin', winter)).toBe('Deutschland (Berlin), UTC+1')
    expect(timezoneLabel('America/Sao_Paulo', winter)).toBe('Sao Paulo, UTC−3')
  })

  it('Gruppen: Empfohlen zuerst, dann Häufig, dann Erdteile; jede Zone nur einmal', () => {
    const all = ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Asia/Tokyo', 'America/Denver', 'Africa/Cairo', 'Pacific/Auckland']
    const g = timezoneGroups(all, { recommended: 'Asia/Tokyo', at: winter })
    expect(g.map((x) => x.label)).toEqual(['Empfohlen', 'Häufig', 'Amerika', 'Afrika', 'Pazifik'])
    expect(g[0].zones).toEqual([{ id: 'Asia/Tokyo', label: 'Empfohlen: Tokyo, UTC+9' }])
    const ids = g.flatMap((x) => x.zones.map((z) => z.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('Europe/Berlin')
    expect(g[1].zones[0].label).toBe('Deutschland (Berlin), UTC+1')
  })

  it('unbekannte, aber gespeicherte Zone bleibt auswählbar', () => {
    const g = timezoneGroups(['Europe/Berlin'], { current: 'Etc/Weird', at: winter })
    expect(g[0].label).toBe('Aktuell eingestellt')
    expect(g[0].zones[0].id).toBe('Etc/Weird')
  })

  it('ohne Empfehlung keine Empfohlen-Gruppe', () => {
    expect(timezoneGroups(['Europe/Berlin'], { at: winter }).some((g) => g.label === 'Empfohlen')).toBe(false)
  })
})

describe('Mail-Anbieter', () => {
  it('Wechsel der Verschlüsselung passt Standardports an, eigene Ports bleiben', () => {
    expect(portAfterSecurityChange(587, 'tls')).toBe(465)
    expect(portAfterSecurityChange(465, 'starttls')).toBe(587)
    expect(portAfterSecurityChange(2525, 'tls')).toBe(2525)
    expect(portAfterSecurityChange(587, 'none')).toBe(587)
  })

  it('Vorlagen: freigegebene Werte, kein Server bei All-Inkl und Sonstiges', () => {
    const by = Object.fromEntries(SMTP_PROVIDERS.map((p) => [p.id, p]))
    expect([by.mailbox.host, by.mailbox.port, by.mailbox.security]).toEqual(['smtp.mailbox.org', 465, 'tls'])
    expect([by.ionos.host, by.ionos.port, by.ionos.security]).toEqual(['smtp.ionos.de', 587, 'starttls'])
    expect([by.strato.host, by.strato.port, by.strato.security]).toEqual(['smtp.strato.de', 465, 'tls'])
    expect([by.hetzner.host, by.hetzner.port]).toEqual(['mail.your-server.de', 587])
    expect(by.allinkl.host).toBe('')
    expect(by.other.host).toBe('')
    expect(providerForHost(' SMTP.GMAIL.COM ')?.id).toBe('google')
    expect(providerForHost('')).toBeUndefined()
  })
})
