import type { SlotMap, WeeklyHours } from '../../shared/types'
import { addDays, dateInTz, dayKeyOf, toMinutes, zonedToUtc } from '../lib/time'

export interface SlotRules {
  duration: number
  slotStep: number
  minNoticeMinutes: number
  windowDays: number
  bufferBefore: number
  bufferAfter: number
}

export interface ScheduleLike {
  timezone: string
  weekly: WeeklyHours
}

export interface ExceptionLike {
  fromDate: string
  toDate: string
  kind: 'off' | 'hours'
  hours?: [string, string][] | null
}

export interface Interval {
  start: Date
  end: Date
}

export interface SlotInput {
  now: Date
  /** Erster und letzter Tag (inklusive) in der Zeitzone des Gastes */
  from: string
  to: string
  guestTz: string
  schedule: ScheduleLike
  exceptions: ExceptionLike[]
  rules: SlotRules
  /** Belegte Zeiten, bereits um ihre eigenen Puffer erweitert */
  busy: Interval[]
}

/** Zeitfenster eines Tages im Plan, Ausnahmen haben Vorrang. */
export function windowsForDate(date: string, schedule: ScheduleLike, exceptions: ExceptionLike[]): [string, string][] {
  const hit = exceptions.filter((x) => date >= x.fromDate && date <= x.toDate)
  if (hit.some((x) => x.kind === 'off')) return []
  const hours = hit.find((x) => x.kind === 'hours')
  if (hours?.hours) return hours.hours
  return schedule.weekly[dayKeyOf(date, schedule.timezone)] ?? []
}

/**
 * Berechnet freie Startzeiten. Reine Funktion ohne Datenbank, damit sie gut testbar ist
 * und REST, MCP und Buchungsprüfung exakt dieselbe Logik nutzen.
 */
export function computeSlots(input: SlotInput): SlotMap {
  const { now, from, to, guestTz, schedule, exceptions, rules, busy } = input
  const out: SlotMap = {}
  const earliest = now.getTime() + rules.minNoticeMinutes * 60_000
  const latest = now.getTime() + rules.windowDays * 86_400_000
  const step = Math.max(5, rules.slotStep)

  // Gast- und Gastgeber-Zeitzone können um einen Tag abweichen, daher ±1 Tag prüfen.
  for (let date = addDays(from, -1); date <= addDays(to, 1); date = addDays(date, 1)) {
    for (const [a, b] of windowsForDate(date, schedule, exceptions)) {
      const endMin = toMinutes(b)
      for (let t = toMinutes(a); t + rules.duration <= endMin; t += step) {
        const start = zonedToUtc(date, t, schedule.timezone)
        const s = start.getTime()
        if (s < earliest || s > latest) continue
        const e = s + rules.duration * 60_000
        const blockStart = s - rules.bufferBefore * 60_000
        const blockEnd = e + rules.bufferAfter * 60_000
        if (busy.some((i) => blockStart < i.end.getTime() && blockEnd > i.start.getTime())) continue
        const key = dateInTz(start, guestTz)
        if (key < from || key > to) continue
        ;(out[key] ??= []).push(start.toISOString())
      }
    }
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].sort()
  return out
}

/** Prüft, ob ein konkreter Startzeitpunkt (noch) buchbar ist. */
export function isSlotAvailable(startIso: string, input: Omit<SlotInput, 'from' | 'to'>) {
  const day = dateInTz(new Date(startIso), input.guestTz)
  const slots = computeSlots({ ...input, from: day, to: day })
  return (slots[day] ?? []).includes(new Date(startIso).toISOString())
}
