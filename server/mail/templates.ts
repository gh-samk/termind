import type { Branding, Locale } from '../../shared/types'
import { config } from '../config'
import type { bookings, eventTypes, users } from '../db/schema'
import { formatDateTime } from '../lib/time'
import { locationLabel } from '../services/eventTypes'
import { oklchToHex } from './color'
import { buildIcs } from './ics'

export type MailTemplate =
  | 'guest.confirmed'
  | 'guest.requested'
  | 'guest.declined'
  | 'guest.cancelled'
  | 'guest.rescheduled'
  | 'host.new'
  | 'host.requested'
  | 'host.cancelled'
  | 'host.rescheduled'
  | 'guest.reminder'

export const MAIL_TEMPLATES: { id: MailTemplate; label: string; to: 'guest' | 'host' }[] = [
  { id: 'guest.confirmed', label: 'Buchung bestätigt', to: 'guest' },
  { id: 'guest.requested', label: 'Anfrage erhalten', to: 'guest' },
  { id: 'guest.declined', label: 'Anfrage abgelehnt', to: 'guest' },
  { id: 'guest.reminder', label: 'Erinnerung', to: 'guest' },
  { id: 'guest.rescheduled', label: 'Termin verschoben', to: 'guest' },
  { id: 'guest.cancelled', label: 'Termin abgesagt', to: 'guest' },
  { id: 'host.new', label: 'Neue Buchung', to: 'host' },
  { id: 'host.requested', label: 'Neue Anfrage', to: 'host' },
  { id: 'host.rescheduled', label: 'Vom Gast verschoben', to: 'host' },
  { id: 'host.cancelled', label: 'Vom Gast abgesagt', to: 'host' },
]

export const PLACEHOLDERS = ['{vorname}', '{gast}', '{gastgeber}', '{termin}', '{datum}', '{uhrzeit}', '{ort}'] as const

/** Eigene Texte pro Vorlage und Sprache (Einstellungen → E-Mail). */
export type MailTexts = Partial<Record<MailTemplate, Partial<Record<Locale, { subject?: string; intro?: string }>>>>

interface Ctx {
  booking: typeof bookings.$inferSelect
  event: typeof eventTypes.$inferSelect
  host: typeof users.$inferSelect
  branding: Branding
  texts?: MailTexts
}

