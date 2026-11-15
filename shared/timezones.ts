/**
 * Zeitzonen lesbar darstellen (Admin-Oberfläche, Block C: Gastseiten).
 *
 *   timezoneLabel('Europe/Berlin')      → „Deutschland (Berlin), UTC+1“
 *   timezoneLabel('America/New_York')   → „New York, UTC−5“
 *   timezoneGroups(all, browserZone)    → Gruppen für ein <select> mit optgroups
 *
 * Reine Funktionen ohne Abhängigkeiten, laufen im Browser und auf dem Server.
 */

/** Klarnamen für häufige Zeitzonen. Alles andere wird aus dem Zonennamen abgeleitet („America/New_York“ → „New York“). */
export const COMMON_ZONES: { id: string; name: string }[] = [
  { id: 'Europe/Berlin', name: 'Deutschland (Berlin)' },
  { id: 'Europe/Vienna', name: 'Österreich (Wien)' },
  { id: 'Europe/Zurich', name: 'Schweiz (Zürich)' },
  { id: 'Europe/London', name: 'Großbritannien (London)' },
  { id: 'Europe/Paris', name: 'Frankreich (Paris)' },
  { id: 'Europe/Amsterdam', name: 'Niederlande (Amsterdam)' },
  { id: 'Europe/Rome', name: 'Italien (Rom)' },
  { id: 'Europe/Madrid', name: 'Spanien (Madrid)' },
  { id: 'Europe/Warsaw', name: 'Polen (Warschau)' },
  { id: 'Europe/Athens', name: 'Griechenland (Athen)' },
  { id: 'Europe/Istanbul', name: 'Türkei (Istanbul)' },
  { id: 'America/New_York', name: 'USA Ostküste (New York)' },
  { id: 'America/Chicago', name: 'USA Mitte (Chicago)' },
  { id: 'America/Los_Angeles', name: 'USA Westküste (Los Angeles)' },
  { id: 'UTC', name: 'Koordinierte Weltzeit (UTC)' },
]

const COMMON_NAME = new Map(COMMON_ZONES.map((z) => [z.id, z.name]))

const CONTINENT: Record<string, string> = {
  Europe: 'Europa',
  America: 'Amerika',
  Asia: 'Asien',
  Africa: 'Afrika',
  Australia: 'Australien',
  Pacific: 'Pazifik',
  Atlantic: 'Atlantik',
  Indian: 'Indischer Ozean',
  Antarctica: 'Antarktis',
  Arctic: 'Arktis',
}
export const CONTINENT_ORDER = ['Europa', 'Amerika', 'Asien', 'Afrika', 'Australien', 'Pazifik', 'Atlantik', 'Indischer Ozean', 'Antarktis', 'Arktis', 'Sonstige']

/** „UTC+1“, „UTC+5:30“, „UTC−3“ (echtes Minuszeichen) für eine Zone zu einem Zeitpunkt. */
export function utcOffset(tz: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? ''
    const m = /GMT(?:([+−-])(\d{1,2})(?::(\d{2}))?)?$/.exec(part)
    if (!m) return 'UTC'
    if (!m[1]) return 'UTC'
    const sign = m[1] === '+' ? '+' : '−'
    const h = Number(m[2])
    if (h === 0 && (!m[3] || m[3] === '00')) return 'UTC'
    return `UTC${sign}${h}${m[3] && m[3] !== '00' ? ':' + m[3] : ''}`
  } catch {
    return ''
  }
}

/** Ort aus dem Zonennamen: „America/Argentina/Buenos_Aires“ → „Buenos Aires“. */
export function cityName(tz: string): string {
  const last = tz.split('/').pop() ?? tz
  return last.replace(/_/g, ' ')
}

/** Lesbarer Name ohne Zeitabstand: „Deutschland (Berlin)“ oder „New York“. */
export function timezoneName(tz: string): string {
  return COMMON_NAME.get(tz) ?? cityName(tz)
}

/** Name mit Zeitabstand: „Deutschland (Berlin), UTC+1“. */
export function timezoneLabel(tz: string, at: Date = new Date()): string {
  const off = utcOffset(tz, at)
  return off ? `${timezoneName(tz)}, ${off}` : timezoneName(tz)
}

export interface TimezoneGroup {
  label: string
  zones: { id: string; label: string }[]
}

/**
 * Gruppen für ein Auswahlfeld: erst „Empfohlen“ (Zeitzone des Geräts), dann „Häufig“,
 * dann alle übrigen nach Erdteil. Jede Zone kommt genau einmal vor.
 * Ist `current` unbekannt (z. B. ältere Schreibweise), steht sie zusätzlich ganz oben.
 */
export function timezoneGroups(all: string[], opts: { recommended?: string; current?: string; at?: Date } = {}): TimezoneGroup[] {
  const at = opts.at ?? new Date()
  const known = new Set(all)
  const used = new Set<string>()
  const take = (id: string) => (used.has(id) ? false : (used.add(id), true))
  const item = (id: string) => ({ id, label: timezoneLabel(id, at) })
  const groups: TimezoneGroup[] = []

  if (opts.current && !known.has(opts.current) && !COMMON_NAME.has(opts.current)) {
    take(opts.current)
    groups.push({ label: 'Aktuell eingestellt', zones: [item(opts.current)] })
  }
  if (opts.recommended && (known.has(opts.recommended) || COMMON_NAME.has(opts.recommended)) && take(opts.recommended)) {
    groups.push({ label: 'Empfohlen', zones: [{ id: opts.recommended, label: `Empfohlen: ${timezoneLabel(opts.recommended, at)}` }] })
  }
  const common = COMMON_ZONES.filter((z) => (known.has(z.id) || z.id === 'UTC') && take(z.id)).map((z) => item(z.id))
  if (common.length) groups.push({ label: 'Häufig', zones: common })

  const byContinent = new Map<string, { id: string; label: string }[]>()
  for (const id of [...all].sort((a, b) => cityName(a).localeCompare(cityName(b), 'de'))) {
    if (!take(id)) continue
    const prefix = id.split('/')[0]
    const g = CONTINENT[prefix] ?? 'Sonstige'
    byContinent.set(g, [...(byContinent.get(g) ?? []), item(id)])
  }
  for (const g of CONTINENT_ORDER) if (byContinent.has(g)) groups.push({ label: g, zones: byContinent.get(g)! })
  return groups
}

/** Alle vom Gerät bekannten Zeitzonen (mit Rückfall auf die DACH-Zonen). */
export function supportedTimezones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone')
    if (list?.length) return list
  } catch {
    /* ältere Umgebung */
  }
  return COMMON_ZONES.map((z) => z.id)
}
