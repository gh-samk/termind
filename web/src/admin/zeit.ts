import { addDays } from '../lib/format'

/** Wandzeit (Datum + HH:MM) in einer Zeitzone als ISO-Zeitpunkt (UTC). */
export function zonedToIso(date: string, time: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  const offset = (t: number) => {
    const parts = fmt.formatToParts(new Date(t))
    const n = (k: string) => Number(parts.find((p) => p.type === k)!.value)
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - t
  }
  const guess = Date.parse(`${date}T${time}:00Z`)
  // Zweiter Durchgang fängt Sommer-/Winterzeitwechsel ab
  const first = guess - offset(guess)
  return new Date(guess - offset(first)).toISOString()
}

/** Beginn eines Tages (in tz) und Beginn des Folgetags, für Zeitraumfilter. */
export const dayStartIso = (date: string, tz: string) => zonedToIso(date, '00:00', tz)
export const dayEndIso = (date: string, tz: string) => zonedToIso(addDays(date, 1), '00:00', tz)

export function fmtShortDate(iso: string, tz: string) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

/** Gibt es diese Ortszeit wirklich? Bei der Umstellung auf Sommerzeit fällt eine Stunde aus. */
export function localTimeExists(date: string, time: string, tz: string): boolean {
  const iso = zonedToIso(date, time, tz)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso))
  const g = (k: string) => p.find((x) => x.type === k)!.value
  return `${g('year')}-${g('month')}-${g('day')}` === date && `${g('hour')}:${g('minute')}` === time
}
