import { describe, expect, it } from 'vitest'
import { busyFromIcs } from './ical'

const VTZ = `BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`

const cal = (body: string, tz = VTZ) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n${tz}\r\n${body}\r\nEND:VCALENDAR`
const from = new Date('2026-11-01T00:00:00Z')
const to = new Date('2026-12-31T00:00:00Z')
const iso = (l: { start: Date; end: Date }[]) => l.map((i) => `${i.start.toISOString()}/${i.end.toISOString()}`)

describe('busyFromIcs', () => {
  it('liest einfache Termine mit TZID und VTIMEZONE', () => {
    const r = busyFromIcs([cal(`BEGIN:VEVENT\nUID:a\nDTSTART;TZID=Europe/Berlin:20261117T100000\nDTEND;TZID=Europe/Berlin:20261117T113000\nSUMMARY:Zahnarzt\nEND:VEVENT`)], from, to, 'Europe/Berlin')
    expect(iso(r)).toEqual(['2026-11-17T09:00:00.000Z/2026-11-17T10:30:00.000Z'])
  })

  it('löst TZID ohne VTIMEZONE über IANA-Namen auf', () => {
    const r = busyFromIcs([cal(`BEGIN:VEVENT\nUID:b\nDTSTART;TZID=America/New_York:20261117T090000\nDTEND;TZID=America/New_York:20261117T100000\nEND:VEVENT`, '')], from, to, 'Europe/Berlin')
    expect(iso(r)).toEqual(['2026-11-17T14:00:00.000Z/2026-11-17T15:00:00.000Z'])
  })

  it('expandiert Wiederholungen mit EXDATE und verschobener Ausnahme', () => {
    const r = busyFromIcs(
      [
        cal(`BEGIN:VEVENT
UID:weekly
DTSTART;TZID=Europe/Berlin:20261102T080000
DTEND;TZID=Europe/Berlin:20261102T090000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Berlin:20261109T080000
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID;TZID=Europe/Berlin:20261116T080000
DTSTART;TZID=Europe/Berlin:20261116T140000
DTEND;TZID=Europe/Berlin:20261116T150000
END:VEVENT`),
      ],
      from,
      to,
      'Europe/Berlin',
    )
    expect(iso(r)).toEqual([
      '2026-11-02T07:00:00.000Z/2026-11-02T08:00:00.000Z',
      '2026-11-16T13:00:00.000Z/2026-11-16T14:00:00.000Z',
      '2026-11-23T07:00:00.000Z/2026-11-23T08:00:00.000Z',
    ])
  })

  it('ignoriert freie, abgesagte und eigene termind-Termine', () => {
    const r = busyFromIcs(
      [
        cal(`BEGIN:VEVENT\nUID:frei\nTRANSP:TRANSPARENT\nDTSTART:20261117T090000Z\nDTEND:20261117T100000Z\nEND:VEVENT
BEGIN:VEVENT\nUID:weg\nSTATUS:CANCELLED\nDTSTART:20261118T090000Z\nDTEND:20261118T100000Z\nEND:VEVENT
BEGIN:VEVENT\nUID:123@termind\nDTSTART:20261119T090000Z\nDTEND:20261119T100000Z\nEND:VEVENT`),
      ],
      from,
      to,
      'Europe/Berlin',
    )
    expect(r).toEqual([])
  })

  it('blockt ganztägige Termine in der Zeitzone des Gastgebers', () => {
    const r = busyFromIcs([cal(`BEGIN:VEVENT\nUID:urlaub\nDTSTART;VALUE=DATE:20261123\nDTEND;VALUE=DATE:20261125\nEND:VEVENT`)], from, to, 'Europe/Berlin')
    expect(iso(r)).toEqual(['2026-11-22T23:00:00.000Z/2026-11-24T23:00:00.000Z'])
  })

  it('übersteht kaputte Daten', () => {
    expect(busyFromIcs(['das ist kein kalender'], from, to, 'Europe/Berlin')).toEqual([])
  })
})

describe('busyFromIcs Robustheit', () => {
  const from = new Date('2026-11-01T00:00:00Z')
  const to = new Date('2026-12-31T00:00:00Z')
  it('findet tägliche Serien, die vor vielen Jahren begonnen haben', () => {
    const r = busyFromIcs([`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:alt\nDTSTART:20100101T080000Z\nDTEND:20100101T090000Z\nRRULE:FREQ=DAILY\nEND:VEVENT\nEND:VCALENDAR`], from, to, 'Europe/Berlin')
    expect(r.length).toBeGreaterThan(50)
    expect(r[0].start.toISOString()).toBe('2026-11-01T08:00:00.000Z')
  })
  it('lässt sich nicht durch eine fremde Zeitzonen-Definition eines anderen Feeds verfälschen', () => {
    const evil = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VTIMEZONE\nTZID:Europe/Berlin\nBEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:+0500\nTZOFFSETTO:+0500\nEND:STANDARD\nEND:VTIMEZONE\nEND:VCALENDAR`
    const good = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:g\nDTSTART;TZID=Europe/Berlin:20261117T100000\nDTEND;TZID=Europe/Berlin:20261117T110000\nEND:VEVENT\nEND:VCALENDAR`
    busyFromIcs([evil], from, to, 'Europe/Berlin')
    const r = busyFromIcs([good], from, to, 'Europe/Berlin')
    expect(r[0].start.toISOString()).toBe('2026-11-17T09:00:00.000Z')
  })
  it('bleibt bei vielen Serien schnell', () => {
    const series = Array.from({ length: 500 }, (_, i) => `BEGIN:VEVENT\nUID:s${i}\nDTSTART:20100101T0${i % 10}0000Z\nDTEND:20100101T0${i % 10}3000Z\nRRULE:FREQ=DAILY\nEND:VEVENT`).join('\n')
    const t = Date.now()
    busyFromIcs([`BEGIN:VCALENDAR\nVERSION:2.0\n${series}\nEND:VCALENDAR`], from, to, 'Europe/Berlin')
    expect(Date.now() - t).toBeLessThan(8000)
  })
})
