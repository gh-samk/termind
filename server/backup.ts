import { chmodSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { config } from './config'

const backupDir = () => resolve(process.env.BACKUP_DIR ?? join(config.dataDir, 'backups'))
const keep = () => {
  const n = Number(process.env.BACKUP_KEEP ?? 7)
  return Number.isInteger(n) && n >= 1 ? n : 7
}

/** Konsistente Kopie der Datenbank per VACUUM INTO (läuft auch bei laufendem Server). */
export async function createBackup(target?: string) {
  const dir = backupDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = resolve(target ?? join(dir, `termind-${new Date().toISOString().replace(/[:.]/g, '-')}.db`))
  if (!/^[\w./-]+$/.test(file)) throw new Error('Ungültiger Dateiname für das Backup.')
  const client = createClient({ url: config.dbUrl })
  try {
    await client.execute({ sql: 'VACUUM INTO ?', args: [file] })
  } finally {
    client.close()
  }
  chmodSync(file, 0o600)
  if (!target) rotate()
  return file
}

function rotate() {
  const dir = backupDir()
  const files = readdirSync(dir)
    .filter((f) => /^termind-.*\.db$/.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(keep())) unlinkSync(join(dir, f))
}

/** Tägliches Backup im Datenverzeichnis (BACKUP_HOURS=0 schaltet es ab). */
export function startBackups() {
  const hours = Number(process.env.BACKUP_HOURS ?? 24)
  if (!Number.isFinite(hours) || hours <= 0) return
  const run = () => void createBackup().catch((e) => console.error('[backup]', e))
  setTimeout(run, 10 * 60_000).unref()
  setInterval(run, hours * 60 * 60_000).unref()
}
