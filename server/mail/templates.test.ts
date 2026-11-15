import nodemailer from 'nodemailer'
import { describe, expect, it } from 'vitest'
import type { bookings, eventTypes, users } from '../db/schema'
import { buildIcs } from './ics'
import { defaultTexts, MAIL_TEMPLATES, relativeDay, renderMail, type MailTemplate } from './templates'
import { buildMessage, cleanHeader, safeAddress } from './transport'

type B = typeof bookings.$inferSelect
type E = typeof eventTypes.$inferSelect
type U = typeof users.$inferSelect

const host = { id: 'h1', email: 'anna@host.example', name: 'Anna Beispiel', handle: 'anna', timezone: 'Europe/Berlin', locale: 'de' } as U
const event = { id: 'e1', slug: 'erstgespraech', title: 'Erstgespräch', location: { kind: 'video', value: 'https://meet.example/abc' } } as E
// 17. November 2026, 10:00 Uhr in Berlin (CET = UTC+1)
const booking = {
  id: 'b1', manageToken: 'tok123', startsAt: '2026-11-17T09:00:00.000Z', endsAt: '2026-11-17T09:30:00.000Z',
  guestName: 'Gerda Gast', guestEmail: 'gerda@gast.example', guestTimezone: 'Europe/Berlin', locale: 'de', answers: [],
  location: { kind: 'video', value: 'https://meet.example/abc' }, status: 'confirmed', cancelReason: null, cancelledBy: null, sequence: 0,
} as unknown as B
const branding = { instanceName: 'termind', accentHue: 172 } as never
const render = (t: MailTemplate, b: Partial<B> = {}, h: Partial<U> = {}, extra: object = {}) => renderMail(t, { booking: { ...booking, ...b }, event, host: { ...host, ...h }, branding, ...extra })

