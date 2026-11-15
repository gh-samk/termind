/** Minimaler iCalendar-Generator (RFC 5545) für Einladungen und Absagen. */

export interface IcsEvent {
  uid: string
  sequence: number
  /** null = Kalenderobjekt für CalDAV (ohne METHOD) */
  method: 'REQUEST' | 'CANCEL' | null
  start: Date
  end: Date
  summary: string
  description: string
  location: string
  url?: string
  organizer: { name: string; email: string }
  attendee: { name: string; email: string }
  /** Erinnerung 15 Min. vorher */
  alarm?: boolean
  /** Sprache des Erinnerungstexts (Standard: de) */
  locale?: 'de' | 'en'
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
/** Zeilenumbrüche vereinheitlichen, übrige Steuerzeichen entfernen. */
const clean = (s: string) => s.replace(/\r\n|\r|\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
/** TEXT-Werte nach RFC 5545 escapen; Zeilenumbrüche werden zu \n. */
const esc = (s: string) => clean(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
/** Parameterwerte (CN) dürfen weder Zeilenumbrüche noch Anführungszeichen enthalten. */
const cn = (s: string) => `"${clean(s).replace(/[\n"]/g, ' ').slice(0, 200)}"`
/** URIs und Adressen ohne Leer- und Steuerzeichen. */
const uri = (s: string) => clean(s).replace(/\s/g, '')

/** Zeilen nach 75 Bytes falten, ohne UTF-8-Zeichen zu zerschneiden. */
function fold(line: string) {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
    }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function buildIcs(e: IcsEvent) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//termind//termind//DE',
    'CALSCALE:GREGORIAN',
    ...(e.method ? [`METHOD:${e.method}`] : []),
    'BEGIN:VEVENT',
    `UID:${uri(e.uid)}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.summary)}`,
    `DESCRIPTION:${esc(e.description)}`,
    `LOCATION:${esc(e.location)}`,
    ...(e.url ? [`URL:${uri(e.url)}`] : []),
    `ORGANIZER;CN=${cn(e.organizer.name)}:mailto:${uri(e.organizer.email)}`,
    `ATTENDEE;CN=${cn(e.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${uri(e.attendee.email)}`,
    `STATUS:${e.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(e.alarm === false ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e.locale === 'en' ? 'Reminder' : 'Erinnerung'}`, 'TRIGGER:-PT15M', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
