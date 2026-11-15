/**
 * Anbieter-Vorlagen für den Mail-Versand (SMTP).
 * Es stehen nur Werte drin, die der Anbieter dokumentiert. Bei „All-Inkl“ und „Sonstiges“
 * gibt es bewusst keinen Server: Er ist dort individuell und steht im Kundenmenü des Anbieters.
 * Dieselbe Tabelle steht in docs/ANLEITUNG.md, bitte beide gemeinsam ändern.
 */
export type SmtpSecurity = 'starttls' | 'tls' | 'none'

export interface SmtpProvider {
  id: string
  label: string
  host: string
  port: number
  security: SmtpSecurity
  /** Kurzer Hinweis unter dem Auswahlfeld */
  note?: string
}

export const SMTP_PROVIDERS: SmtpProvider[] = [
  { id: 'mailbox', label: 'mailbox.org', host: 'smtp.mailbox.org', port: 465, security: 'tls', note: 'Benutzername ist deine E-Mail-Adresse. Mit Zwei-Faktor-Anmeldung brauchst du ein eigenes Passwort für Programme (unter „Sicherheit“ bei mailbox.org).' },
  { id: 'ionos', label: 'IONOS', host: 'smtp.ionos.de', port: 587, security: 'starttls', note: 'Benutzername ist deine volle E-Mail-Adresse.' },
  { id: 'strato', label: 'Strato', host: 'smtp.strato.de', port: 465, security: 'tls', note: 'Benutzername ist deine volle E-Mail-Adresse.' },
  { id: 'hetzner', label: 'Hetzner (KonsoleH / Webhosting)', host: 'mail.your-server.de', port: 587, security: 'starttls', note: 'Benutzername ist deine volle E-Mail-Adresse.' },
  { id: 'allinkl', label: 'All-Inkl', host: '', port: 587, security: 'starttls', note: 'Der Server ist bei All-Inkl individuell. Du findest ihn im Kundenbereich (KAS) beim E-Mail-Konto, meist ein Name wie wXXXXXXX.kasserver.com.' },
  { id: 'gmx', label: 'GMX', host: 'mail.gmx.net', port: 587, security: 'starttls', note: 'Erst in GMX unter „Einstellungen → Sicherheit“ den Abruf per POP3/IMAP und SMTP erlauben. Mit Zwei-Faktor-Anmeldung ist ein Anwendungspasswort nötig.' },
  { id: 'webde', label: 'WEB.DE', host: 'smtp.web.de', port: 587, security: 'starttls', note: 'Erst in WEB.DE den Abruf per POP3/IMAP und SMTP erlauben. Mit Zwei-Faktor-Anmeldung ist ein Anwendungspasswort nötig.' },
  { id: 'tonline', label: 'T-Online', host: 'securesmtp.t-online.de', port: 587, security: 'starttls', note: 'Du brauchst ein eigenes E-Mail-Passwort für Programme. Das richtest du im Kundencenter ein.' },
  { id: 'google', label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 587, security: 'starttls', note: 'App-Passwort nötig: Google-Konto → Sicherheit → Bestätigung in zwei Schritten → App-Passwörter. Dein normales Passwort funktioniert hier nicht.' },
  { id: 'microsoft', label: 'Microsoft 365 / Outlook', host: 'smtp.office365.com', port: 587, security: 'starttls', note: 'Bei Microsoft 365 muss der Versand per SMTP für das Postfach erlaubt sein, sonst kommt „Anmeldung abgelehnt“. Mit Zwei-Faktor-Anmeldung brauchst du ein App-Passwort.' },
  { id: 'other', label: 'Sonstiger Anbieter', host: '', port: 587, security: 'starttls', note: 'Die Angaben findest du bei deinem Anbieter, meist unter „Postausgangsserver“ oder „SMTP“.' },
]

export const DEFAULT_PORT: Record<SmtpSecurity, number | null> = { tls: 465, starttls: 587, none: null }

/** Anbieter zu den gespeicherten Werten finden (nur über den Servernamen). */
export function providerForHost(host: string): SmtpProvider | undefined {
  const h = host.trim().toLowerCase()
  return h ? SMTP_PROVIDERS.find((p) => p.host === h) : undefined
}

/**
 * Port nach einem Wechsel der Verschlüsselung: Standardport der neuen Variante,
 * aber nur, wenn der bisherige Port ein Standardport war (ein eigener Port bleibt stehen).
 */
export function portAfterSecurityChange(currentPort: number, next: SmtpSecurity): number {
  const isStandard = currentPort === 465 || currentPort === 587 || currentPort === 25
  const target = DEFAULT_PORT[next]
  return isStandard && target ? target : currentPort
}
