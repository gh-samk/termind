import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createBackup, startBackups } from './backup'
import { config } from './config'
import { initDb } from './db/client'
import { startHousekeeping } from './housekeeping'
import { startWorker } from './mail/queue'
import { purgeExpiredSessions } from './services/auth'
import { startCalendarSync } from './services/calendars'
import { startRetention } from './services/privacy'
import { emergencyReset } from './services/recovery'
import { getSetting } from './services/settings'
import { purgeOldDeliveries } from './services/webhooks'

/* Kommandozeile: `node server/index.js backup [/pfad/datei.db]` */
if (process.argv[2] === 'backup') {
  const file = await createBackup(process.argv[3])
  console.log(`Backup erstellt: ${file}`)
  process.exit(0)
}

/*
 * Notfall: `node server/index.js reset-password du@example.de [--disable-2fa]`
 * Gibt einen Link zum Festlegen eines neuen Passworts aus (30 Minuten gültig) und beendet alle Sitzungen.
 * Es wird nie ein Passwort im Terminal eingegeben oder angezeigt.
 */
if (process.argv[2] === 'reset-password') {
  const email = process.argv[3]
  if (!email || email.startsWith('--')) {
    console.error('Aufruf: node server/index.js reset-password du@example.de [--disable-2fa]')
    process.exit(2)
  }
  await initDb()
  const r = await emergencyReset(email, process.argv.includes('--disable-2fa'))
  if (!r) {
    console.error(`Kein Konto mit der Adresse ${email} gefunden.`)
    process.exit(1)
  }
  console.log(`\n  Alle Sitzungen von ${email} wurden beendet.`)
  if (r.disabled2fa) console.log('  Die Zwei-Faktor-Anmeldung wurde ausgeschaltet. Du kannst sie nach der Anmeldung neu einrichten.')
  console.log(`\n  Link zum Festlegen eines neuen Passworts (30 Minuten gültig, nur einmal verwendbar):\n\n  ${r.link}\n`)
  process.exit(0)
}

await initDb()
await startWorker()
startCalendarSync()
startRetention()
startHousekeeping()
startBackups()
setInterval(() => void purgeOldDeliveries().catch(() => {}), 24 * 60 * 60_000).unref()
setInterval(() => void purgeExpiredSessions().catch(() => {}), 60 * 60_000).unref()

const server = serve({ fetch: createApp().fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`termind läuft auf Port ${info.port} · öffentliche Adresse ${config.publicUrl}`)
  void announceSetup()
})

/* Solange kein Konto existiert, steht der Einrichtungslink alle 10 Minuten wieder im Log (er geht sonst im Startlärm unter). */
async function announceSetup() {
  const show = async () => {
    if (await getSetting('setupComplete')) return false
    console.log(`\n  Einrichtung: ${config.publicUrl}/setup?token=${config.setupToken}\n  (Nur mit diesem Link lässt sich das erste Konto anlegen.)\n`)
    return true
  }
  if (!(await show())) return
  const t = setInterval(() => {
    void show().then((again) => again || clearInterval(t)).catch(() => {})
  }, 10 * 60_000)
  t.unref()
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
