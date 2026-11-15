import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import nodemailer, { type Transporter } from 'nodemailer'
import { z } from 'zod'
import { allowPrivateEnv, isPrivateIp } from '../lib/safeFetch'
import { decrypt, nowIso } from '../lib/util'
import { AppError, invalid } from '../lib/errors'
import { getSetting, PASSWORD_AGAIN, sameConnection, setSetting, type SmtpSettings } from '../services/settings'

let cached: { key: string; t: Transporter } | null = null

/** Verbindungsdaten ohne Absender: genug zum Anmelden und Prüfen */
interface Connection {
  host: string
  port: number
  security: SmtpSettings['security']
  user: string
  password: string
}

export const PRIVATE_SMTP_MESSAGE = 'Dieser Mailserver liegt in einem internen Netz. Für eigene Server im lokalen Netz muss ALLOW_PRIVATE_HOSTS=true gesetzt sein.'

/**
 * Löst den Servernamen auf und prüft ALLE Adressen (wie bei Kalender-Abrufen).
 * Verbunden wird mit der geprüften IP, der Name bleibt nur für die TLS-Prüfung (SNI, Zertifikat):
 * So kann eine spätere DNS-Antwort nicht auf eine interne Adresse umschwenken (DNS-Rebinding).
 */
export async function resolveSmtpHost(host: string): Promise<{ connectHost: string; servername?: string }> {
  const name = host.trim().replace(/^\[|\]$/g, '')
  if (allowPrivateEnv()) return { connectHost: name }
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(name)) throw invalid(PRIVATE_SMTP_MESSAGE)
  if (isIP(name)) {
    if (isPrivateIp(name)) throw invalid(PRIVATE_SMTP_MESSAGE)
    return { connectHost: name }
  }
  let list: { address: string }[]
  try {
    list = await lookup(name, { all: true })
  } catch (e) {
    throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: (e as { code?: string }).code ?? 'ENOTFOUND' })
  }
  if (list.length === 0 || list.some((a) => isPrivateIp(a.address))) throw invalid(PRIVATE_SMTP_MESSAGE)
  return { connectHost: list[0].address, servername: name }
}

async function build(c: Connection, timeoutMs = 15_000) {
  const { connectHost, servername } = await resolveSmtpHost(c.host)
  return { connectHost, t: nodemailer.createTransport({
    host: connectHost,
    port: c.port,
    secure: c.security === 'tls',
    requireTLS: c.security === 'starttls',
    ignoreTLS: c.security === 'none',
    ...(servername ? { tls: { servername } } : {}),
    auth: c.user ? { user: c.user, pass: c.password } : undefined,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: Math.max(timeoutMs, 30_000),
  }) }
}

const connectionOf = (s: SmtpSettings): Connection => ({ host: s.host, port: s.port, security: s.security, user: s.user, password: s.passwordEnc ? decrypt(s.passwordEnc) : '' })

/**
 * Übersetzt einen Fehler von nodemailer in einen Satz, den man ohne Vorwissen versteht.
 * Gibt nie den Rohtext zurück (der kann Servernamen oder Antworten enthalten und gehört ins Server-Log).
 */
