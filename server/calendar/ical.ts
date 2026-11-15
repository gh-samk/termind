import ICAL from 'ical.js'
import { isValidTimeZone, zonedToUtc } from '../lib/time'

const MAX_EVENTS = 20_000
const MAX_INTERVALS = 50_000

export interface BusyInterval {
  start: Date
  end: Date
}

type ICALTime = InstanceType<typeof ICAL.Time>

/** ICAL.Time → Date. Unbekannte/floating Zeitzonen über TZID oder Standardzeitzone auflösen. */
function toDate(t: ICALTime, tzidHint: string | null, defaultTz: string): Date {
  const date = `${String(t.year).padStart(4, '0')}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
  if (t.isDate) return zonedToUtc(date, 0, defaultTz)
  const zone = t.zone?.tzid
  if (zone === 'UTC' || zone === 'Z') return t.toJSDate()
  if (zone && zone !== 'floating' && ICAL.TimezoneService.has(zone)) return t.toJSDate()
  const tz = tzidHint && isValidTimeZone(tzidHint) ? tzidHint : defaultTz
  return zonedToUtc(date, t.hour * 60 + t.minute, tz)
}

/**
 * Liest belegte Zeiten aus iCalendar-Daten (eine oder mehrere VCALENDAR).
 * Beachtet Wiederholungen inkl. Ausnahmen, TRANSP:TRANSPARENT und abgesagte Termine.
 * Eigene termind-Termine (UID …@termind) werden ignoriert, die kennt termind ohnehin.
 */
/**
 * Lange tägliche/wöchentliche Serien ohne COUNT direkt nahe an den Zeitraum vorspulen.
 * Der Startpunkt bleibt dabei im Rhythmus der Serie (gleiche Uhrzeit, gleicher Wochentag, gleiche Phase).
 */
function alignedStart(ev: InstanceType<typeof ICAL.Event>, seekFrom: ICALTime): ICALTime | undefined {
  const rrule = ev.component.getFirstPropertyValue('rrule') as { freq?: string; interval?: number; count?: number } | null
  if (!rrule || rrule.count || (rrule.freq !== 'DAILY' && rrule.freq !== 'WEEKLY')) return undefined
  const period = (rrule.freq === 'DAILY' ? 1 : 7) * Math.max(1, rrule.interval ?? 1)
  const diffDays = Math.floor((seekFrom.toJSDate().getTime() - ev.startDate.toJSDate().getTime()) / 86_400_000)
  const k = Math.floor(diffDays / period)
  if (k <= 0) return undefined
  const start = ev.startDate.clone()
  start.adjust(k * period, 0, 0, 0)
  return start
}

export function busyFromIcs(texts: string[], from: Date, to: Date, defaultTz: string): BusyInterval[] {
  const out: BusyInterval[] = []
  const rangeStart = ICAL.Time.fromJSDate(from, true)
  const rangeEnd = ICAL.Time.fromJSDate(to, true)
  // Ab hier dürfen Serien vorgespult werden (lange Termine, die vorher beginnen, reichen hinein)
  const seekFrom = ICAL.Time.fromJSDate(new Date(from.getTime() - 8 * 86_400_000), true)
  let budget = 300_000 // Gesamtschritte pro Abgleich: schützt die CPU vor bösartigen Feeds

  for (const text of texts) {
    if (budget <= 0 || out.length >= MAX_INTERVALS) break
    let root: InstanceType<typeof ICAL.Component>
    try {
      root = new ICAL.Component(ICAL.parse(text))
    } catch {
      continue // kaputte Einträge überspringen, nicht den ganzen Abgleich abbrechen
    }
    // Zeitzonen gelten nur für diesen Feed (die Registry von ical.js ist prozessweit)
    ICAL.TimezoneService.reset()
    for (const vtz of root.getAllSubcomponents('vtimezone').slice(0, 50)) {
      try {
        const tzid = vtz.getFirstPropertyValue('tzid') as string
        if (tzid && tzid !== 'UTC' && tzid !== 'GMT' && !ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(vtz)
      } catch {
        /* ignorieren */
      }
    }
    const vevents = root.getAllSubcomponents('vevent').slice(0, MAX_EVENTS)
    const exceptions = new Map<string, InstanceType<typeof ICAL.Event>[]>()
    const masters: InstanceType<typeof ICAL.Event>[] = []
    for (const v of vevents) {
      try {
        const ev = new ICAL.Event(v)
        if (ev.isRecurrenceException()) exceptions.set(ev.uid, [...(exceptions.get(ev.uid) ?? []), ev])
        else masters.push(ev)
      } catch {
        /* einzelnen kaputten Termin überspringen */
      }
    }
    const masterUids = new Set(masters.map((m) => m.uid))

    const blocks = (ev: InstanceType<typeof ICAL.Event>) => {
      const c = ev.component
      if (String(ev.uid ?? '').endsWith('@termind')) return false
      if (String(c.getFirstPropertyValue('transp') ?? '').toUpperCase() === 'TRANSPARENT') return false
      if (String(c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return false
      return true
    }
    const push = (s: ICALTime, e: ICALTime, ev: InstanceType<typeof ICAL.Event>) => {
      const tzid = (ev.component.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined) ?? null
      const start = toDate(s, tzid, defaultTz)
      let end = toDate(e, (ev.component.getFirstProperty('dtend')?.getParameter('tzid') as string | undefined) ?? tzid, defaultTz)
      if (end <= start) end = new Date(start.getTime() + (s.isDate ? 86_400_000 : 0))
      if (end > from && start < to && end > start && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) out.push({ start, end })
    }

    for (const ev of masters) {
      if (budget <= 0 || out.length >= MAX_INTERVALS) break
      try {
        if (!ev.startDate) continue
        for (const ex of exceptions.get(ev.uid) ?? []) ev.relateException(ex)
        if (!ev.isRecurring()) {
          budget--
          if (blocks(ev)) push(ev.startDate, ev.endDate ?? ev.startDate, ev)
          continue
        }
        const it = ev.iterator(alignedStart(ev, seekFrom))
        let inRange = 0
        for (let next = it.next(); next && budget > 0 && inRange < 2000; next = it.next()) {
          budget--
          if (next.compare(rangeEnd) > 0) break
          if (next.compare(seekFrom) < 0) continue // schnell überspringen, keine Details berechnen
          const occ = ev.getOccurrenceDetails(next)
          if (occ.endDate.compare(rangeStart) < 0) continue
          inRange++
          if (blocks(occ.item)) push(occ.startDate, occ.endDate, occ.item)
        }
      } catch {
        /* einzelne kaputte Serie überspringen */
      }
    }
    // Ausnahmen ohne zugehörigen Hauptterm (kommt bei CalDAV-Expand vor)
    for (const [uid, list] of exceptions) {
      if (masterUids.has(uid)) continue
      for (const ex of list) if (blocks(ex)) push(ex.startDate, ex.endDate ?? ex.startDate, ex)
    }
  }
  ICAL.TimezoneService.reset()
  // Unvollständig ausgewertet: lieber als Fehler melden (alte belegte Zeiten bleiben) als Lücken zeigen
  if (budget <= 0 || out.length >= MAX_INTERVALS) throw new Error('Der Kalender enthält zu viele Termine, um ihn vollständig auszuwerten.')
  return mergeIntervals(out)
}

export function mergeIntervals(list: BusyInterval[]): BusyInterval[] {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime())
  const out: BusyInterval[] = []
  for (const i of sorted) {
    const last = out.at(-1)
    if (last && i.start <= last.end) {
      if (i.end > last.end) last.end = i.end
    } else out.push({ start: new Date(i.start), end: new Date(i.end) })
  }
  return out
}
