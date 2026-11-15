import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* Jede Testdatei bekommt ein eigenes, leeres Datenverzeichnis (Datenbank, Schlüssel, Einrichtungscode). */
const dir = mkdtempSync(join(tmpdir(), 'termind-test-'))
process.env.DATA_DIR = dir
process.env.DATABASE_URL = `file:${join(dir, 'termind.db')}`
process.env.APP_SECRET = 'test-secret-nur-fuer-tests'
process.env.PUBLIC_URL = 'http://localhost:3000'
process.env.WEB_DIR = join(dir, 'kein-web')
process.env.TRUST_PROXY = 'true' // Tests setzen die Client-Adresse über X-Forwarded-For
