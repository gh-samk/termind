import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { brandingSchema, smtpSchema } from '../../shared/schemas'
import type { Branding } from '../../shared/types'
import type { MailTexts } from '../mail/templates'
import { db } from '../db/client'
import { settings } from '../db/schema'
import { type Actor, requireOwner } from '../lib/actor'
import { encrypt } from '../lib/util'
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
}

const defaults: SettingsMap = {
  setupComplete: false,
  branding: { instanceName: 'termind', accentHue: 172, imprintUrl: '', privacyUrl: '', consentRequired: true },
  smtp: null,
  retentionMonths: 12,
  mailTexts: {},
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

/** SMTP speichern. Das Passwort wird verschlüsselt abgelegt und nie wieder ausgegeben. */
export async function updateSmtp(actor: Actor, input: z.infer<typeof smtpSchema>) {
  requireOwner(actor)
  const prev = await getSetting('smtp')
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
  await audit(actor, 'E-Mail-Versand (SMTP) geändert', input.host, 'write')
  return publicSmtp(next)
}

export function publicSmtp(s: SmtpSettings | null) {
  if (!s) return null
  const { passwordEnc, ...rest } = s
  return { ...rest, hasPassword: !!passwordEnc }
}
