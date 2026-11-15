import { safeHttpUrl } from '../../shared/url'
import { cityName, timezoneLabel, utcOffset } from '../../shared/timezones'
import type { Branding, Locale } from '../../shared/types'
import { config } from '../config'
import type { bookings, eventTypes, users } from '../db/schema'
import { addDays, todayIn } from '../lib/time'
import { locationLabel } from '../services/eventTypes'
import { oklchToHex } from './color'
import { buildIcs } from './ics'

export type MailTemplate =
  | 'guest.confirmed'
  | 'guest.requested'
  | 'guest.declined'
  | 'guest.cancelled'
  | 'guest.cancelledSelf'
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
  { id: 'guest.cancelled', label: 'Termin abgesagt (von dir)', to: 'guest' },
  { id: 'guest.cancelledSelf', label: 'Absage bestätigt (Gast hat abgesagt)', to: 'guest' },
  { id: 'host.new', label: 'Neue Buchung', to: 'host' },
  { id: 'host.requested', label: 'Neue Anfrage', to: 'host' },
  { id: 'host.rescheduled', label: 'Vom Gast verschoben', to: 'host' },
  { id: 'host.cancelled', label: 'Vom Gast abgesagt', to: 'host' },
]

/** {tag} = „heute“, „morgen“ oder „am Donnerstag, 20. November 2026“ (aus Sicht des Empfängers, zum Zeitpunkt des Versands). */
export const PLACEHOLDERS = ['{vorname}', '{gast}', '{gastgeber}', '{termin}', '{datum}', '{uhrzeit}', '{tag}', '{ort}'] as const

/** Eigene Texte pro Vorlage und Sprache (Einstellungen → E-Mail). */
export type MailTexts = Partial<Record<MailTemplate, Partial<Record<Locale, { subject?: string; intro?: string }>>>>

export interface MailAddress {
  name: string
  email: string
}

interface Ctx {
  booking: typeof bookings.$inferSelect
  event: typeof eventTypes.$inferSelect
  host: typeof users.$inferSelect
  branding: Branding
  texts?: MailTexts
  /** Links der Direkt-Knöpfe (nur „Neue Anfrage“ an den Gastgeber). Ohne sie gibt es keine Knöpfe. */
  actionLinks?: { confirm: string; decline: string }
  /** Bisherige Zeit bei „Termin verschoben“ (aus dem Auftrag; fehlt bei alten Aufträgen) */
  previous?: { startsAt: string; endsAt: string }
  /** Der Gast hat eine noch unbestätigte Anfrage zurückgezogen (Variante von „Absage bestätigt“) */
  wasPending?: boolean
  /** Zeitpunkt für „heute/morgen“ (Standard: jetzt) */
  now?: Date
}