describe('Gast-Mails', () => {
  it('nennen den Gastgeber und die Zeit mit Start, Ende und „Uhr“', () => {
    const m = render('guest.confirmed')
    expect(m.html).toContain('>Mit<')
    expect(m.html).toContain('Anna Beispiel')
    expect(m.html).toContain('10:00 – 10:30 Uhr')
    expect(m.text).toContain('Mit: Anna Beispiel')
    expect(m.text).toContain('10:00 – 10:30 Uhr')
  })

  it('Betreff der Bestätigung nennt Termin, Datum und Uhrzeit', () => {
    expect(render('guest.confirmed').subject).toBe('Bestätigt: Erstgespräch am Dienstag, 17. November 2026 um 10:00 Uhr')
    expect(render('guest.confirmed', { locale: 'en' }).subject).toBe('Confirmed: Erstgespräch on Tuesday, November 17, 2026 at 10:00 am')
    for (const id of ['guest.requested', 'guest.declined', 'guest.cancelled', 'guest.cancelledSelf', 'guest.rescheduled']) {
      expect(render(id as MailTemplate).subject, id).toMatch(/10:00 Uhr/)
    }
  })

  it('englische Mails nutzen am/pm', () => {
    const m = render('guest.confirmed', { locale: 'en', startsAt: '2026-11-17T15:30:00.000Z', endsAt: '2026-11-17T16:00:00.000Z' })
    expect(m.html).toContain('4:30 pm – 5:00 pm')
    expect(m.html).not.toContain('Uhr')
  })

  it('Zeitzonenhinweis nur bei abweichender Zeitzone, Zeiten dann in der Gast-Zeitzone ohne Gastgeber-Zeitzone', () => {
    const same = render('guest.confirmed')
    expect(same.html).not.toContain('Zeitzone')
    expect(same.text).not.toContain('Zeitzone')
    // Wien hat dieselbe Uhrzeit wie Berlin: kein Hinweis
    expect(render('guest.confirmed', { guestTimezone: 'Europe/Vienna' }).html).not.toContain('Zeitzone')

    const ny = render('guest.confirmed', { guestTimezone: 'America/New_York' })
    expect(ny.html).toContain('04:00 – 04:30 Uhr')
    expect(ny.html).toContain('Alle Zeiten in deiner Zeitzone: USA Ostküste (New York), UTC−5')
    expect(ny.text).toContain('Alle Zeiten in deiner Zeitzone')
    expect(ny.html).not.toContain('Berlin')
    expect(ny.html).not.toContain('10:00')
  })

  it('Gastgeber-Mails zeigen die Gast-Zeit nur bei abweichender Zeitzone', () => {
    expect(render('host.new').html).not.toContain('Beim Gast')
    const m = render('host.new', { guestTimezone: 'America/New_York' })
    expect(m.html).toContain('Beim Gast')
    expect(m.html).toContain('04:00 – 04:30 Uhr (New York)')
    expect(m.html).toContain('10:00 – 10:30 Uhr')
  })

  it('Knopf „Zum Kalender hinzufügen“ verweist auf den ICS-Endpunkt, nur bei bestätigt/verschoben', () => {
    for (const t of ['guest.confirmed', 'guest.rescheduled'] as const) {
      const m = render(t)
      expect(m.html).toContain('Zum Kalender hinzufügen')
      expect(m.html).toContain('http://localhost:3000/api/public/b/tok123/ics')
      expect(m.html).toContain('/b/tok123"') // Verwalten-Link bleibt
    }
    expect(render('guest.requested', { status: 'pending' }).html).not.toContain('Zum Kalender')
    expect(render('guest.cancelled', { status: 'cancelled' }).html).not.toContain('Zum Kalender')
    expect(render('guest.confirmed', { locale: 'en' }).html).toContain('Add to calendar')
  })

  it('Erinnerung ist neutral und nennt heute/morgen/Datum in der Zeitzone des Empfängers', () => {
    const at = (iso: string, b: Partial<B> = {}) => render('guest.reminder', b, {}, { now: new Date(iso) })
    const morgen = at('2026-11-16T12:00:00Z')
    expect(morgen.text).toContain('dein Termin „Erstgespräch“ mit Anna Beispiel ist morgen um 10:00 Uhr.')
    expect(morgen.subject).toBe('Erinnerung: Erstgespräch morgen um 10:00 Uhr')
    expect(morgen.text).not.toMatch(/freue/i)
    expect(at('2026-11-17T06:00:00Z').text).toContain('ist heute um 10:00 Uhr.')
    expect(at('2026-11-10T12:00:00Z').text).toContain('ist am Dienstag, 17. November 2026 um 10:00 Uhr.')
    // 23:30 UTC am 16.11. ist in Berlin schon der 17.: „heute“, in New York noch der 16.: „morgen“ (Termin dort 04:00)
    expect(at('2026-11-16T23:30:00Z').text).toContain('ist heute')
    expect(at('2026-11-16T23:30:00Z', { guestTimezone: 'America/New_York' }).text).toContain('ist morgen um 04:00 Uhr')
    expect(at('2026-11-16T12:00:00Z', { locale: 'en' }).text).toContain('is tomorrow at 10:00 am.')
    expect(relativeDay(new Date('2026-11-17T09:00:00Z'), 'Europe/Berlin', 'de', 'X', new Date('2026-11-17T01:00:00Z'))).toBe('heute')
  })

  it('Absage: zwei Varianten je nachdem, wer abgesagt hat', () => {
    const host = render('guest.cancelled', { status: 'cancelled', cancelledBy: 'host' })
    expect(host.text).toContain('Anna Beispiel hat den Termin abgesagt.')
    const self = render('guest.cancelledSelf', { status: 'cancelled', cancelledBy: 'guest' })
    expect(self.text).toContain('du hast den Termin abgesagt')
    expect(self.subject).toMatch(/^Absage bestätigt:/)
    // Alte Aufträge der Absage durch den Gast landen ebenfalls bei der richtigen Variante
    expect(render('guest.cancelled', { status: 'cancelled', cancelledBy: 'guest' }).text).toContain('du hast den Termin abgesagt')
    expect(host.html).toContain('Neuen Termin wählen')
  })

  it('eigene Texte der Nutzer haben weiter Vorrang vor den Standardtexten', () => {
    const texts = { 'guest.confirmed': { de: { subject: 'Mein Betreff {termin}', intro: 'Mein Text' } } }
    const m = render('guest.confirmed', {}, {}, { texts })
    expect(m.subject).toBe('Mein Betreff Erstgespräch')
    expect(m.text).toContain('Mein Text')
    expect(defaultTexts('guest.confirmed', 'de').subject).toContain('{uhrzeit} Uhr')
  })

  it('jede Vorlage hat Standardtexte in de und en', () => {
    for (const m of MAIL_TEMPLATES) {
      for (const l of ['de', 'en'] as const) {
        const d = defaultTexts(m.id, l)
        expect(d.subject.length, `${m.id} ${l}`).toBeGreaterThan(3)
        expect(d.intro.length).toBeGreaterThan(3)
      }
    }
  })
})