/* Texte. M2: pro Instanz überschreibbar (Platzhalter {vorname}, {termin} …). */
const T = {
  de: {
    hello: (n: string) => `Hallo ${n},`,
    'guest.confirmed': { subject: 'Bestätigt: {termin} am {datum}', intro: 'dein Termin ist gebucht. Die Details findest du unten, der Kalendereintrag hängt an.' },
    'guest.requested': { subject: 'Anfrage erhalten: {termin} am {datum}', intro: '{gastgeber} hat deine Anfrage erhalten und meldet sich mit einer Bestätigung. Bis dahin ist der Termin für dich reserviert.' },
    'guest.declined': { subject: 'Leider nicht möglich: {termin} am {datum}', intro: '{gastgeber} kann deine Anfrage leider nicht annehmen.' },
    'guest.cancelled': { subject: 'Abgesagt: {termin} am {datum}', intro: 'der folgende Termin wurde abgesagt.' },
    'guest.rescheduled': { subject: 'Verschoben: {termin}, neu am {datum}', intro: 'dein Termin hat eine neue Zeit. Der aktualisierte Kalendereintrag hängt an.' },
    'host.new': { subject: 'Neue Buchung: {gast}, {datum} um {uhrzeit}', intro: '{gast} hat einen Termin bei dir gebucht.' },
    'host.requested': { subject: 'Neue Anfrage: {gast}, {datum} um {uhrzeit}', intro: '{gast} möchte einen Termin. Bitte bestätige oder lehne die Anfrage ab.' },
    'host.cancelled': { subject: 'Abgesagt von {gast}: {datum} um {uhrzeit}', intro: '{gast} hat den Termin abgesagt.' },
    'host.rescheduled': { subject: 'Verschoben von {gast}: neu am {datum} um {uhrzeit}', intro: '{gast} hat den Termin auf eine neue Zeit verschoben.' },
    'guest.reminder': { subject: 'Erinnerung: {termin} am {datum} um {uhrzeit}', intro: 'kurze Erinnerung an unseren Termin. Ich freue mich auf das Gespräch!' },
    when: 'Wann',
    where: 'Wo',
    reason: 'Nachricht',
    join: 'Videocall beitreten',
    manage: 'Verschieben oder absagen',
    rebook: 'Neuen Termin wählen',
    open: 'In termind öffnen',
    answers: 'Angaben',
    timezoneNote: (tz: string) => `Zeitangaben in ${tz}`,
    phoneHost: (n: string) => `${n} ruft dich an`,
    phoneGuest: (nr: string) => `Bitte ruf an: ${nr}`,
    footer: (i: string) => `Gesendet von ${i}`,
  },
  en: {
    hello: (n: string) => `Hi ${n},`,
    'guest.confirmed': { subject: 'Confirmed: {termin} on {datum}', intro: 'your meeting is booked. Details are below and the calendar invite is attached.' },
    'guest.requested': { subject: 'Request received: {termin} on {datum}', intro: '{gastgeber} received your request and will confirm shortly. The time is held for you until then.' },
    'guest.declined': { subject: 'Not possible: {termin} on {datum}', intro: '{gastgeber} is unfortunately unable to accept your request.' },
    'guest.cancelled': { subject: 'Cancelled: {termin} on {datum}', intro: 'the following meeting has been cancelled.' },
    'guest.rescheduled': { subject: 'Rescheduled: {termin}, now on {datum}', intro: 'your meeting has a new time. The updated calendar invite is attached.' },
    'host.new': { subject: 'New booking: {gast}, {datum} at {uhrzeit}', intro: '{gast} booked a meeting with you.' },
    'host.requested': { subject: 'New request: {gast}, {datum} at {uhrzeit}', intro: '{gast} requested a meeting. Please accept or decline.' },
    'host.cancelled': { subject: 'Cancelled by {gast}: {datum} at {uhrzeit}', intro: '{gast} cancelled the meeting.' },
    'host.rescheduled': { subject: 'Rescheduled by {gast}: now {datum} at {uhrzeit}', intro: '{gast} moved the meeting to a new time.' },
    'guest.reminder': { subject: 'Reminder: {termin} on {datum} at {uhrzeit}', intro: 'just a quick reminder of our meeting. Looking forward to it!' },
    when: 'When',
    where: 'Where',
    reason: 'Message',
    join: 'Join video call',
    manage: 'Reschedule or cancel',
    rebook: 'Pick a new time',
    open: 'Open in termind',
    answers: 'Details',
    timezoneNote: (tz: string) => `Times shown in ${tz}`,
    phoneHost: (n: string) => `${n} will call you`,
    phoneGuest: (nr: string) => `Please call: ${nr}`,
    footer: (i: string) => `Sent by ${i}`,
  },
} as const

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function defaultTexts(template: MailTemplate, locale: Locale) {
  const t = T[locale][template]
  return { subject: t.subject, intro: t.intro }
}

