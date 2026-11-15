import { z } from 'zod'
import { safeHttpUrl } from './url'

/* Eingabe-Schemas. Werden von REST, MCP und Web-Formularen gemeinsam genutzt. */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Uhrzeit im Format HH:MM')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT')
const range = z.tuple([hhmm, hhmm]).refine(([a, b]) => a < b, 'Ende muss nach dem Beginn liegen')

export const weeklySchema = z.object({
  mo: z.array(range),
  di: z.array(range),
  mi: z.array(range),
  do: z.array(range),
  fr: z.array(range),
  sa: z.array(range),
  so: z.array(range),
})

export const scheduleUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  timezone: z.string().min(1).optional(),
  weekly: weeklySchema.optional(),
})

export const exceptionSchema = z
  .object({
    title: z.string().min(1).max(80),
    fromDate: isoDate,
    toDate: isoDate,
    kind: z.enum(['off', 'hours']),
    hours: z.array(range).optional(),
  })
  .refine((x) => x.fromDate <= x.toDate, 'Das Enddatum liegt vor dem Startdatum')
  .refine((x) => x.kind === 'off' || (x.hours && x.hours.length > 0), 'Bitte Zeiten angeben')

export const locationSchema = z.object({
  kind: z.enum(['video', 'video-template', 'onsite', 'phone-host-calls', 'phone-guest-calls']),
  value: z.string().max(500).default(''),
  label: z.string().max(40).optional(),
}).refine((l) => (l.kind !== 'video' && l.kind !== 'video-template') || /^https:\/\//i.test(l.value) && safeHttpUrl(l.value.replaceAll('{id}', 'x')) !== null, { message: 'Bitte gib einen Link beginnend mit https:// an.', path: ['value'] })

export const fieldSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  label: z.string().min(1).max(120),
  type: z.enum(['text', 'textarea', 'phone', 'select', 'checkbox']),
  required: z.boolean(),
  options: z.array(z.string().min(1).max(80)).max(30).optional(),
})

/* Felder ohne Standardwerte: Basis für Teil-Updates (PATCH, MCP), die nichts zurücksetzen dürfen */
const eventTypeFields = {
  title: z.string().trim().min(1, 'Bitte einen Titel angeben').max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Nur Kleinbuchstaben, Zahlen und Bindestriche').max(60),
  description: z.string().max(2000),
  duration: z.number().int().min(5).max(480),
  location: locationSchema,
  color: z.number().int().min(0).max(360),
  active: z.boolean(),
  requiresConfirmation: z.boolean(),
  minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 60),
  windowDays: z.number().int().min(1).max(365),
  bufferBefore: z.number().int().min(0).max(240),
  bufferAfter: z.number().int().min(0).max(240),
  slotStep: z.number().int().min(5).max(240),
  fields: z.array(fieldSchema).max(20),
  reminders: z.array(z.number().int().min(5).max(60 * 24 * 14)).max(5),
  scheduleId: z.string().max(64),
}

export const eventTypeSchema = z.object({
  ...eventTypeFields,
  slug: eventTypeFields.slug.optional(),
  description: eventTypeFields.description.default(''),
  color: eventTypeFields.color.default(172),
  active: eventTypeFields.active.default(true),
  requiresConfirmation: eventTypeFields.requiresConfirmation.default(false),
  minNoticeMinutes: eventTypeFields.minNoticeMinutes.default(720),
  windowDays: eventTypeFields.windowDays.default(60),
  bufferBefore: eventTypeFields.bufferBefore.default(0),
  bufferAfter: eventTypeFields.bufferAfter.default(0),
  slotStep: eventTypeFields.slotStep.default(30),
  fields: eventTypeFields.fields.default([]),
  reminders: eventTypeFields.reminders.default([1440, 60]),
  scheduleId: eventTypeFields.scheduleId.optional(),
})
export const eventTypeUpdateSchema = z.object(eventTypeFields).partial()

export const bookingCreateSchema = z.object({
  eventTypeId: z.string().min(1),
  start: z.iso.datetime({ offset: true }),
  name: z
    .string()
    .trim()
    .min(1, 'Bitte deinen Namen angeben')
    .max(80, 'Der Name ist zu lang')
    .refine((v) => !/[\u0000-\u001f\u007f<>]|:\/\/|www\./i.test(v), 'Bitte nur deinen Namen angeben'),
  email: z.email('Bitte eine gültige E-Mail-Adresse angeben').max(200),
  timezone: z.string().min(1).max(64),
  locale: z.enum(['de', 'en']).default('de'),
  answers: z.record(z.string(), z.string().max(4000)).default({}),
  consent: z.boolean().optional(),
  /** Nur für Gastgeber: Termin selbst eintragen. Für Gäste werden diese Felder ignoriert. */
  notifyGuest: z.boolean().default(true),
  anyTime: z.boolean().optional(),
  note: z.string().max(4000).optional(),
})

export const cancelSchema = z.object({ reason: z.string().max(1000).optional() })
export const rescheduleSchema = z.object({ start: z.iso.datetime({ offset: true }), reason: z.string().max(1000).optional(), anyTime: z.boolean().optional() })

export const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['starttls', 'tls', 'none']),
  user: z.string().default(''),
  password: z.string().optional(), // leer = unverändert
  fromName: z.string().min(1).max(120),
  fromEmail: z.email(),
  replyTo: z.email().or(z.literal('')).default(''),
})

/** „Verbindung testen“ mit den Werten aus dem Formular, ohne zu speichern */
export const smtpCheckSchema = smtpSchema.pick({ host: true, port: true, security: true, user: true, password: true })

/** Mindestlänge für Passwörter (Einrichtung, Ändern, Zurücksetzen) */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 200
export const newPasswordSchema = z.string().min(PASSWORD_MIN, `Mindestens ${PASSWORD_MIN} Zeichen`).max(PASSWORD_MAX, 'Höchstens 200 Zeichen')

export const passwordResetRequestSchema = z.object({ email: z.string().max(254) })
export const passwordResetConfirmSchema = z.object({ token: z.string().min(20).max(200), password: newPasswordSchema })

const httpUrl = z.url({ protocol: /^https?$/ }).max(500)

export const brandingSchema = z.object({
  instanceName: z.string().min(1).max(80).optional(),
  accentHue: z.number().int().min(0).max(360).optional(),
  imprintUrl: httpUrl.or(z.literal('')).optional(),
  privacyUrl: httpUrl.or(z.literal('')).optional(),
  consentRequired: z.boolean().optional(),
})

export const profileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  subtitle: z.string().max(160).optional(),
  handle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(40).optional(),
  timezone: z.string().optional(),
  locale: z.enum(['de', 'en']).optional(),
})

export const setupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  password: newPasswordSchema,
  timezone: z.string().min(1),
  instanceName: z.string().trim().min(1).max(80),
})

export type EventTypeInput = z.input<typeof eventTypeSchema>
export type BookingCreateInput = z.input<typeof bookingCreateSchema>

/** Direkt-Knopf aus der Anfrage-Mail: optionale Nachricht an den Gast beim Ablehnen */
export const ACTION_MESSAGE_MAX = 500
export const actionExecuteSchema = z.object({ message: z.string().max(ACTION_MESSAGE_MAX).optional() })
