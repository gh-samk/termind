import { DAVClient } from 'tsdav'
import { AppError, invalid } from '../lib/errors'
import { assertPublicUrl, makeSafeFetch } from '../lib/safeFetch'

/** CalDAV-Antworten auf 10 MB begrenzen (tsdav liest Antworten vollständig ein). */
const caldavFetch = makeSafeFetch({ maxBytes: 10 * 1024 * 1024 })

export interface CaldavCreds {
  url: string
  username: string
  password: string
}

function explain(e: unknown): AppError {
  if (e instanceof AppError) return e
  const msg = e instanceof Error ? e.message : String(e)
  if (/401|unauthori[sz]ed|invalid credentials/i.test(msg)) return invalid('Anmeldung abgelehnt (401). Bitte Benutzername und App-Passwort prüfen.')
  if (/403/.test(msg)) return invalid('Zugriff verweigert (403).')
  if (/404|cannot find homeUrl|no principal/i.test(msg)) return invalid('Unter dieser Adresse wurde kein Kalender gefunden. Bei Nextcloud z. B. https://cloud.example.de/remote.php/dav')
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return invalid('Der Server wurde nicht gefunden.')
  if (/abort|timeout/i.test(msg)) return invalid('Der Server hat nicht rechtzeitig geantwortet.')
  return invalid(`Kalender nicht erreichbar: ${msg.slice(0, 160)}`)
}

async function connect(c: CaldavCreds) {
  await assertPublicUrl(c.url)
  const client = new DAVClient({
    serverUrl: c.url,
    credentials: { username: c.username, password: c.password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
    fetch: caldavFetch,
  })
  try {
    await client.login()
  } catch (e) {
    throw explain(e)
  }
  return client
}

const nameOf = (n: unknown) => (typeof n === 'string' && n.trim() ? n.trim() : 'Kalender')

/** Verbindet sich und listet alle Kalender, die Termine (VEVENT) enthalten können. */
export async function discoverCalendars(c: CaldavCreds) {
  const client = await connect(c)
  try {
    const cals = await client.fetchCalendars()
    return cals
      .filter((k) => !k.components || k.components.includes('VEVENT'))
      .map((k) => ({ url: k.url, name: nameOf(k.displayName), color: typeof k.calendarColor === 'string' ? k.calendarColor.slice(0, 7) : undefined }))
  } catch (e) {
    throw explain(e)
  }
}

/** Rohdaten (iCalendar-Texte) aller Termine eines Kalenders im Zeitraum. */
export async function fetchCalendarData(c: CaldavCreds, calendarUrls: string[], from: Date, to: Date) {
  const client = await connect(c)
  const texts: string[] = []
  try {
    for (const url of calendarUrls) {
      const objects = await client.fetchCalendarObjects({ calendar: { url }, timeRange: { start: from.toISOString(), end: to.toISOString() } })
      for (const o of objects) if (typeof o.data === 'string') texts.push(o.data)
    }
  } catch (e) {
    throw explain(e)
  }
  return texts
}

export async function putEvent(c: CaldavCreds, calendarUrl: string, uid: string, ics: string, existing?: { objectUrl: string; etag?: string }) {
  const client = await connect(c)
  try {
    if (existing) {
      const res = await client.updateCalendarObject({ calendarObject: { url: existing.objectUrl, data: ics, etag: existing.etag } })
      if (res.status === 412 || res.status === 404) {
        // Im Kalender geändert oder gelöscht: neu schreiben ohne ETag
        const r2 = await client.updateCalendarObject({ calendarObject: { url: existing.objectUrl, data: ics } })
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`)
        return { objectUrl: existing.objectUrl, etag: r2.headers.get('etag') ?? undefined }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { objectUrl: existing.objectUrl, etag: res.headers.get('etag') ?? undefined }
    }
    const filename = `${uid.replace(/[^a-zA-Z0-9-]/g, '')}.ics`
    const res = await client.createCalendarObject({ calendar: { url: calendarUrl }, filename, iCalString: ics })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { objectUrl: new URL(filename, calendarUrl.endsWith('/') ? calendarUrl : calendarUrl + '/').href, etag: res.headers.get('etag') ?? undefined }
  } catch (e) {
    throw explain(e)
  }
}

export async function deleteEvent(c: CaldavCreds, objectUrl: string, etag?: string) {
  const client = await connect(c)
  try {
    const res = await client.deleteCalendarObject({ calendarObject: { url: objectUrl, etag } })
    if (!res.ok && res.status !== 404 && res.status !== 410 && res.status !== 412) throw new Error(`HTTP ${res.status}`)
    if (res.status === 412) await client.deleteCalendarObject({ calendarObject: { url: objectUrl } })
  } catch (e) {
    throw explain(e)
  }
}
