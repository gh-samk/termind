import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { initDbForTests } from '../test/db'
import { makeUser } from '../test/helpers'
import type { Actor } from '../lib/actor'
import { getSetting, PASSWORD_AGAIN, updateSmtp } from '../services/settings'
import { checkSmtpConnection, PRIVATE_SMTP_MESSAGE, resolveSmtpHost } from './transport'

beforeAll(initDbForTests)
afterEach(() => { delete process.env.ALLOW_PRIVATE_HOSTS })

describe('SMTP: keine internen Adressen', () => {
  it('lehnt Loopback, private Netze, Metadaten-Adresse und localhost ab', async () => {
    for (const h of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '169.254.169.254', '::1', 'localhost', 'mail.localhost']) {
      await expect(resolveSmtpHost(h), h).rejects.toThrow(PRIVATE_SMTP_MESSAGE)
    }
  })
  it('erlaubt öffentliche Adressen und mit ALLOW_PRIVATE_HOSTS auch interne', async () => {
    await expect(resolveSmtpHost('93.184.216.34')).resolves.toEqual({ connectHost: '93.184.216.34' })
    process.env.ALLOW_PRIVATE_HOSTS = 'true'
    await expect(resolveSmtpHost('10.1.2.3')).resolves.toEqual({ connectHost: '10.1.2.3' })
  })
  it('Verbindungstest und Speichern lehnen interne Server ab', async () => {
    await expect(checkSmtpConnection({ host: '169.254.169.254', port: 25, security: 'none', user: '', password: 'x' })).rejects.toThrow(PRIVATE_SMTP_MESSAGE)
    const a = { type: 'user', userId: await makeUser('smtp-guard@example.de'), role: 'owner' } as Actor
    await expect(updateSmtp(a, { host: '10.0.0.8', port: 25, security: 'none', user: '', fromName: 'T', fromEmail: 'a@example.de', replyTo: '' })).rejects.toThrow(PRIVATE_SMTP_MESSAGE)
  })
})

describe('SMTP: gespeichertes Passwort nur für denselben Server', () => {
  it('Speichern und Testen verlangen das Passwort neu, wenn sich Server, Port, Verschlüsselung oder Benutzer ändern', async () => {
    const a = { type: 'user', userId: await makeUser('smtp-pw@example.de'), role: 'owner' } as Actor
    const base = { host: '93.184.216.34', port: 587, security: 'starttls' as const, user: 'u', fromName: 'T', fromEmail: 'a@example.de', replyTo: '' }
    await updateSmtp(a, { ...base, password: 'geheim' })
    // gleiche Verbindung, leeres Passwort: bleibt gespeichert
    await updateSmtp(a, { ...base, fromName: 'Neu' })
    expect((await getSetting('smtp'))?.passwordEnc).toBeTruthy()
    for (const change of [{ host: '93.184.216.35' }, { port: 25 }, { user: 'andere' }, { security: 'tls' as const }]) {
      await expect(updateSmtp(a, { ...base, ...change }), JSON.stringify(change)).rejects.toThrow(PASSWORD_AGAIN)
      await expect(checkSmtpConnection({ ...base, ...change }), JSON.stringify(change)).rejects.toThrow(PASSWORD_AGAIN)
    }
    // mit neuem Passwort ist die Änderung erlaubt
    await expect(updateSmtp(a, { ...base, host: '93.184.216.35', password: 'neu' })).resolves.toBeTruthy()
  })
})
