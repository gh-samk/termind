import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Locale } from '../../shared/types'
import { db } from '../db/client'
import { eventTypes, users } from '../db/schema'
import { type Actor, requireOwner } from '../lib/actor'
import { invalid } from '../lib/errors'
import { addDays, todayIn, zonedToUtc } from '../lib/time'
import { defaultTexts, MAIL_TEMPLATES, type MailTemplate, PLACEHOLDERS, renderMail } from '../mail/templates'
import { audit } from './audit'
import { getSetting, setSetting } from './settings'

export const mailTextSchema = z.object({ subject: z.string().max(250).default(''), intro: z.string().max(4000).default('') })
const isTemplate = (t: string): t is MailTemplate => MAIL_TEMPLATES.some((m) => m.id === t)
const isLocale = (l: string): l is Locale => l === 'de' || l === 'en'

export async function getMailTexts(actor: Actor) {
  requireOwner(actor)
  const custom = await getSetting('mailTexts')
  return {
    placeholders: PLACEHOLDERS,
    templates: MAIL_TEMPLATES.map((m) => ({
      ...m,
      de: { default: defaultTexts(m.id, 'de'), custom: custom[m.id]?.de ?? null },
      en: { default: defaultTexts(m.id, 'en'), custom: custom[m.id]?.en ?? null },
    })),
  }
}

export async function setMailText(actor: Actor, template: string, locale: string, raw: unknown | null) {
  requireOwner(actor)
  if (!isTemplate(template) || !isLocale(locale)) throw invalid('Unbekannte Vorlage.')
  const all = { ...(await getSetting('mailTexts')) }
  const entry = { ...(all[template] ?? {}) }
  if (raw === null) delete entry[locale]
  else {
    const v = mailTextSchema.parse(raw)
    entry[locale] = { subject: v.subject.trim() || undefined, intro: v.intro.trim() || undefined }
  }
  all[template] = entry
  await setSetting('mailTexts', all)
  await audit(actor, raw === null ? 'Mail-Text zurückgesetzt' : 'Mail-Text geändert', `${MAIL_TEMPLATES.find((m) => m.id === template)!.label} (${locale.toUpperCase()})`, 'write')
  return getMailTexts(actor)
}

/** Vorschau mit Beispieldaten und echtem Layout. */
export async function previewMail(actor: Actor, template: string, locale: string, raw: unknown) {
  const a = requireOwner(actor)
  if (!isTemplate(template) || !isLocale(locale)) throw invalid('Unbekannte Vorlage.')
  const v = mailTextSchema.parse(raw)
  const host = (await db.query.users.findFirst({ where: eq(users.id, a.userId) }))!
  const ev = (await db.query.eventTypes.findFirst({ where: eq(eventTypes.userId, a.userId), orderBy: asc(eventTypes.position) })) ?? {
    id: 'demo', userId: host.id, scheduleId: null, slug: 'beispiel', title: locale === 'de' ? 'Erstgespräch' : 'Intro call', description: '', duration: 30,
    location: { kind: 'video' as const, value: 'https://meet.jit.si/termind-beispiel' }, color: 172, active: true, requiresConfirmation: false,
    minNoticeMinutes: 0, windowDays: 60, bufferBefore: 0, bufferAfter: 0, slotStep: 30, fields: [], reminders: [], position: 0, createdAt: '', updatedAt: null,
  }
  const start = zonedToUtc(addDays(todayIn(host.timezone), 3), 10 * 60, host.timezone)
  const booking = {
    id: 'vorschau', manageToken: 'vorschau', eventTypeId: ev.id, hostId: host.id,
    startsAt: start.toISOString(), endsAt: new Date(start.getTime() + ev.duration * 60_000).toISOString(),
    bufferBefore: 0, bufferAfter: 0, guestName: 'Clara Beispiel', guestEmail: 'clara@example.org', guestTimezone: host.timezone, locale,
    answers: [{ fieldId: 'x', label: locale === 'de' ? 'Worum geht es?' : 'Topic', value: locale === 'de' ? 'Neue Website' : 'New website' }],
    location: ev.location.kind === 'video-template' ? { ...ev.location, kind: 'video' as const, value: ev.location.value.replace('{id}', 'beispiel') } : ev.location,
    status: template.includes('requested') ? ('pending' as const) : template.includes('cancelled') ? ('cancelled' as const) : template.includes('declined') ? ('declined' as const) : ('confirmed' as const),
    cancelReason: null, cancelledBy: null, sequence: 0, note: '', calendarRef: null, createdVia: 'web' as const, anonymizedAt: null, createdAt: '', updatedAt: null,
  }
  const m = renderMail(template, {
    booking, event: ev, host, branding: await getSetting('branding'),
    texts: { [template]: { [locale]: { subject: v.subject || undefined, intro: v.intro || undefined } } },
  })
  return { subject: m.subject, html: m.html }
}
