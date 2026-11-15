import type { Locale } from '@shared/types'
import { cityName, cityNameDe, utcOffset, type TimezoneGroup } from '@shared/timezones'

/* Reine Hilfen für die Gastseiten (keine React-Abhängigkeit, darum einzeln testbar). */

/** 12-Stunden-Anzeige als Voreinstellung: nur englisch und in amerikanischen Zeitzonen. */
export function defaultH12(locale: Locale, tz: string): boolean {
  return locale === 'en' && tz.startsWith('America')
}

/** Kurzer, lesbarer Zeitzonenname: „Berlin (UTC+1)“, „UTC“. Der Abstand gilt für den Zeitpunkt `at` (Sommerzeit). */
export function tzShort(tz: string, at: Date = new Date(), locale: Locale = 'de'): string {
  const off = utcOffset(tz, at)
  const name = locale === 'de' ? cityNameDe(tz) : cityName(tz)
  if (!off || name === off) return name
  return `${name} (${off})`
}

const normalize = (s: string) => s.replace(/[  ]/g, ' ')

/**
 * Zeitspanne mit Start UND Ende:
 *   de, 24 h  → „14:00–14:30 Uhr“
 *   en, 24 h  → „14:00–14:30“
 *   12 h      → „2:00–2:30 pm“ (gleiche Tageshälfte wird nur einmal genannt)
 */
export function fmtTimeRange(startIso: string, endIso: string, tz: string, locale: Locale, h12: boolean): string {
  if (h12) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })
    const split = (iso: string) => {
      const m = /^(.*?)\s*([AP]M)$/i.exec(normalize(f.format(new Date(iso))))
      return { t: m?.[1] ?? '', p: (m?.[2] ?? '').toLowerCase() }
    }
    const a = split(startIso)
    const b = split(endIso)
    return a.p === b.p ? `${a.t}–${b.t} ${b.p}` : `${a.t} ${a.p}–${b.t} ${b.p}`
  }
  const f = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  const range = `${normalize(f.format(new Date(startIso)))}–${normalize(f.format(new Date(endIso)))}`
  return locale === 'de' ? `${range} Uhr` : range
}

export const addMinutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString()

/* ---------------- Google Kalender ---------------- */

const GOOGLE_URL_MAX = 1800
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).trimEnd() + '…')

export interface GoogleEvent {
  title: string
  start: string
  durationMin: number
  /** Ort, Adresse oder Video-Link */
  location?: string
  /** Beschreibung der Terminseite */
  description?: string
  /** Kurzer Hinweis am Ende der Details (kein Link mit Zugriffsschlüssel, der landet sonst bei Google) */
  footer?: string
}

/** Link „Zu Google Kalender hinzufügen“, korrekt kodiert und in der Länge begrenzt (Beschreibung wird zuerst gekürzt). */
export function googleCalendarUrl(ev: GoogleEvent): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const s = new Date(ev.start)
  const e = new Date(s.getTime() + ev.durationMin * 60_000)
  const tail = ev.footer ?? ''
  const build = (descLimit: number) => {
    const desc = cut((ev.description ?? '').trim(), descLimit)
    const details = [desc, tail].filter(Boolean).join('\n\n')
    const p = new URLSearchParams({ action: 'TEMPLATE', text: cut(ev.title, 200), dates: `${f(s)}/${f(e)}` })
    if (ev.location) p.set('location', cut(ev.location, 150))
    if (details) p.set('details', details)
    return `https://calendar.google.com/calendar/render?${p}`
  }
  let limit = 800
  let url = build(limit)
  while (url.length > GOOGLE_URL_MAX && limit > 0) {
    limit = Math.floor(limit / 2)
    url = build(limit)
  }
  return url
}

/* ---------------- Zeitzonen-Auswahl in der Sprache des Gastes ---------------- */

const GROUP_EN: Record<string, string> = {
  'Aktuell eingestellt': 'Current',
  Empfohlen: 'Recommended',
  Häufig: 'Common',
  Europa: 'Europe',
  Amerika: 'Americas',
  Asien: 'Asia',
  Afrika: 'Africa',
  Australien: 'Australia',
  Pazifik: 'Pacific',
  Atlantik: 'Atlantic',
  'Indischer Ozean': 'Indian Ocean',
  Antarktis: 'Antarctica',
  Arktis: 'Arctic',
  Sonstige: 'Other',
}

/** Gruppen aus shared/timezones.ts (deutsch) für englische Gäste übersetzen: Erdteile und „Stadt, UTC+1“. */
export function localizeTimezoneGroups(groups: TimezoneGroup[], locale: Locale, at: Date = new Date()): TimezoneGroup[] {
  if (locale === 'de') return groups
  return groups.map((g) => ({
    label: GROUP_EN[g.label] ?? g.label,
    zones: g.zones.map((z) => {
      const off = utcOffset(z.id, at)
      const name = cityName(z.id)
      const base = off && off !== name ? `${name}, ${off}` : name
      return { id: z.id, label: z.label.startsWith('Empfohlen: ') ? `Recommended: ${base}` : base }
    }),
  }))
}

/** Datum (YYYY-MM-DD) eines Zeitpunkts in einer Zeitzone. */
export const dayIn = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** Einfache Plausibilitätsprüfung der E-Mail-Adresse (die genaue Prüfung macht der Server). */
export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

/** Vorbelegung aus dem Router-State (nicht aus der Adresszeile: keine Personendaten in URLs). Nur Vorschlag, bleibt editierbar. */
export function prefillFrom(state: unknown): { name: string; email: string } {
  const s = (state && typeof state === 'object' ? state : {}) as { name?: unknown; email?: unknown }
  const pick = (k: 'name' | 'email', max: number) => (typeof s[k] === 'string' ? (s[k] as string) : '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
  return { name: pick('name', 80), email: pick('email', 200) }
}