describe('Direkt-Knöpfe in der Anfrage-Mail', () => {
  const links = { confirm: 'http://localhost:3000/aktion/AAA', decline: 'http://localhost:3000/aktion/BBB' }
  it('nur host.requested mit Links zeigt Bestätigen und Ablehnen', () => {
    const m = render('host.requested', { status: 'pending' }, {}, { actionLinks: links })
    expect(m.html).toContain('href="http://localhost:3000/aktion/AAA"')
    expect(m.html).toContain('href="http://localhost:3000/aktion/BBB"')
    expect(m.text).toContain('Bestätigen: http://localhost:3000/aktion/AAA')
    expect(m.text).toContain('Ablehnen: http://localhost:3000/aktion/BBB')
    expect(render('host.requested', { status: 'pending' }).html).not.toContain('/aktion/')
    expect(render('host.new', {}, {}, { actionLinks: links }).html).not.toContain('/aktion/')
    expect(render('guest.requested', { status: 'pending' }, {}, { actionLinks: links }).html).not.toContain('/aktion/')
  })
})

describe('Reply-To', () => {
  const smtp = { fromName: 'Termine', fromEmail: 'noreply@host.example', replyTo: '' }
  it('Gast-Mails antworten an den Gastgeber, Gastgeber-Mails an den Gast', () => {
    for (const t of ['guest.confirmed', 'guest.requested', 'guest.declined', 'guest.reminder', 'guest.rescheduled', 'guest.cancelled', 'guest.cancelledSelf'] as const) {
      expect(render(t).replyTo, t).toEqual({ name: 'Anna Beispiel', email: 'anna@host.example' })
      expect(render(t).to.email).toBe('gerda@gast.example')
    }
    for (const t of ['host.new', 'host.requested', 'host.rescheduled', 'host.cancelled'] as const) {
      expect(render(t).replyTo, t).toEqual({ name: 'Gerda Gast', email: 'gerda@gast.example' })
      expect(render(t).to.email).toBe('anna@host.example')
    }
  })

  it('ein konfiguriertes „Antworten an“ gilt für Gast-Mails, nicht für Gastgeber-Mails', () => {
    const cfg = { ...smtp, replyTo: 'team@host.example' }
    expect(buildMessage(cfg, render('guest.confirmed')).replyTo).toEqual({ name: '', address: 'team@host.example' })
    expect(buildMessage(cfg, render('host.new')).replyTo).toEqual({ name: 'Gerda Gast', address: 'gerda@gast.example' })
    expect(buildMessage(smtp, render('guest.confirmed')).replyTo).toEqual({ name: 'Anna Beispiel', address: 'anna@host.example' })
    // Mails ohne eigene Antwortadresse (z. B. Passwort zurücksetzen) nutzen die konfigurierte
    expect(buildMessage(cfg, { to: { name: 'X', email: 'x@example.de' }, subject: 's', html: 'h', text: 't' }).replyTo).toEqual({ name: '', address: 'team@host.example' })
    expect(buildMessage(smtp, { to: { name: 'X', email: 'x@example.de' }, subject: 's', html: 'h', text: 't' })).not.toHaveProperty('replyTo')
  })
})