export function explainSmtp(err: unknown): string {
  // Eigene, schon verständliche Meldungen (z. B. „noch nicht eingerichtet“) unverändert durchreichen
  if (err instanceof AppError) return err.message
  const e = (err ?? {}) as { code?: string; responseCode?: number; command?: string; message?: string }
  const code = String(e.code ?? '')
  const msg = String(e.message ?? err ?? '')
  const rc = Number(e.responseCode) || Number(/\b([45]\d\d)[ -]/.exec(msg)?.[1]) || 0

  if (code === 'EAUTH' || rc === 535 || rc === 534 || rc === 530 || /invalid login|authentication (failed|unsuccessful|required)|username and password not accepted|auth.*(rejected|denied)/i.test(msg)) {
    return 'Benutzername oder Passwort falsch. Bei Gmail, Microsoft und manchen Anbietern brauchst du ein App-Passwort.'
  }
  if (/wrong version number|ssl|tls|certificate|self[- ]signed|cert_|handshake|eproto|unable to verify/i.test(`${code} ${msg}`) && !/ECONNREFUSED|ENOTFOUND/.test(code)) {
    return 'Verschlüsselung passt nicht zum Port. Mit SSL/TLS nutzt du meist Port 465, mit STARTTLS Port 587. Bei einer Zertifikatswarnung prüfe, ob der Servername genau so beim Anbieter steht.'
  }
  if (/^(ECONNECTION|ECONNREFUSED|ETIMEDOUT|ETIMEOUT|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EDNS|ESOCKET)$/.test(code) || /timed? ?out|getaddrinfo|connection closed|greeting never received/i.test(msg)) {
    return 'Server nicht erreichbar. Prüfe Servername und Port. Der Port muss zur gewählten Verschlüsselung passen (465 mit SSL/TLS, 587 mit STARTTLS).'
  }
  if (code === 'EENVELOPE' || ((rc === 550 || rc === 553 || rc === 551 || rc === 554) && (e.command === 'MAIL FROM' || /sender|absender|from address|not owned|not authori[sz]ed to send|mailbox name not allowed/i.test(msg)))) {
    return 'Der Server lehnt die Absenderadresse ab. Nutze die Adresse deines Postfachs oder eine Adresse, die dein Anbieter als Absender erlaubt.'
  }
  if (rc === 550 || rc === 553 || rc === 554) return `Der Server hat die Mail abgelehnt (Code ${rc}). Prüfe die Empfängeradresse und die Absenderangaben.`
  return 'Der Mail-Versand hat nicht geklappt. Prüfe Server, Port und Zugangsdaten oder versuche es später noch einmal. Genaueres steht im Server-Log.'
}

/** Rohfehler ins Server-Log (ohne Zugangsdaten: nodemailer nimmt sie nie in Meldungen auf). */
export function logSmtpError(where: string, err: unknown) {
  const e = (err ?? {}) as { code?: string; responseCode?: number; message?: string }
  console.warn(`[mail] ${where}: ${e.code ?? ''} ${e.responseCode ?? ''} ${String(e.message ?? err).slice(0, 300)}`.replace(/\s+/g, ' '))
}

export async function getTransport() {
  const s = await getSetting('smtp')
  if (!s) throw invalid('Der E-Mail-Versand ist noch nicht eingerichtet (Einstellungen → E-Mail).')
  // Name bei jedem Versand neu auflösen und prüfen; der Transporter wird nur wiederverwendet, solange die geprüfte Adresse gleich bleibt
  const { connectHost } = await resolveSmtpHost(s.host)
  const key = JSON.stringify([s, connectHost])
  if (!cached || cached.key !== key) cached = { key, t: (await build(connectionOf(s))).t }
  return { transporter: cached.t, smtp: s }
}

export interface OutgoingMail {
  to: { name: string; email: string }
  subject: string
  html: string
  text: string
  ics?: { content: string; method: 'REQUEST' | 'CANCEL' } | null
  /** Antwortadresse dieser Mail (Gast-Mails: Gastgeber, Gastgeber-Mails: Gast) */
  replyTo?: { name: string; email: string }
  /** true: ein in den Einstellungen eingetragenes „Antworten an“ hat Vorrang vor replyTo (Gast-Mails). Gastgeber-Mails gehen immer an den Gast. */
  replyOverridable?: boolean
}

const addressSchema = z.email().max(254)
/** Steuerzeichen (auch Zeilenumbrüche) aus Namen und Betreffs entfernen: Schutz vor Header-Injection. */
export const cleanHeader = (s: string) => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Adresse nur in Objektform (name + address) und nur, wenn sie eine gültige, einzelne E-Mail-Adresse ist. */
export function safeAddress(name: string, email: string): { name: string; address: string } | undefined {
  // Roh prüfen (nicht vorher bereinigen): Adressen mit Zeilenumbruch, Leerzeichen oder Komma sind ungültig
  if (!addressSchema.safeParse(email).success) return undefined
  return { name: cleanHeader(name).slice(0, 200), address: email }
}

