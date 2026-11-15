/* Beispieldaten für den Prototyp. Personen sind fiktiv. */

export type LocationKind = 'video' | 'video-template' | 'onsite' | 'phone'

export interface EventType {
  id: string
  slug: string
  title: string
  description: string
  duration: number
  location: { kind: LocationKind; label: string; detail?: string }
  color: number // Farbton (OKLCH hue)
  active: boolean
  requiresConfirmation: boolean
  bufferBefore: number
  bufferAfter: number
  minNotice: number // Stunden
  windowDays: number
  slotStep: number
  fields: { id: string; label: string; type: 'text' | 'textarea' | 'phone' | 'select' | 'checkbox'; required: boolean; options?: string[] }[]
  reminders: number[] // Minuten vorher
}

export const host = {
  name: 'Lena Berger',
  handle: 'lena',
  role: 'Sichtbarkeit & Marketing',
  company: 'Berger Coaching',
  timezone: 'Europe/Berlin',
  domain: 'termine.example.de',
}

export const eventTypes: EventType[] = [
  {
    id: 'e1',
    slug: 'kennenlernen',
    title: 'Kostenloses Orientierungsgespräch',
    description: 'Wir schauen gemeinsam auf deine Situation und klären, ob und wie ich dir helfen kann. Unverbindlich und kostenfrei.',
    duration: 30,
    location: { kind: 'video-template', label: 'Videocall', detail: 'https://kmeet.infomaniak.com/termind-{id}' },
    color: 172,
    active: true,
    requiresConfirmation: false,
    bufferBefore: 0,
    bufferAfter: 10,
    minNotice: 12,
    windowDays: 60,
    slotStep: 30,
    fields: [
      { id: 'f1', label: 'Worum geht es dir?', type: 'textarea', required: false },
      { id: 'f2', label: 'Telefon für Rückfragen', type: 'phone', required: false },
    ],
    reminders: [1440, 60],
  },
  {
    id: 'e2',
    slug: 'workshop',
    title: 'Workshop Sichtbarkeit & Marketing',
    description: 'Ein intensiver Arbeitstermin zu Positionierung, Website und Kanälen. Du gehst mit konkreten nächsten Schritten raus.',
    duration: 90,
    location: { kind: 'video', label: 'Zoom', detail: 'https://zoom.us/j/4815162342' },
    color: 60,
    active: true,
    requiresConfirmation: true,
    bufferBefore: 15,
    bufferAfter: 15,
    minNotice: 48,
    windowDays: 90,
    slotStep: 30,
    fields: [
      { id: 'f1', label: 'Firma', type: 'text', required: true },
      { id: 'f2', label: 'Website', type: 'text', required: false },
      { id: 'f3', label: 'Schwerpunkt', type: 'select', required: true, options: ['Positionierung', 'Website', 'Social Media', 'Alles davon'] },
    ],
    reminders: [1440],
  },
  {
    id: 'e3',
    slug: 'sichtbarkeit',
    title: 'Kostenfreies Sichtbarkeitsgespräch',
    description: '30 Minuten, in denen wir auf deinen Auftritt schauen und die drei wichtigsten Hebel finden.',
    duration: 30,
    location: { kind: 'video-template', label: 'Videocall', detail: 'https://kmeet.infomaniak.com/termind-{id}' },
    color: 85,
    active: true,
    requiresConfirmation: false,
    bufferBefore: 0,
    bufferAfter: 10,
    minNotice: 12,
    windowDays: 60,
    slotStep: 30,
    fields: [],
    reminders: [1440, 60],
  },
  {
    id: 'e4',
    slug: 'coaching',
    title: 'Coaching-Session',
    description: 'Eine Stunde Coaching vor Ort in meinem Büro oder per Video, je nachdem, was dir lieber ist.',
    duration: 60,
    location: { kind: 'onsite', label: 'Vor Ort', detail: 'Musterstraße 12, 12345 Musterstadt' },
    color: 250,
    active: true,
    requiresConfirmation: false,
    bufferBefore: 15,
    bufferAfter: 15,
    minNotice: 24,
    windowDays: 60,
    slotStep: 60,
    fields: [],
    reminders: [1440],
  },
  {
    id: 'e5',
    slug: 'persoenlich',
    title: 'Persönliches Kennenlernen',
    description: 'Ein lockeres Gespräch per Telefon.',
    duration: 30,
    location: { kind: 'phone', label: 'Telefon', detail: 'Ich rufe dich an' },
    color: 330,
    active: false,
    requiresConfirmation: false,
    bufferBefore: 0,
    bufferAfter: 0,
    minNotice: 4,
    windowDays: 30,
    slotStep: 30,
    fields: [],
    reminders: [60],
  },
]

/* ---------- Verfügbarkeit ---------- */
export type DayKey = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so'
export const dayNames: Record<DayKey, string> = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' }
export const dayOrder: DayKey[] = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']

export const weekly: Record<DayKey, [string, string][]> = {
  mo: [],
  di: [['09:00', '12:45'], ['14:30', '17:30']],
  mi: [['09:00', '12:45'], ['14:30', '17:30']],
  do: [['09:00', '12:45'], ['14:30', '17:30']],
  fr: [['09:00', '12:00']],
  sa: [],
  so: [],
}

export const exceptions = [
  { id: 'x1', title: 'Urlaub', from: '2026-12-23', to: '2027-01-02', kind: 'off' as const },
  { id: 'x2', title: 'Fortbildung', from: '2026-11-27', to: '2026-11-27', kind: 'off' as const },
  { id: 'x3', title: 'Langer Donnerstag', from: '2026-12-03', to: '2026-12-03', kind: 'hours' as const, hours: '09:00–19:00' },
]

