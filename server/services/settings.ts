import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { brandingSchema, smtpSchema } from '../../shared/schemas'
import type { Branding } from '../../shared/types'
import type { MailTexts } from '../mail/templates'
import { db } from '../db/client'
import { settings } from '../db/schema'
import { type Actor, requireOwner } from '../lib/actor'
import { AppError, invalid } from '../lib/errors'
import { encrypt } from '../lib/util'
import { resolveSmtpHost } from '../mail/transport'
import { audit } from './audit'

export interface SmtpSettings {
  host: string
  port: number
  security: 'starttls' | 'tls' | 'none'
  user: string
  passwordEnc: string | null
  fromName: string
  fromEmail: string
  replyTo: string
}

interface SettingsMap {
  setupComplete: boolean
  branding: Branding
  smtp: SmtpSettings | null
  retentionMonths: number
  mailTexts: MailTexts
  /** Zeitpunkt der letzten erfolgreichen Testmail mit den gespeicherten Mail-Einstellungen („“ = noch keine) */
  lastSmtpOk: string
  /** Fortschritt der Checkliste „Erste Schritte“ */
  onboarding: { availabilitySavedAt: string | null; hidden: boolean; doneDismissed: boolean }
}

const defaults: SettingsMap = {
  setupComplete: false,
  branding: { instanceName: 'termind', accentHue: 172, imprintUrl: '', privacyUrl: '', consentRequired: true },
  smtp: null,
  retentionMonths: 12,
  mailTexts: {},
  lastSmtpOk: '',
  onboarding: { availabilitySavedAt: null, hidden: false, doneDismissed: false },
}

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) })
  if (!row) return defaults[key]
  const v = row.value as SettingsMap[K]
  return typeof defaults[key] === 'object' && defaults[key] !== null && v ? { ...(defaults[key] as object), ...(v as object) } as SettingsMap[K] : v
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

export async function updateBranding(actor: Actor, input: z.infer<typeof brandingSchema>) {
  requireOwner(actor)
  const next = { ...(await getSetting('branding')), ...input }
  await setSetting('branding', next)
  await audit(actor, 'Marke & Rechtliches geändert', '', 'write')
  return next
}

export const PASSWORD_AGAIN = 'Bitte gib das Passwort erneut ein, wenn du Server oder Benutzer änderst.'

/** Gleicher Server, Port, Verschlüsselung und Benutzer? Nur dann darf das gespeicherte Passwort weiterverwendet werden. */
export function sameConnection(a: { host: string; port: number; security: string; user: string }, b: { host: string; port: number; security: string; user: string }) {
  return a.host.trim().toLowerCase() === b.host.trim().toLowerCase() && Number(a.port) === Number(b.port) && a.security === b.security && a.user === b.user
}

/** SMTP speichern. Das Passwort wird verschlüsselt abgelegt und nie wieder ausgegeben. */
export async function updateSmtp(actor: Actor, input: z.infer<typeof smtpSchema>) {
  requireOwner(actor)
  const prev = await getSetting('smtp')
  if (!input.password && prev?.passwordEnc && !sameConnection(prev, input)) throw invalid(PASSWORD_AGAIN)
  // Interne Adressen werden nicht gespeichert (ein nicht auflösbarer Name schon: der Fehler zeigt sich beim Test)
  await resolveSmtpHost(input.host).catch((e) => { if (e instanceof AppError) throw e })
  const next: SmtpSettings = {
    host: input.host,
    port: input.port,
    security: input.security,
    user: input.user,
    passwordEnc: input.password ? encrypt(input.password) : (prev?.passwordEnc ?? null),
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo,
  }
  await setSetting('smtp', next)
  // Neue Zugangsdaten: die letzte erfolgreiche Testmail gilt nicht mehr
  const changed = !prev || prev.host !== next.host || prev.port !== next.port || prev.security !== next.security || prev.user !== next.user || prev.fromEmail !== next.fromEmail || !!input.password
  if (changed) await setSetting('lastSmtpOk', '')
  await audit(actor, 'E-Mail-Versand (SMTP) geändert', input.host, 'write')
  return publicSmtp(next)
}

export function publicSmtp(s: SmtpSettings | null) {
  if (!s) return null
  const { passwordEnc, ...rest } = s
  return { ...rest, hasPassword: !!passwordEnc }
}
