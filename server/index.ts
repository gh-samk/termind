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
import { getSetting } from './services/settings'
import { purgeOldDeliveries } from './services/webhooks'

/* Kommandozeile: `node server/index.js backup [/pfad/datei.db]` */
if (process.argv[2] === 'backup') {
  const file = await createBackup(process.argv[3])
  console.log(`Backup erstellt: ${file}`)
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
  void getSetting('setupComplete').then((done) => {
    if (!done) console.log(`\n  Einrichtung: ${config.publicUrl}/setup?token=${config.setupToken}\n  (Nur mit diesem Link lässt sich das erste Konto anlegen.)\n`)
  })
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
