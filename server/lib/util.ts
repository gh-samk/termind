import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { config } from '../config'

export const newId = () => randomUUID()
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const nowIso = () => new Date().toISOString()

/** AES-256-GCM für gespeicherte Zugangsdaten (z. B. SMTP-Passwort). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', config.secret, iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.')
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split('.')
  if (v !== 'v1') throw new Error('Unbekanntes Format')
  const d = createDecipheriv('aes-256-gcm', config.secret, Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8')
}

/** Pfade, die nicht als persönlicher Link (Handle) vergeben werden dürfen. */
export const RESERVED_HANDLES = new Set(['admin', 'login', 'setup', 'api', 'mcp', 'oauth', 'b', 'embed', 'assets', 'healthz', 'well-known', 'static', 'public', 'termind', 'passwort-neu', 'aktion'])

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