/**
 * Baut die Nachricht für nodemailer. Alle Adressen gehen in Objektform durch safeAddress, der Betreff wird bereinigt.
 * Reply-To: bei Gast-Mails zuerst das konfigurierte „Antworten an“, sonst der Gastgeber; bei Gastgeber-Mails der Gast.
 * Eine ungültige Antwortadresse wird weggelassen, eine ungültige Empfängeradresse bricht ab.
 */
export function buildMessage(smtp: Pick<SmtpSettings, 'fromName' | 'fromEmail' | 'replyTo'>, m: OutgoingMail) {
  const to = safeAddress(m.to.name, m.to.email)
  if (!to) throw invalid('Die Empfängeradresse ist ungültig.')
  const configured = smtp.replyTo ? safeAddress('', smtp.replyTo) : undefined
  const own = m.replyTo ? safeAddress(m.replyTo.name, m.replyTo.email) : undefined
  const replyTo = m.replyOverridable || !m.replyTo ? (configured ?? own) : (own ?? configured)
  return {
    from: { name: cleanHeader(smtp.fromName), address: smtp.fromEmail },
    ...(replyTo ? { replyTo } : {}),
    to,
    subject: cleanHeader(m.subject),
    text: m.text,
    html: m.html,
    /*
     * Genau ein Kalenderteil: die text/calendar-Alternative mit method (so erkennen Outlook, Apple Kalender und Gmail die Einladung).
     * nodemailers `icalEvent` hängt zusätzlich immer eine Datei an (zwei Teile, Clients könnten doppelt importieren).
     * Wer die Einladung als Datei braucht, nutzt den Knopf „Zum Kalender hinzufügen“.
     */
    ...(m.ics ? { alternatives: [{ contentType: `text/calendar; charset=utf-8; method=${m.ics.method}`, content: m.ics.content }] } : {}),
  }
}

export async function sendMail(m: OutgoingMail) {
  const { transporter, smtp } = await getTransport()
  await transporter.sendMail(buildMessage(smtp, m))
}

/** Verbindung prüfen und Testmail senden. Bei Erfolg merkt sich termind den Zeitpunkt (für die Checkliste „Erste Schritte“). */
export async function sendTestMail(to: string) {
  const { transporter, smtp } = await getTransport()
  try {
    await transporter.verify()
    await transporter.sendMail({
      from: { name: smtp.fromName, address: smtp.fromEmail },
      to,
      subject: 'termind: Testmail',
      text: 'Der E-Mail-Versand funktioniert. Diese Mail wurde von deiner termind-Instanz gesendet.',
    })
  } catch (e) {
    logSmtpError('Testmail', e)
    throw invalid(explainSmtp(e))
  }
  await setSetting('lastSmtpOk', nowIso())
}

/**
 * „Verbindung testen“ mit den Werten aus dem Formular, ohne zu speichern.
 * Ist das Passwort leer und schon eines gespeichert, gilt das gespeicherte (wie beim Speichern).
 * Es wird nur angemeldet, keine Mail verschickt.
 */
export async function checkSmtpConnection(input: { host: string; port: number; security: SmtpSettings['security']; user: string; password?: string }) {
  const saved = await getSetting('smtp')
  let password = input.password ?? ''
  // Das gespeicherte Passwort geht nur an genau den gespeicherten Server
  if (!password && saved?.passwordEnc) {
    if (!sameConnection(saved, input)) throw invalid(PASSWORD_AGAIN)
    password = decrypt(saved.passwordEnc)
  }
  let t: Transporter | undefined
  try {
    t = (await build({ host: input.host.trim(), port: input.port, security: input.security, user: input.user, password }, 10_000)).t
    await t.verify()
  } catch (e) {
    logSmtpError('Verbindungstest', e)
    throw invalid(explainSmtp(e))
  } finally {
    t?.close()
  }
}
