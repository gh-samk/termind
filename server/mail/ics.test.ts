import { describe, expect, it } from 'vitest'
import { buildIcs } from './ics'

describe('buildIcs', () => {
  it('lässt keine Zeilen-Injection über Namen und Texte zu', () => {
    const ics = buildIcs({
      uid: 'a@termind',
      sequence: 0,
      method: 'REQUEST',
      start: new Date('2026-11-17T08:00:00Z'),
      end: new Date('2026-11-17T08:30:00Z'),
      summary: 'Termin\r\nATTENDEE:mailto:evil@x.de',
      description: 'Zeile1\rBEGIN:VALARM',
      location: 'Ort\nX-EVIL:1',
      url: 'https://x.de/\r\nX-EVIL:1',
      organizer: { name: 'Host', email: 'h@example.org' },
      attendee: { name: 'Eve"\r\nATTENDEE:mailto:evil@x.de', email: 'g@example.org' },
    })
    const lines = ics.split('\r\n').map((l) => l.trimStart())
    expect(lines.filter((l) => l.startsWith('ATTENDEE')).length).toBe(1)
    expect(lines.some((l) => /^X-EVIL/.test(l))).toBe(false)
    expect(lines.filter((l) => l === 'BEGIN:VALARM').length).toBe(1) // nur die eigene Erinnerung
    expect(/\r(?!\n)/.test(ics)).toBe(false)
  })
})
