import type { Locale } from '@shared/types'

const loc = (l: Locale) => (l === 'de' ? 'de-DE' : 'en-GB')

export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'

export function fmtTime(iso: string, tz: string, l: Locale = 'de', hour12 = false) {
  return new Intl.DateTimeFormat(hour12 ? 'en-US' : loc(l), { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12 }).format(new Date(iso))
}
export function fmtDateLong(iso: string | Date, tz: string, l: Locale = 'de') {
  return new Intl.DateTimeFormat(loc(l), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}
export function fmtDayMonth(iso: string | Date, tz: string, l: Locale = 'de') {
  return new Intl.DateTimeFormat(loc(l), { timeZone: tz, day: 'numeric', month: 'long' }).format(new Date(iso))
}
export function fmtWeekday(iso: string | Date, tz: string, l: Locale = 'de') {
  return new Intl.DateTimeFormat(loc(l), { timeZone: tz, weekday: 'long' }).format(new Date(iso))
}
export function fmtMonthYear(d: Date, l: Locale = 'de') {
  return new Intl.DateTimeFormat(loc(l), { month: 'long', year: 'numeric' }).format(d)
}
/** YYYY-MM-DD eines Zeitpunkts in einer Zeitzone */
export function isoDateIn(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function fmtDuration(min: number, l: Locale = 'de') {
  if (min < 60) return l === 'de' ? `${min} Min.` : `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (l === 'de') return m ? `${h} Std. ${m} Min.` : `${h} Std.`
  return m ? `${h} h ${m} min` : `${h} h`
}
/** Datum (YYYY-MM-DD) + Tage */
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
export function relativeDays(iso: string, tz: string) {
  const today = isoDateIn(new Date(), tz)
  const day = isoDateIn(new Date(iso), tz)
  const diff = Math.round((Date.parse(day) - Date.parse(today)) / 864e5)
  if (diff === 0) return 'heute'
  if (diff === 1) return 'morgen'
  if (diff === -1) return 'gestern'
  return diff > 0 ? `in ${diff} Tagen` : `vor ${-diff} Tagen`
}
