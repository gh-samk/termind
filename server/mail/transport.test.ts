import { describe, expect, it } from 'vitest'
import { invalid } from '../lib/errors'
import { explainSmtp } from './transport'

const err = (props: Record<string, unknown>, message = 'Fehler') => Object.assign(new Error(message), props)

describe('explainSmtp', () => {
  it('Anmeldung abgelehnt: EAUTH und 535', () => {
    for (const e of [err({ code: 'EAUTH', responseCode: 535 }, 'Invalid login: 535-5.7.8 Username and Password not accepted'), err({ responseCode: 535 }), err({}, '535 5.7.3 Authentication unsuccessful'), err({ code: 'EAUTH' })]) {
      expect(explainSmtp(e)).toBe('Benutzername oder Passwort falsch. Bei Gmail, Microsoft und manchen Anbietern brauchst du ein App-Passwort.')
    }
  })

  it('Server nicht erreichbar: Verbindungsfehler, Zeitüberschreitung, unbekannter Name', () => {
    for (const code of ['ECONNECTION', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']) {
      const msg = explainSmtp(err({ code }, `connect ${code} 1.2.3.4:25`))
      expect(msg, code).toMatch(/^Server nicht erreichbar\. Prüfe Servername und Port/)
    }
    expect(explainSmtp(err({}, 'Greeting never received'))).toMatch(/^Server nicht erreichbar/)
  })

  it('Verschlüsselung passt nicht zum Port: TLS, Zertifikat, falsche Version', () => {
    for (const m of ['error:0A00010B:SSL routines:ssl3_get_record:wrong version number', 'self-signed certificate', 'unable to verify the first certificate', 'Client network socket disconnected before secure TLS connection was established']) {
      expect(explainSmtp(err({ code: 'ESOCKET' }, m)), m).toMatch(/^Verschlüsselung passt nicht zum Port/)
    }
  })

  it('Absenderadresse abgelehnt: 550/553 bei MAIL FROM, EENVELOPE', () => {
    expect(explainSmtp(err({ responseCode: 553, command: 'MAIL FROM' }, '553 5.7.1 Sender address rejected: not owned by user'))).toMatch(/^Der Server lehnt die Absenderadresse ab/)
    expect(explainSmtp(err({ responseCode: 550 }, '550 Sender not allowed'))).toMatch(/^Der Server lehnt die Absenderadresse ab/)
    expect(explainSmtp(err({ code: 'EENVELOPE' }))).toMatch(/^Der Server lehnt die Absenderadresse ab/)
  })

  it('anderer 55x-Fehler nennt den Code, ohne den Rohtext zu zeigen', () => {
    const m = explainSmtp(err({ responseCode: 554, command: 'RCPT TO' }, '554 5.7.1 geheime-interne-info'))
    expect(m).toMatch(/Code 554/)
    expect(m).not.toContain('geheime-interne-info')
  })

  it('Fallback ist kurz und deutsch und enthält keinen Rohtext', () => {
    const m = explainSmtp(err({ code: 'EWHATEVER' }, 'Unbekannter Fehler mit passwort=hunter2'))
    expect(m).toMatch(/^Der Mail-Versand hat nicht geklappt/)
    expect(m).not.toContain('hunter2')
    expect(explainSmtp('irgendein Text')).toMatch(/^Der Mail-Versand hat nicht geklappt/)
    expect(explainSmtp(undefined)).toMatch(/^Der Mail-Versand hat nicht geklappt/)
  })

  it('eigene verständliche Fehler bleiben unverändert', () => {
    const e = invalid('Der E-Mail-Versand ist noch nicht eingerichtet (Einstellungen → E-Mail).')
    expect(explainSmtp(e)).toBe(e.message)
  })
})