/* ---------- Buchungen ---------- */
export type BookingStatus = 'confirmed' | 'pending' | 'cancelled'
export interface Booking {
  id: string
  eventId: string
  start: string // ISO lokal
  name: string
  email: string
  status: BookingStatus
  answers: { label: string; value: string }[]
  createdVia: 'web' | 'ki' | 'admin'
}

export const bookings: Booking[] = [
  { id: 'b1', eventId: 'e1', start: '2026-11-17T10:00', name: 'Clara Brenner', email: 'clara@brenner-design.de', status: 'confirmed', answers: [{ label: 'Worum geht es dir?', value: 'Neue Website für mein Atelier, weiß nicht, wo ich anfangen soll.' }], createdVia: 'web' },
  { id: 'b2', eventId: 'e2', start: '2026-11-18T11:00', name: 'Jonas Albrecht', email: 'j.albrecht@albrecht-holz.de', status: 'confirmed', answers: [{ label: 'Firma', value: 'Albrecht Holzbau GmbH' }, { label: 'Schwerpunkt', value: 'Positionierung' }], createdVia: 'web' },
  { id: 'b3', eventId: 'e2', start: '2026-11-24T14:30', name: 'Mira Okafor', email: 'mira@okafor-praxis.de', status: 'pending', answers: [{ label: 'Firma', value: 'Praxis für Physiotherapie Okafor' }, { label: 'Website', value: 'okafor-praxis.de' }, { label: 'Schwerpunkt', value: 'Website' }], createdVia: 'web' },
  { id: 'b4', eventId: 'e3', start: '2026-11-26T09:30', name: 'Tobias Reinhardt', email: 'tobias@reinhardt.coach', status: 'pending', answers: [], createdVia: 'web' },
  { id: 'b5', eventId: 'e1', start: '2026-12-02T15:00', name: 'Lena Vogt', email: 'lena.vogt@posteo.de', status: 'confirmed', answers: [], createdVia: 'ki' },
  { id: 'b6', eventId: 'e4', start: '2026-12-16T11:00', name: 'Hannah Lindqvist', email: 'hannah@lindqvist.se', status: 'confirmed', answers: [], createdVia: 'web' },
  { id: 'b7', eventId: 'e1', start: '2026-11-12T14:30', name: 'Felix Martens', email: 'felix@martens.io', status: 'confirmed', answers: [], createdVia: 'web' },
  { id: 'b8', eventId: 'e3', start: '2026-11-10T09:00', name: 'Ayşe Demir', email: 'ayse@demir-kanzlei.de', status: 'cancelled', answers: [], createdVia: 'web' },
]

/* ---------- KI-Protokoll ---------- */
export const aiLog = [
  { id: 'l1', at: '2026-11-15T08:12', client: 'KI-Assistent (Web)', action: 'Termin angelegt', detail: 'Orientierungsgespräch mit Lena Vogt am 02.12., 15:00', kind: 'write' as const },
  { id: 'l2', at: '2026-11-15T08:11', client: 'KI-Assistent (Web)', action: 'Verfügbarkeit gelesen', detail: 'Freie Zeiten 01.–05.12.', kind: 'read' as const },
  { id: 'l3', at: '2026-11-14T19:40', client: 'n8n Automatisierung', action: 'Ausnahme angelegt', detail: 'Fortbildung am 27.11., ganztägig', kind: 'write' as const },
  { id: 'l4', at: '2026-11-14T17:02', client: 'KI-Assistent (Web)', action: 'Absage vorbereitet, nicht bestätigt', detail: 'Termin mit Ayşe Demir, Mail-Vorschau erzeugt, Ausführung durch dich', kind: 'confirm' as const },
]

/* ---------- Hilfsfunktionen ---------- */
export const TODAY = new Date('2026-11-15T09:00')

export function locationIcon(kind: LocationKind) {
  return kind
}

export function fmtDuration(min: number) {
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`
}

const dk: DayKey[] = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function fromMin(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Freie Startzeiten eines Tages für eine Terminseite (vereinfacht). */
export function slotsFor(date: Date, ev: EventType): string[] {
  const key = dk[date.getDay()]
  const ds = iso(date)
  if (exceptions.some((x) => x.kind === 'off' && ds >= x.from && ds <= x.to)) return []
  const diff = (date.getTime() - TODAY.getTime()) / 36e5
  if (diff < ev.minNotice - 24 || diff > ev.windowDays * 24) return []
  const taken = bookings.filter((b) => b.status !== 'cancelled' && b.start.startsWith(ds)).map((b) => toMin(b.start.slice(11)))
  const out: string[] = []
  for (const [a, b] of weekly[key]) {
    for (let t = toMin(a); t + ev.duration <= toMin(b); t += ev.slotStep) {
      if (taken.some((s) => Math.abs(s - t) < ev.duration + ev.bufferAfter)) continue
      // pseudo-zufällig einzelne Slots als belegt markieren (Kalenderabgleich)
      if ((date.getDate() * 7 + t) % 11 === 0) continue
      out.push(fromMin(t))
    }
  }
  return out
}

export const fmt = {
  weekdayLong: new Intl.DateTimeFormat('de-DE', { weekday: 'long' }),
  dayMonth: new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' }),
  full: new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  monthYear: new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }),
  short: new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
  monShort: new Intl.DateTimeFormat('de-DE', { month: 'short' }),
}

export function endTime(start: string, duration: number) {
  return fromMin(toMin(start) + duration)
}