describe('Header-Injection', () => {
  it('Zeilenumbrüche in Namen und Betreff erzeugen keine zusätzlichen Kopfzeilen', async () => {
    const evil = 'Eve\r\nBcc: opfer@example.org'
    const m = render('host.new', { guestName: evil, guestEmail: 'eve@example.org' }, { name: 'Anna\r\nBcc: x@example.org' }, {})
    const msg = buildMessage({ fromName: 'Term\r\nine', fromEmail: 'noreply@host.example', replyTo: '' }, { ...m, subject: 'Betreff\r\nBcc: z@example.org' })
    const t = nodemailer.createTransport({ streamTransport: true, buffer: true })
    const info = await t.sendMail(msg)
    const raw = (info.message as Buffer).toString('utf8')
    const headers = raw.split('\r\n\r\n')[0]
    expect(/^Bcc:/im.test(headers)).toBe(false)
    expect(headers).toMatch(/^Reply-To: /im)
    expect(headers.match(/^To: /gim)).toHaveLength(1)
    expect(headers.match(/^Subject: /gim)).toHaveLength(1)
  })

  it('ungültige oder mehrfache Adressen werden nicht übernommen', () => {
    expect(safeAddress('A', 'a@example.org\r\nBcc: b@example.org')).toBeUndefined()
    expect(safeAddress('A', 'a@example.org, b@example.org')).toBeUndefined()
    expect(safeAddress('A', 'kein-mail')).toBeUndefined()
    expect(safeAddress('A\r\nB', 'a@example.org')).toEqual({ name: 'A B', address: 'a@example.org' })
    expect(cleanHeader('a\r\nb c')).toBe('a b c')
    const msg = buildMessage({ fromName: 'T', fromEmail: 'n@example.org', replyTo: '' }, { ...render('host.new', { guestEmail: 'x@y.de\nBcc: z@y.de' }), to: { name: 'A', email: 'a@example.org' } })
    expect(msg).not.toHaveProperty('replyTo')
    expect(() => buildMessage({ fromName: 'T', fromEmail: 'n@example.org', replyTo: '' }, { to: { name: 'A', email: 'a@example.org\r\nBcc: b@example.org' }, subject: 's', html: '', text: '' })).toThrow(/ungültig/)
  })
})

describe('ICS-Erinnerung nach Sprache', () => {
  const base = { uid: 'a@termind', sequence: 0, method: 'REQUEST' as const, start: new Date('2026-11-17T09:00:00Z'), end: new Date('2026-11-17T09:30:00Z'), summary: 's', description: 'd', location: 'l', organizer: { name: 'H', email: 'h@example.org' }, attendee: { name: 'G', email: 'g@example.org' } }
  it('Erinnerung (de) und Reminder (en)', () => {
    expect(buildIcs(base)).toContain('DESCRIPTION:Erinnerung')
    expect(buildIcs({ ...base, locale: 'en' })).toContain('DESCRIPTION:Reminder')
    expect(render('guest.confirmed', { locale: 'en' }).ics?.content).toContain('DESCRIPTION:Reminder')
  })
})

