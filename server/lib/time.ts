import { TZDate } from '@date-fns/tz'
import type { DayKey } from '../../shared/types'

const DOW: DayKey[] = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']

export function isValidTimeZone(tz: string) {
  if (typeof tz !== 'string' || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Kanonische Schreibweise (z. B. „europe/berlin“ → „Europe/Berlin“). */
export function canonicalTimeZone(tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 'YYYY-MM-DD' + n Tage (reine Kalenderrechnung, zeitzonenunabhängig). */
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

export function dayKeyOf(date: string, tz: string): DayKey {
  const [y, m, d] = date.split('-').map(Number)
  return DOW[new TZDate(y, m - 1, d, 12, 0, tz).getDay()]
}

/** Lokale Uhrzeit (Minuten seit Mitternacht) an einem Datum in einer Zeitzone → UTC-Date. */
export function zonedToUtc(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, tz).getTime())
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
/** Datum (YYYY-MM-DD) eines Zeitpunkts in einer Zeitzone. */
export function dateInTz(d: Date, tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    if (fmtCache.size < 1000) fmtCache.set(tz, f)
  }
  return f.format(d)
}

export function todayIn(tz: string, now = new Date()) {
  return dateInTz(now, tz)
}

/** Menschlich lesbare Datums-/Zeitangaben für Mails und MCP. */
export function formatDateTime(d: Date, tz: string, locale: 'de' | 'en') {
  const loc = locale === 'de' ? 'de-DE' : 'en-GB'
  const date = new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)
  return { date, time }
}