export function renderMail(template: MailTemplate, ctx: Ctx) {
  const { booking: b, event: ev, host, branding } = ctx
  const toGuest = template.startsWith('guest.')
  const locale: Locale = toGuest ? b.locale : host.locale
  const tz = toGuest ? b.guestTimezone : host.timezone
  const t = T[locale]
  const start = new Date(b.startsAt)
  const end = new Date(b.endsAt)
  const { date, time } = formatDateTime(start, tz, locale)
  const endTime = formatDateTime(end, tz, locale).time
  const firstName = (toGuest ? b.guestName : host.name).split(' ')[0]

  const custom = ctx.texts?.[template]?.[locale]
  const tpl = { subject: custom?.subject?.trim() || t[template].subject, intro: custom?.intro?.trim() || t[template].intro }

  const isLive = b.status === 'confirmed' && !template.endsWith('cancelled') && !template.endsWith('declined')
  const loc = b.location
  let where = locationLabel(ev.location, locale)
  if (loc.kind === 'onsite') where = loc.value
  if (loc.kind === 'phone-host-calls') where = toGuest ? t.phoneHost(host.name) : `${locationLabel(loc, locale)}: ${b.answers.find((a) => a.fieldId === 'phone')?.value ?? ''}`
  // Telefonnummer des Gastgebers erst nach Bestätigung herausgeben
  if (loc.kind === 'phone-guest-calls') where = b.status === 'confirmed' || !toGuest ? t.phoneGuest(loc.value) : locationLabel(loc, locale)
  const joinUrl = isLive && loc.kind === 'video' ? loc.value : null

  const fill = (s: string) =>
    s
      // Funktion als Ersatz, damit $-Muster in Namen nicht als Ersetzungsmuster wirken
      .replaceAll('{vorname}', () => firstName)
      .replaceAll('{termin}', () => ev.title)
      .replaceAll('{datum}', () => date)
      .replaceAll('{uhrzeit}', () => time)
      .replaceAll('{gast}', () => b.guestName)
      .replaceAll('{gastgeber}', () => host.name)
      .replaceAll('{ort}', () => where)
  const subject = fill(tpl.subject).replace(/[\r\n]+/g, ' ').slice(0, 250)
  const intro = fill(tpl.intro)

  const manageUrl = `${config.publicUrl}/b/${b.manageToken}`
  const rebookUrl = `${config.publicUrl}/${host.handle}/${ev.slug}`
  const adminUrl = `${config.publicUrl}/admin?termin=${b.id}`
  const accent = oklchToHex(0.47, 0.085, branding.accentHue)

  const buttons: { label: string; href: string; primary?: boolean }[] = []
  if (toGuest) {
    if (joinUrl) buttons.push({ label: t.join, href: joinUrl, primary: true })
    if (isLive || b.status === 'pending') buttons.push({ label: t.manage, href: manageUrl, primary: !joinUrl })
    if (template === 'guest.cancelled' || template === 'guest.declined') buttons.push({ label: t.rebook, href: rebookUrl, primary: true })
  } else {
    buttons.push({ label: t.open, href: adminUrl, primary: true })
    if (joinUrl) buttons.push({ label: t.join, href: joinUrl })
  }

  const rows: [string, string][] = [
    [t.when, `${date}<br>${time} – ${endTime}`],
    [t.where, joinUrl ? `<a href="${html(joinUrl)}" style="color:${accent}">${html(where)}</a>` : html(where)],
  ]
  if (!toGuest) rows.push(['E-Mail', `<a href="mailto:${html(b.guestEmail)}" style="color:${accent}">${html(b.guestEmail)}</a>`])
  if (!toGuest) for (const a of b.answers) rows.push([html(a.label), html(a.value).replace(/\n/g, '<br>')])
  if (b.cancelReason && (template.endsWith('cancelled') || template.endsWith('declined') || template.endsWith('rescheduled'))) rows.push([t.reason, html(b.cancelReason)])

  const body = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${html(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:Roboto,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#26231f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e8e4dc">
<tr><td style="padding:28px 28px 8px">
<div style="width:32px;height:4px;border-radius:4px;background:${accent}"></div>
<p style="margin:20px 0 0;font-size:15px;line-height:1.55">${html(t.hello(firstName))}</p>
${intro.split(/\n{2,}/).map((para) => `<p style="margin:8px 0 0;font-size:15px;line-height:1.55">${html(para).replace(/\n/g, '<br>')}</p>`).join('')}
</td></tr>
<tr><td style="padding:16px 28px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e4dc;border-radius:12px;background:#faf9f6">
<tr><td style="padding:16px 18px 6px;font-size:16px;font-weight:700">${html(ev.title)}</td></tr>
${rows.map(([k, v]) => `<tr><td style="padding:4px 18px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td valign="top" style="width:96px;font-size:13px;color:#6f695f;padding:2px 0">${k}</td><td style="font-size:14px;line-height:1.5;padding:2px 0">${v}</td></tr></table></td></tr>`).join('')}
<tr><td style="padding:6px 18px 14px;font-size:12px;color:#8a8478">${html(t.timezoneNote(tz))}</td></tr>
</table></td></tr>
<tr><td style="padding:18px 28px 28px">${buttons
    .map((bt) =>
      bt.primary
        ? `<a href="${html(bt.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:10px;background:${accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${html(bt.label)}</a>`
        : `<a href="${html(bt.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 17px;border-radius:10px;border:1px solid #ddd8ce;color:#26231f;font-size:14px;font-weight:500;text-decoration:none">${html(bt.label)}</a>`,
    )
    .join('')}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#8a8478">${html(t.footer(branding.instanceName))}</p>
</td></tr></table></body></html>`

  const text = [
    t.hello(firstName),
    '',
    intro,
    '',
    ev.title,
    `${t.when}: ${date}, ${time} – ${endTime} (${tz})`,
    `${t.where}: ${where}${joinUrl ? ` ${joinUrl}` : ''}`,
    ...(!toGuest ? [`E-Mail: ${b.guestEmail}`, ...b.answers.map((a) => `${a.label}: ${a.value}`)] : []),
    ...(b.cancelReason ? [`${t.reason}: ${b.cancelReason}`] : []),
    '',
    ...buttons.map((bt) => `${bt.label}: ${bt.href}`),
    '',
    `— ${t.footer(branding.instanceName)}`,
  ].join('\n')

  // Kalendereintrag: neu/verschoben → REQUEST, abgesagt → CANCEL. Anfragen bekommen noch keinen.
  let ics: { content: string; method: 'REQUEST' | 'CANCEL' } | null = null
  const wantsIcs = ['guest.confirmed', 'guest.rescheduled', 'guest.cancelled', 'host.new', 'host.rescheduled', 'host.cancelled'].includes(template)
  if (wantsIcs) {
    const method = template.endsWith('cancelled') ? 'CANCEL' : 'REQUEST'
    const otherName = toGuest ? host.name : b.guestName
    ics = {
      method,
      content: buildIcs({
        uid: `${b.id}@termind`,
        sequence: b.sequence,
        method,
        start,
        end,
        summary: `${ev.title} · ${otherName}`,
        description: [joinUrl ? `${t.join}: ${joinUrl}` : '', toGuest ? `${t.manage}: ${manageUrl}` : `${t.open}: ${adminUrl}`].filter(Boolean).join('\n'),
        location: joinUrl ?? where,
        url: joinUrl ?? undefined,
        organizer: { name: host.name, email: host.email },
        attendee: { name: b.guestName, email: b.guestEmail },
      }),
    }
  }

  return { subject, html: body, text, ics, to: toGuest ? { name: b.guestName, email: b.guestEmail } : { name: host.name, email: host.email } }
}

/** Mail „Passwort zurücksetzen“. Der Link ist 30 Minuten gültig und nur einmal verwendbar. */
export function renderResetMail(user: { name: string; email: string }, link: string, minutes: number, branding: Branding) {
  const first = user.name.split(' ')[0] || user.name
  const subject = `Passwort zurücksetzen für ${branding.instanceName}`
  const accent = oklchToHex(0.52, 0.1, branding.accentHue)
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const lines = [
    `Du oder jemand anderes hat für dein Konto bei ${branding.instanceName} ein neues Passwort angefordert.`,
    `Der Link ist ${minutes} Minuten gültig und lässt sich nur einmal verwenden. Danach musst du dich überall neu anmelden.`,
  ]
  const hint = 'Das warst du nicht? Dann ignoriere diese Mail. Dein Passwort bleibt unverändert.'
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:Roboto,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#26231f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e8e4dc">
<tr><td style="padding:28px">
<div style="width:32px;height:4px;border-radius:4px;background:${accent}"></div>
<p style="margin:20px 0 0;font-size:15px;line-height:1.55">Hallo ${esc(first)},</p>
${lines.map((l) => `<p style="margin:8px 0 0;font-size:15px;line-height:1.55">${esc(l)}</p>`).join('')}
<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:11px 18px;border-radius:10px;background:${accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Neues Passwort festlegen</a></p>
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6f695f">${esc(hint)}</p>
</td></tr></table></td></tr></table></body></html>`
  const text = [`Hallo ${first},`, '', ...lines, '', `Neues Passwort festlegen: ${link}`, '', hint].join('\n')
  return { subject, html, text, ics: null, to: { name: user.name, email: user.email } }
}
