import nodemailer, { type Transporter } from 'nodemailer'
import { decrypt } from '../lib/util'
import { invalid } from '../lib/errors'
import { getSetting, type SmtpSettings } from '../services/settings'

let cached: { key: string; t: Transporter } | null = null

function build(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === 'tls',
    requireTLS: s.security === 'starttls',
    ignoreTLS: s.security === 'none',
    auth: s.user ? { user: s.user, pass: s.passwordEnc ? decrypt(s.passwordEnc) : '' } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
}

export async function getTransport() {
  const s = await getSetting('smtp')
  if (!s) throw invalid('Der E-Mail-Versand ist noch nicht eingerichtet (Einstellungen → E-Mail).')
  const key = JSON.stringify(s)
  if (!cached || cached.key !== key) cached = { key, t: build(s) }
  return { transporter: cached.t, smtp: s }
}

export interface OutgoingMail {
  to: { name: string; email: string }
  subject: string
  html: string
  text: string
  ics?: { content: string; method: 'REQUEST' | 'CANCEL' } | null
}

export async function sendMail(m: OutgoingMail) {
  const { transporter, smtp } = await getTransport()
  await transporter.sendMail({
    from: { name: smtp.fromName, address: smtp.fromEmail },
    replyTo: smtp.replyTo || undefined,
    to: { name: m.to.name, address: m.to.email },
    subject: m.subject,
    text: m.text,
    html: m.html,
    ...(m.ics
      ? {
          icalEvent: { method: m.ics.method, content: m.ics.content, filename: m.ics.method === 'CANCEL' ? 'abgesagt.ics' : 'termin.ics' },
        }
      : {}),
  })
}

/** Verbindung prüfen und Testmail senden. */
export async function sendTestMail(to: string) {
  const { transporter, smtp } = await getTransport()
  await transporter.verify()
  await transporter.sendMail({
    from: { name: smtp.fromName, address: smtp.fromEmail },
    to,
    subject: 'termind: Testmail',
    text: 'Der E-Mail-Versand funktioniert. Diese Mail wurde von deiner termind-Instanz gesendet.',
  })
}
