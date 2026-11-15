import { expect, it } from 'vitest'
import { dayEndIso, dayStartIso, zonedToIso } from './zeit'

it('rechnet Wandzeit einer Zeitzone in UTC um, auch rund um die Zeitumstellung', () => {
  expect(zonedToIso('2026-11-20', '10:00', 'Europe/Berlin')).toBe('2026-11-20T09:00:00.000Z')
  expect(zonedToIso('2026-07-20', '00:00', 'Europe/Berlin')).toBe('2026-07-19T22:00:00.000Z')
  expect(zonedToIso('2026-03-29', '12:00', 'Europe/Berlin')).toBe('2026-03-29T10:00:00.000Z')
  expect(zonedToIso('2026-07-20', '09:00', 'America/New_York')).toBe('2026-07-20T13:00:00.000Z')
})

it('Tagesgrenzen für den Zeitraumfilter', () => {
  expect(dayStartIso('2026-11-20', 'Europe/Berlin')).toBe('2026-11-19T23:00:00.000Z')
  expect(dayEndIso('2026-11-20', 'Europe/Berlin')).toBe('2026-11-20T23:00:00.000Z')
})

it('erkennt Ortszeiten, die es wegen der Zeitumstellung nicht gibt', async () => {
  const { localTimeExists } = await import('./zeit')
  expect(localTimeExists('2026-03-29', '02:30', 'Europe/Berlin')).toBe(false)
  expect(localTimeExists('2026-03-29', '03:30', 'Europe/Berlin')).toBe(true)
  expect(localTimeExists('2026-11-20', '10:00', 'Europe/Berlin')).toBe(true)
})
