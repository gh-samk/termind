import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Neue Dateien (Datenbank, Backups, Schlüssel) nur für den eigenen Nutzer lesbar
process.umask(0o077)

const isProd = process.env.NODE_ENV === 'production'
const dataDir = resolve(process.env.DATA_DIR ?? './data')
mkdirSync(dataDir, { recursive: true, mode: 0o700 })

function fail(msg: string): never {
  console.error(`\n[termind] ${msg}\n`)
  process.exit(1)
}

/** Schlüssel für die Verschlüsselung gespeicherter Zugangsdaten. Wird beim ersten Start erzeugt. */
function loadSecret(): Buffer {
  const env = process.env.APP_SECRET
  if (env !== undefined) {
    if (env.length < 16) fail('APP_SECRET muss mindestens 16 Zeichen lang sein.')
    return createHash('sha256').update(env, 'utf8').digest()
  }
  const file = join(dataDir, 'secret.key')
  try {
    if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 })
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
    if (key.length !== 32) fail(`${file} ist beschädigt (erwartet 32 Byte).`)
    return key
  } catch (e) {
    fail(`Datenverzeichnis ${dataDir} ist nicht beschreibbar: ${(e as Error).message}`)
  }
}

const port = Number(process.env.PORT ?? 3000)
if (isProd && !process.env.PUBLIC_URL) fail('PUBLIC_URL fehlt. Beispiel: PUBLIC_URL=https://termine.example.de')
const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, '')
try {
  const u = new URL(publicUrl)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error()
  if (isProd && u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) {
    console.warn('[termind] Warnung: PUBLIC_URL ohne https. Passkeys, sichere Cookies und OAuth-Connectors brauchen HTTPS.')
  }
} catch {
  fail(`PUBLIC_URL ist ungültig: ${publicUrl}`)
}

/**
 * Einmaliger Einrichtungsschlüssel: Ohne ihn kann niemand eine frische Instanz übernehmen.
 * SETUP_TOKEN setzen oder den automatisch erzeugten Link aus dem Log verwenden.
 */
function setupToken() {
  if (process.env.SETUP_TOKEN) return process.env.SETUP_TOKEN
  const file = join(dataDir, 'setup-token')
  if (!existsSync(file)) writeFileSync(file, randomBytes(18).toString('base64url'), { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    /* egal */
  }
  return readFileSync(file, 'utf8').trim()
}

export const config = {
  port,
  dataDir,
  dbUrl: process.env.DATABASE_URL ?? `file:${join(dataDir, 'termind.db')}`,
  publicUrl,
  /** Hostname für Passkeys (WebAuthn Relying Party) */
  rpId: process.env.RP_ID ?? new URL(publicUrl).hostname,
  secret: loadSecret(),
  isProd,
  webDir: process.env.WEB_DIR ?? resolve('dist/web'),
  setupToken: setupToken(),
}