/* Texte. M2: pro Instanz überschreibbar (Platzhalter {vorname}, {termin} …). Eigene Texte der Nutzer haben immer Vorrang. */
const T = {
  de: {
    hello: (n: string) => `Hallo ${n},`,
    'guest.confirmed': { subject: 'Bestätigt: {termin} am {datum} um {uhrzeit} Uhr', intro: 'dein Termin ist bestätigt. Alle Angaben stehen unten. Mit dem Knopf „Zum Kalender hinzufügen“ trägst du ihn in deinen Kalender ein.' },
    'guest.requested': { subject: 'Anfrage erhalten: {termin} am {datum} um {uhrzeit} Uhr', intro: '{gastgeber} hat deine Anfrage erhalten und meldet sich bei dir. Noch ist der Termin nicht bestätigt. Die Zeit ist bis dahin für dich reserviert.' },
    'guest.declined': { subject: 'Leider nicht möglich: {termin} am {datum} um {uhrzeit} Uhr', intro: '{gastgeber} kann deine Anfrage leider nicht annehmen.' },
    'guest.cancelled': { subject: 'Abgesagt: {termin} am {datum} um {uhrzeit} Uhr', intro: '{gastgeber} hat den Termin abgesagt.' },
    'guest.cancelledSelf': { subject: 'Absage bestätigt: {termin} am {datum} um {uhrzeit} Uhr', intro: 'du hast den Termin abgesagt. Der Termin ist damit aus dem Kalender von {gastgeber} gestrichen. Falls das ein Versehen war, kannst du unten einen neuen Termin wählen.' },
    'guest.rescheduled': { subject: 'Verschoben: {termin}, jetzt am {datum} um {uhrzeit} Uhr', intro: 'dein Termin hat eine neue Zeit. Mit dem Knopf „Zum Kalender hinzufügen“ trägst du die neue Zeit in deinen Kalender ein.' },
    'host.new': { subject: 'Neue Buchung: {gast}, {datum} um {uhrzeit} Uhr', intro: '{gast} hat einen Termin bei dir gebucht.' },
    'host.requested': { subject: 'Neue Anfrage: {gast}, {datum} um {uhrzeit} Uhr', intro: '{gast} möchte einen Termin bei dir. Bitte bestätige oder lehne die Anfrage ab.' },
    'host.cancelled': { subject: 'Abgesagt von {gast}: {datum} um {uhrzeit} Uhr', intro: '{gast} hat den Termin abgesagt.' },
    'host.rescheduled': { subject: 'Verschoben von {gast}: jetzt am {datum} um {uhrzeit} Uhr', intro: '{gast} hat den Termin auf eine neue Zeit verschoben.' },
    'guest.reminder': { subject: 'Erinnerung: {termin} {tag} um {uhrzeit} Uhr', intro: 'dein Termin „{termin}“ mit {gastgeber} ist {tag} um {uhrzeit} Uhr.' },
    withdrawn: { subject: 'Anfrage zurückgezogen: {termin} am {datum} um {uhrzeit} Uhr', intro: 'du hast deine Anfrage zurückgezogen. Sie ist damit hinfällig und {gastgeber} wurde informiert. Falls das ein Versehen war, kannst du unten einen neuen Termin wählen.' },
    buttonsHint: ' Das geht direkt mit den Knöpfen unten.',
    when: 'Wann',
    before: 'Bisher',
    with: 'Mit',
    where: 'Wo',
    reason: 'Nachricht',
    join: 'Videocall beitreten',
    addCal: 'Zum Kalender hinzufügen',
    manage: 'Verschieben oder absagen',
    rebook: 'Neuen Termin wählen',
    open: 'In termind öffnen',
    accept: 'Bestätigen',
    decline: 'Ablehnen',
    actionHint: (days: number) => `Ein Klick öffnet zuerst eine Seite, auf der du die Entscheidung noch einmal bestätigst. Die Knöpfe gelten ${days} Tage, höchstens bis zum Termin, und nur einmal.`,
    answers: 'Angaben',
    uhr: ' Uhr',
    today: 'heute',
    tomorrow: 'morgen',
    on: (d: string) => `am ${d}`,
    timezoneNote: (tz: string) => `Alle Zeiten in deiner Zeitzone: ${tz}`,
    atGuest: 'Beim Gast',
    phoneHost: (n: string) => `${n} ruft dich an`,
    phoneGuest: (nr: string) => `Bitte ruf an: ${nr}`,
    footer: (i: string) => `Gesendet von ${i}`,
  },
  en: {
    hello: (n: string) => `Hi ${n},`,
    'guest.confirmed': { subject: 'Confirmed: {termin} on {datum} at {uhrzeit}', intro: 'your meeting is confirmed. All details are below. Use the “Add to calendar” button to save it to your calendar.' },
    'guest.requested': { subject: 'Request received: {termin} on {datum} at {uhrzeit}', intro: '{gastgeber} received your request and will get back to you. The meeting is not confirmed yet. The time is held for you until then.' },
    'guest.declined': { subject: 'Not possible: {termin} on {datum} at {uhrzeit}', intro: '{gastgeber} is unfortunately unable to accept your request.' },
    'guest.cancelled': { subject: 'Cancelled: {termin} on {datum} at {uhrzeit}', intro: '{gastgeber} has cancelled the meeting.' },
    'guest.cancelledSelf': { subject: 'Cancellation confirmed: {termin} on {datum} at {uhrzeit}', intro: 'you cancelled the meeting. It has been removed from the calendar of {gastgeber}. If this was a mistake, you can pick a new time below.' },
    'guest.rescheduled': { subject: 'Rescheduled: {termin}, now on {datum} at {uhrzeit}', intro: 'your meeting has a new time. Use the “Add to calendar” button to save the new time to your calendar.' },
    'host.new': { subject: 'New booking: {gast}, {datum} at {uhrzeit}', intro: '{gast} booked a meeting with you.' },
    'host.requested': { subject: 'New request: {gast}, {datum} at {uhrzeit}', intro: '{gast} would like a meeting with you. Please accept or decline the request.' },
    'host.cancelled': { subject: 'Cancelled by {gast}: {datum} at {uhrzeit}', intro: '{gast} cancelled the meeting.' },
    'host.rescheduled': { subject: 'Rescheduled by {gast}: now {datum} at {uhrzeit}', intro: '{gast} moved the meeting to a new time.' },
    'guest.reminder': { subject: 'Reminder: {termin} {tag} at {uhrzeit}', intro: 'your meeting “{termin}” with {gastgeber} is {tag} at {uhrzeit}.' },
    withdrawn: { subject: 'Request withdrawn: {termin} on {datum} at {uhrzeit}', intro: 'you withdrew your request. {gastgeber} has been informed. If this was a mistake, you can pick a new time below.' },
    buttonsHint: ' You can do this right away with the buttons below.',
    when: 'When',
    before: 'Previously',
    with: 'With',
    where: 'Where',
    reason: 'Message',
    join: 'Join video call',
    addCal: 'Add to calendar',
    manage: 'Reschedule or cancel',
    rebook: 'Pick a new time',
    open: 'Open in termind',
    accept: 'Accept',
    decline: 'Decline',
    actionHint: (days: number) => `A click first opens a page where you confirm your decision once more. The buttons work for ${days} days, until the meeting at the latest, and only once.`,
    answers: 'Details',
    uhr: '',
    today: 'today',
    tomorrow: 'tomorrow',
    on: (d: string) => `on ${d}`,
    timezoneNote: (tz: string) => `All times in your time zone: ${tz}`,
    atGuest: 'For the guest',
    phoneHost: (n: string) => `${n} will call you`,
    phoneGuest: (nr: string) => `Please call: ${nr}`,
    footer: (i: string) => `Sent by ${i}`,
  },
} as const

