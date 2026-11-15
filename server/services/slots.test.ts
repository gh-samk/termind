import { describe, expect, it } from 'vitest'
import type { WeeklyHours } from '../../shared/types'
import { computeSlots, isSlotAvailable } from './slots'

const weekly: WeeklyHours = {
  mo: [],
  di: [['09:00', '12:45'], ['14:30', '17:30']],
  mi: [['09:00', '12:00']],
  do: [],
  fr: [['09:00', '12:00']],
  sa: [],
  so: [],
}
const schedule = { timezone: 'Europe/Berlin', weekly }
const rules = { duration: 30, slotStep: 30, minNoticeMinutes: 0, windowDays: 60, bufferBefore: 0, bufferAfter: 0 }
const now = new Date('2026-11-15T08:00:00Z') // Sonntag

describe('computeSlots', () => {
  it('liefert Startzeiten im Raster innerhalb der Wochenzeiten', () => {
    const s = computeSlots({ now, from: '2026-11-17', to: '2026-11-17', guestTz: 'Europe/Berlin', schedule, exceptions: [], rules, busy: [] })
    const times = s['2026-11-17'].map((x) => new Date(x).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }))
    expect(times[0]).toBe('09:00')
    expect(times).toContain('12:00')
    expect(times).not.toContain('12:30') // 12:30 + 30 > 12:45
    expect(times).toContain('14:30')
    expect(times.at(-1)).toBe('17:00')
    expect(s['2026-11-17'][0]).toBe('2026-11-17T08:00:00.000Z') // MEZ = UTC+1
  })

  it('beachtet Ausnahmen (frei und andere Zeiten)', () => {
    const s = computeSlots({
      now, from: '2026-11-17', to: '2026-11-18', guestTz: 'Europe/Berlin', schedule, rules, busy: [],
      exceptions: [
        { fromDate: '2026-11-17', toDate: '2026-11-17', kind: 'off' },
        { fromDate: '2026-11-18', toDate: '2026-11-18', kind: 'hours', hours: [['15:00', '16:00']] },
      ],
    })
    expect(s['2026-11-17']).toBeUndefined()
    expect(s['2026-11-18']).toEqual(['2026-11-18T14:00:00.000Z', '2026-11-18T14:30:00.000Z'])
  })

  it('blendet belegte Zeiten inklusive Puffer aus', () => {
    const s = computeSlots({
      now, from: '2026-11-20', to: '2026-11-20', guestTz: 'Europe/Berlin', schedule, exceptions: [],
      rules: { ...rules, bufferAfter: 15 },
      busy: [{ start: new Date('2026-11-20T09:00:00Z'), end: new Date('2026-11-20T09:30:00Z') }], // 10:00–10:30 MEZ
    })
    const times = s['2026-11-20'].map((x) => x.slice(11, 16))
    expect(times).toEqual(['08:00', '09:30', '10:00', '10:30']) // 08:30Z fällt wegen 15 Min. Puffer weg
  })

  it('beachtet Mindestvorlauf und Buchungsfenster', () => {
    const s = computeSlots({ now, from: '2026-11-15', to: '2027-03-01', guestTz: 'Europe/Berlin', schedule, exceptions: [], rules: { ...rules, minNoticeMinutes: 60 * 48, windowDays: 7 }, busy: [] })
    expect(Object.keys(s)).toEqual(['2026-11-17', '2026-11-18', '2026-11-20'])
  })

  it('gruppiert nach Datum in der Zeitzone des Gastes', () => {
    const s = computeSlots({ now, from: '2026-11-17', to: '2026-11-17', guestTz: 'America/New_York', schedule, exceptions: [], rules, busy: [] })
    // 09:00 Berlin = 03:00 New York, gleicher Tag
    expect(s['2026-11-17'][0]).toBe('2026-11-17T08:00:00.000Z')
    const tokyo = computeSlots({ now, from: '2026-11-17', to: '2026-11-18', guestTz: 'Asia/Tokyo', schedule, exceptions: [], rules, busy: [] })
    // 17:00 Berlin (16:00Z) = 01:00 am 18.11. in Tokio
    expect(tokyo['2026-11-18']).toContain('2026-11-17T16:00:00.000Z')
  })

  it('rechnet über die Zeitumstellung korrekt', () => {
    const s = computeSlots({ now: new Date('2027-03-20T00:00:00Z'), from: '2027-03-30', to: '2027-03-30', guestTz: 'Europe/Berlin', schedule, exceptions: [], rules, busy: [] })
    expect(s['2027-03-30'][0]).toBe('2027-03-30T07:00:00.000Z') // MESZ = UTC+2
  })

  it('isSlotAvailable lehnt Zeiten außerhalb des Rasters ab', () => {
    const base = { now, guestTz: 'Europe/Berlin', schedule, exceptions: [], rules, busy: [] }
    expect(isSlotAvailable('2026-11-17T08:00:00.000Z', base)).toBe(true)
    expect(isSlotAvailable('2026-11-17T08:10:00.000Z', base)).toBe(false)
  })
})
