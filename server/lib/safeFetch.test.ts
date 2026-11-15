import { afterEach, describe, expect, it } from 'vitest'
import { assertPublicUrl, isPrivateIp } from './safeFetch'

describe('SSRF-Schutz', () => {
  afterEach(() => delete process.env.ALLOW_PRIVATE_HOSTS)
  it('erkennt interne Adressen in allen Schreibweisen', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:a9fe:a9fe', '64:ff9b::7f00:1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
    for (const ip of ['1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:1.1.1.1']) expect(isPrivateIp(ip), ip).toBe(false)
  })
  it('blockt interne URLs', async () => {
    for (const u of ['https://127.0.0.1/x', 'https://[::ffff:7f00:1]/', 'https://169.254.169.254/latest', 'https://localhost/', 'https://foo.internal/', 'https://user:pw@example.org/']) {
      await expect(assertPublicUrl(u), u).rejects.toThrow()
    }
  })
  it('verlangt https und erlaubt webcal', async () => {
    await expect(assertPublicUrl('http://example.org/cal.ics')).rejects.toThrow(/https/)
    await expect(assertPublicUrl('ftp://example.org')).rejects.toThrow()
    expect((await assertPublicUrl('webcal://1.1.1.1/cal.ics')).protocol).toBe('https:')
  })
  it('ALLOW_PRIVATE_HOSTS gilt nicht für erzwungen öffentliche Abrufe', async () => {
    process.env.ALLOW_PRIVATE_HOSTS = 'true'
    expect((await assertPublicUrl('http://192.168.1.10:5232/')).hostname).toBe('192.168.1.10')
    await expect(assertPublicUrl('http://192.168.1.10/', { forcePublic: true })).rejects.toThrow()
  })
})