/** Tage, die Anfrage-Links gültig sind (Anzeige im Hinweistext; passt zu ACTION_DAYS in services/actionTokens.ts) */
const ACTION_DAYS_SHOWN = 7

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function defaultTexts(template: MailTemplate, locale: Locale) {
  const t = T[locale][template]
  return { subject: t.subject, intro: t.intro }
}

/** Datum und Uhrzeit für Mails: de „17:00“ (dazu „Uhr“), en „5:00 pm“. */
function formatForMail(d: Date, tz: string, locale: Locale) {
  const date = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const time =
    locale === 'de'
      ? new Intl.DateTimeFormat('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
      : new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(/\s+/g, ' ').toLowerCase()
  return { date, time }
}

/** „heute“, „morgen“ oder „am <Datum>“ in der Zeitzone des Empfängers. */
export function relativeDay(start: Date, tz: string, locale: Locale, dateText: string, now = new Date()) {
  const t = T[locale]
  const today = todayIn(tz, now)
  const day = todayIn(tz, start)
  if (day === today) return t.today
  if (day === addDays(today, 1)) return t.tomorrow
  return t.on(dateText)
}

export function renderMail(requested: MailTemplate, ctx: Ctx) {
  const { booking: b, event: ev, host, branding } = ctx
  // Alte Aufträge: Absage durch den Gast bekam früher dieselbe Vorlage wie die Absage durch den Gastgeber
  const template: MailTemplate = requested === 'guest.cancelled' && b.cancelledBy === 'guest' ? 'guest.cancelledSelf' : requested
  const toGuest = template.startsWith('guest.')
  const isCancel = template.endsWith('cancelled') || template === 'guest.cancelledSelf'
  const locale: Locale = toGuest ? b.locale : host.locale
  const tz = toGuest ? b.guestTimezone : host.timezone
  const t = T[locale]
  const start = new Date(b.startsAt)
  const end = new Date(b.endsAt)
  const { date, time } = formatForMail(start, tz, locale)
  const endTime = formatForMail(end, tz, locale).time
  const timeRange = `${time} – ${endTime}${t.uhr}`
  const firstName = (toGuest ? b.guestName : host.name).split(' ')[0]
  const day = relativeDay(start, tz, locale, date, ctx.now)

  // Zeitzonenhinweis nur, wenn Gast und Gastgeber zur Terminzeit unterschiedliche Uhrzeiten sehen
  const tzDiffers = utcOffset(b.guestTimezone, start) !== utcOffset(host.timezone, start)
  const tzNote = toGuest && tzDiffers ? t.timezoneNote(timezoneLabel(tz, start)) : null
  const guestTimeRow = !toGuest && tzDiffers ? `${formatForMail(start, b.guestTimezone, locale).time} – ${formatForMail(end, b.guestTimezone, locale).time}${t.uhr} (${cityName(b.guestTimezone)})` : null

  const custom = ctx.texts?.[template]?.[locale]
  const base = template === 'guest.cancelledSelf' && ctx.wasPending ? t.withdrawn : t[template]
  let defaultIntro: string = base.intro
  if (template === 'host.requested' && ctx.actionLinks) defaultIntro += t.buttonsHint
  const tpl = { subject: custom?.subject?.trim() || base.subject, intro: custom?.intro?.trim() || defaultIntro }

  const isLive = b.status === 'confirmed' && !isCancel
  const loc = b.location
  let where = locationLabel(ev.location, locale)
  if (loc.kind === 'onsite') where = loc.value
  if (loc.kind === 'phone-host-calls') where = toGuest ? t.phoneHost(host.name) : `${locationLabel(loc, locale)}: ${b.answers.find((a) => a.fieldId === 'phone')?.value ?? ''}`
  // Telefonnummer des Gastgebers erst nach Bestätigung herausgeben
  if (loc.kind === 'phone-guest-calls') where = b.status === 'confirmed' || !toGuest ? t.phoneGuest(loc.value) : locationLabel(loc, locale)
  const joinUrl = isLive && loc.kind === 'video' ? safeHttpUrl(loc.value) : null

  const fill = (s: string) =>
    s
      // Funktion als Ersatz, damit $-Muster in Namen nicht als Ersetzungsmuster wirken
      .replaceAll('{vorname}', () => firstName)
      .replaceAll('{termin}', () => ev.title)
      .replaceAll('{datum}', () => date)
      .replaceAll('{uhrzeit}', () => time)
      .replaceAll('{tag}', () => day)
      .replaceAll('{gast}', () => b.guestName)
      .replaceAll('{gastgeber}', () => host.name)
      .replaceAll('{ort}', () => where)
  const subject = fill(tpl.subject).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim().slice(0, 250)
  const intro = fill(tpl.intro)

  const manageUrl = `${config.publicUrl}/b/${b.manageToken}`
  const icsUrl = `${config.publicUrl}/api/public/b/${b.manageToken}/ics`
  const rebookUrl = `${config.publicUrl}/${host.handle}/${ev.slug}`
  const adminUrl = `${config.publicUrl}/admin?termin=${b.id}`
  const accent = oklchToHex(0.47, 0.085, branding.accentHue)

  const buttons: { label: string; href: string; primary?: boolean }[] = []
  if (toGuest) {
    if (joinUrl) buttons.push({ label: t.join, href: joinUrl })
    if (isLive && (template === 'guest.confirmed' || template === 'guest.rescheduled')) buttons.push({ label: t.addCal, href: icsUrl })
    if (isLive || b.status === 'pending') buttons.push({ label: t.manage, href: manageUrl })
    if (isCancel || template === 'guest.declined') buttons.push({ label: t.rebook, href: rebookUrl })
  } else {
    if (ctx.actionLinks && template === 'host.requested') {
      buttons.push({ label: t.accept, href: ctx.actionLinks.confirm }, { label: t.decline, href: ctx.actionLinks.decline })
    }
    buttons.push({ label: t.open, href: adminUrl })
    if (joinUrl) buttons.push({ label: t.join, href: joinUrl })
  }
  if (buttons.length) buttons[0].primary = true
  const actionHint = ctx.actionLinks && template === 'host.requested' ? t.actionHint(ACTION_DAYS_SHOWN) : null

  // Datum darf umbrechen, die Uhrzeit bleibt in einer Zeile
  const nowrap = (x: string) => `<span style="white-space:nowrap">${x}</span>`
  const rows: [string, string][] = [[t.when, `${html(date)}<br>${nowrap(html(timeRange))}`]]
  let beforeText: string | null = null
  if (ctx.previous && template.endsWith('rescheduled') && ctx.previous.startsAt !== b.startsAt) {
    const ps = new Date(ctx.previous.startsAt)
    const pe = new Date(ctx.previous.endsAt)
    const pd = formatForMail(ps, tz, locale)
    beforeText = `${pd.date}, ${pd.time} – ${formatForMail(pe, tz, locale).time}${t.uhr}`
    rows.push([t.before, `<span style="color:#8a8478;text-decoration:line-through">${html(pd.date)}<br>${nowrap(html(`${pd.time} – ${formatForMail(pe, tz, locale).time}${t.uhr}`))}</span>`])
  }
  if (toGuest) rows.push([t.with, html(host.name)])
  if (guestTimeRow) rows.push([t.atGuest, html(guestTimeRow)])
  rows.push([t.where, joinUrl ? `<a href="${html(joinUrl)}" style="color:${accent}">${html(where)}</a>` : html(where)])
  if (!toGuest) rows.push(['E-Mail', `<a href="mailto:${html(b.guestEmail)}" style="color:${accent}">${html(b.guestEmail)}</a>`])
  if (!toGuest) for (const a of b.answers) rows.push([html(a.label), html(a.value).replace(/\n/g, '<br>')])
  const showReason = b.cancelReason && (template === 'host.cancelled' || template === 'guest.cancelled' || template === 'guest.declined' || template.endsWith('rescheduled'))
  if (showReason) rows.push([t.reason, html(b.cancelReason!)])

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
${rows.map(([k, v]) => `<tr><td style="padding:4px 18px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td valign="top" align="left" style="width:84px;text-align:left;font-size:13px;color:#6f695f;padding:2px 8px 2px 0">${k}</td><td valign="top" align="left" style="text-align:left;font-size:14px;line-height:1.5;padding:2px 0">${v}</td></tr></table></td></tr>`).join('')}
<tr><td style="padding:6px 18px 14px;font-size:12px;color:#8a8478">${tzNote ? html(tzNote) : '&nbsp;'}</td></tr>
</table></td></tr>
<tr><td style="padding:18px 28px ${actionHint ? '8px' : '28px'}">${buttons
    .map((bt) =>
      bt.primary
        ? `<a href="${html(bt.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:10px;background:${accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${html(bt.label)}</a>`
        : `<a href="${html(bt.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 17px;border-radius:10px;border:1px solid #ddd8ce;color:#26231f;font-size:14px;font-weight:500;text-decoration:none">${html(bt.label)}</a>`,
    )
    .join('')}</td></tr>
${actionHint ? `<tr><td style="padding:0 28px 24px;font-size:12px;line-height:1.5;color:#8a8478">${html(actionHint)}</td></tr>` : ''}
</table>
<p style="margin:16px 0 0;font-size:12px;color:#8a8478">${html(t.footer(branding.instanceName))}</p>
</td></tr></table></body></html>`

  const text = [
    t.hello(firstName),
    '',
    intro,
    '',
    ev.title,
    `${t.when}: ${date}, ${timeRange}`,
    ...(beforeText ? [`${t.before}: ${beforeText}`] : []),
    ...(toGuest ? [`${t.with}: ${host.name}`] : []),
    ...(guestTimeRow ? [`${t.atGuest}: ${guestTimeRow}`] : []),
    `${t.where}: ${where}${joinUrl ? ` ${joinUrl}` : ''}`,
    ...(!toGuest ? [`E-Mail: ${b.guestEmail}`, ...b.answers.map((a) => `${a.label}: ${a.value}`)] : []),
    ...(showReason ? [`${t.reason}: ${b.cancelReason}`] : []),
    ...(tzNote ? ['', tzNote] : []),
    '',
    ...buttons.map((bt) => `${bt.label}: ${bt.href}`),
    ...(actionHint ? ['', actionHint] : []),
    '',
    `— ${t.footer(branding.instanceName)}`,
  ].join('\n')

  // Kalendereintrag: neu/verschoben → REQUEST, abgesagt → CANCEL. Anfragen bekommen noch keinen.
  let ics: { content: string; method: 'REQUEST' | 'CANCEL' } | null = null
  const wantsIcs = ['guest.confirmed', 'guest.rescheduled', 'guest.cancelled', 'guest.cancelledSelf', 'host.new', 'host.rescheduled', 'host.cancelled'].includes(template)
  if (wantsIcs) {
    const method = isCancel ? 'CANCEL' : 'REQUEST'
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
        locale,
      }),
    }
  }

  /*
   * Reply-To: Gast-Mails → Antwort geht an den Gastgeber, Gastgeber-Mails → Antwort geht an den Gast.
   * Bei Gast-Mails hat ein in den Einstellungen eingetragenes „Antworten an“ Vorrang (replyOverridable, siehe transport.ts).
   */
  const replyTo: MailAddress = toGuest ? { name: host.name, email: host.email } : { name: b.guestName, email: b.guestEmail }
  return {
    subject,
    html: body,
    text,
    ics,
    to: toGuest ? { name: b.guestName, email: b.guestEmail } : { name: host.name, email: host.email },
    replyTo,
    replyOverridable: toGuest,
  }
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