describe('HTML-Escaping und Links', () => {
  it('Namen, Antworten, Nachrichten und Betreff werden maskiert', () => {
    const m = render('host.requested', { status: 'pending', guestName: 'Eve "><script>alert(1)</script>', answers: [{ fieldId: 'x', label: '<i>Frage</i>', value: 'Antwort <script>alert(2)</script>\nZeile' }] })
    expect(m.html).not.toMatch(/<script|<i>Frage/)
    expect(m.html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;')
    expect(m.html).toContain('Eve &quot;&gt;&lt;script&gt;')
    expect(m.subject).toContain('<script>') // Betreff ist reiner Text; im HTML-Titel maskiert
    expect(m.html).toMatch(/<title>[^<]*&lt;script&gt;/)
    const d = render('guest.declined', { status: 'declined', cancelReason: 'Leider <b>nein</b>' })
    expect(d.html).toContain('Leider &lt;b&gt;nein&lt;/b&gt;')
    expect(d.html).not.toContain('<b>nein')
    const ev = renderMail('host.new', { booking: booking, event: { ...event, title: '<img src=x onerror=1>' } as E, host: { ...host, name: 'A<b>' }, branding })
    expect(ev.html).not.toContain('<img src=x')
  })

  it('Video-Ort nur als http(s)-Link, sonst kein Knopf und kein href', () => {
    const bad = render('guest.confirmed', { location: { kind: 'video', value: 'javascript:alert(1)' } })
    expect(bad.html).not.toContain('javascript:')
    expect(bad.html).not.toContain('Videocall beitreten')
    expect(bad.ics?.content).not.toContain('javascript:')
    expect(render('guest.confirmed').html).toContain('Videocall beitreten')
  })
})

describe('Texte je Lage', () => {
  it('„Knöpfe unten“ nur, wenn es Knöpfe gibt', () => {
    const links = { confirm: 'http://localhost:3000/aktion/A', decline: 'http://localhost:3000/aktion/B' }
    expect(render('host.requested', { status: 'pending' }).text).not.toContain('Knöpfen')
    expect(render('host.requested', { status: 'pending' }, {}, { actionLinks: links }).text).toContain('mit den Knöpfen unten')
  })

  it('zurückgezogene Anfrage: keine Rede vom gestrichenen Kalendereintrag', () => {
    const p = render('guest.cancelledSelf', { status: 'cancelled', cancelledBy: 'guest' }, {}, { wasPending: true })
    expect(p.text).toContain('Anfrage zurückgezogen')
    expect(p.text).not.toContain('Kalender')
    expect(p.subject).toMatch(/^Anfrage zurückgezogen:/)
    expect(render('guest.cancelledSelf', { status: 'cancelled', cancelledBy: 'guest' }).text).toContain('Kalender von Anna Beispiel gestrichen')
  })
})

describe('Verschoben: bisherige Zeit', () => {
  const previous = { startsAt: '2026-11-16T14:00:00.000Z', endsAt: '2026-11-16T14:30:00.000Z' }
  it('zeigt „Bisher“ zusätzlich zur neuen Zeit; alte Aufträge ohne Angabe funktionieren', () => {
    const m = render('guest.rescheduled', {}, {}, { previous })
    expect(m.html).toContain('>Bisher<')
    expect(m.html).toContain('line-through')
    expect(m.html).toContain('15:00 – 15:30 Uhr')
    expect(m.html).toContain('10:00 – 10:30 Uhr')
    expect(m.text).toContain('Bisher: Montag, 16. November 2026, 15:00 – 15:30 Uhr')
    expect(render('guest.rescheduled').html).not.toContain('Bisher')
    expect(render('host.rescheduled', {}, {}, { previous }).text).toContain('Bisher:')
    expect(render('guest.confirmed', {}, {}, { previous }).html).not.toContain('Bisher')
  })
  it('Uhrzeit bleibt in einer Zeile', () => {
    expect(render('guest.confirmed').html).toContain('<span style="white-space:nowrap">10:00 – 10:30 Uhr</span>')
  })
})

describe('Kalenderteil', () => {
  it('genau ein text/calendar-Teil und kein zusätzlicher Anhang', async () => {
    const m = render('guest.confirmed')
    const msg = buildMessage({ fromName: 'T', fromEmail: 'n@example.org', replyTo: '' }, m)
    const info = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(msg)
    const raw = (info.message as Buffer).toString('utf8')
    expect(raw.match(/Content-Type: text\/calendar/gi)).toHaveLength(1)
    expect(raw).toMatch(/Content-Type: text\/calendar; charset=utf-8; method=REQUEST/i)
    expect(raw).not.toMatch(/application\/ics|filename=/i)
  })
})
