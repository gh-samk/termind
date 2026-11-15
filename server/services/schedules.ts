import { and, asc, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { exceptionSchema, scheduleUpdateSchema } from '../../shared/schemas'
import type { WeeklyHours } from '../../shared/types'
import { db } from '../db/client'
import { scheduleExceptions, schedules } from '../db/schema'
import { type Actor, requireHost, requireWrite } from '../lib/actor'
import { invalid, notFound } from '../lib/errors'
import { isValidTimeZone } from '../lib/time'
import { newId } from '../lib/util'
import { audit } from './audit'

export const DEFAULT_WEEKLY: WeeklyHours = {
  mo: [['09:00', '17:00']],
  di: [['09:00', '17:00']],
  mi: [['09:00', '17:00']],
  do: [['09:00', '17:00']],
  fr: [['09:00', '17:00']],
  sa: [],
  so: [],
}

export async function createDefaultSchedule(userId: string, timezone: string) {
  const id = newId()
  await db.insert(schedules).values({ id, userId, name: 'Standardzeiten', timezone, weekly: DEFAULT_WEEKLY, isDefault: true })
  return id
}

async function ownSchedule(userId: string, id?: string | null) {
  const s = await db.query.schedules.findFirst({
    where: id ? and(eq(schedules.id, id), eq(schedules.userId, userId)) : and(eq(schedules.userId, userId), eq(schedules.isDefault, true)),
  })
  if (!s) throw notFound('Verfügbarkeitsplan')
  return s
}

/** Plan inkl. Ausnahmen; ohne id der Standardplan. */
export async function getSchedule(actor: Actor, id?: string) {
  const a = requireHost(actor)
  const s = await ownSchedule(a.userId, id)
  const exceptions = await db.query.scheduleExceptions.findMany({ where: eq(scheduleExceptions.scheduleId, s.id), orderBy: asc(scheduleExceptions.fromDate) })
  await audit(actor, 'Verfügbarkeit gelesen', s.name, 'read')
  return { ...s, exceptions }
}

/** Für die Slot-Berechnung (ohne Rechteprüfung, nur intern). */
export async function loadScheduleForHost(userId: string, scheduleId: string | null) {
  const s = await ownSchedule(userId, scheduleId)
  const exceptions = await db.query.scheduleExceptions.findMany({ where: eq(scheduleExceptions.scheduleId, s.id) })
  return { schedule: s, exceptions }
}

export async function updateSchedule(actor: Actor, input: z.infer<typeof scheduleUpdateSchema>, id?: string) {
  const a = requireWrite(actor)
  const s = await ownSchedule(a.userId, id)
  if (input.timezone && !isValidTimeZone(input.timezone)) throw invalid('Unbekannte Zeitzone.')
  if (input.weekly) {
    for (const ranges of Object.values(input.weekly)) {
      const sorted = [...ranges].sort((x, y) => x[0].localeCompare(y[0]))
      for (let i = 1; i < sorted.length; i++) if (sorted[i][0] < sorted[i - 1][1]) throw invalid('Zeitfenster an einem Tag überschneiden sich.')
    }
  }
  await db.update(schedules).set(input).where(eq(schedules.id, s.id))
  await audit(actor, 'Wochenzeiten geändert', s.name, 'write')
  return getSchedule(actor, s.id)
}

export async function addException(actor: Actor, input: z.infer<typeof exceptionSchema>, scheduleId?: string) {
  const a = requireWrite(actor)
  const s = await ownSchedule(a.userId, scheduleId)
  const row = { id: newId(), scheduleId: s.id, title: input.title, fromDate: input.fromDate, toDate: input.toDate, kind: input.kind, hours: input.kind === 'hours' ? (input.hours ?? null) : null }
  await db.insert(scheduleExceptions).values(row)
  await audit(actor, 'Ausnahme angelegt', `${input.title}: ${input.fromDate}${input.toDate !== input.fromDate ? ' bis ' + input.toDate : ''}`, 'write')
  return row
}

export async function deleteException(actor: Actor, exceptionId: string) {
  const a = requireWrite(actor)
  const x = await db.query.scheduleExceptions.findFirst({ where: eq(scheduleExceptions.id, exceptionId) })
  if (!x) throw notFound('Ausnahme')
  await ownSchedule(a.userId, x.scheduleId)
  await db.delete(scheduleExceptions).where(eq(scheduleExceptions.id, exceptionId))
  await audit(actor, 'Ausnahme gelöscht', x.title, 'write')
}
