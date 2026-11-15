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
  { id: 'Asia/Kolkata', name: 'Indien (Kalkutta)' },
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

/** Deutsche Schreibweise für häufige Städte, deren Name sich vom englischen unterscheidet. */
const CITY_DE: Record<string, string> = {
  Vienna: 'Wien', Zurich: 'Zürich', Rome: 'Rom', Warsaw: 'Warschau', Athens: 'Athen', Prague: 'Prag', Moscow: 'Moskau',
  Copenhagen: 'Kopenhagen', Brussels: 'Brüssel', Lisbon: 'Lissabon', Belgrade: 'Belgrad', Bucharest: 'Bukarest', Kyiv: 'Kiew', Kiev: 'Kiew', Calcutta: 'Kalkutta', Saigon: 'Ho-Chi-Minh-Stadt', Katmandu: 'Kathmandu', Rangoon: 'Rangun', Yangon: 'Rangun',
  Cairo: 'Kairo', Tokyo: 'Tokio', Singapore: 'Singapur', 'Hong Kong': 'Hongkong', Tehran: 'Teheran', Baghdad: 'Bagdad',
  Mexico_City: 'Mexiko-Stadt', 'Mexico City': 'Mexiko-Stadt', Sao_Paulo: 'São Paulo', 'Sao Paulo': 'São Paulo', Havana: 'Havanna',
  Kathmandu: 'Kathmandu', Kolkata: 'Kalkutta', Ho_Chi_Minh: 'Ho-Chi-Minh-Stadt', 'Ho Chi Minh': 'Ho-Chi-Minh-Stadt',
  Cape_Verde: 'Kap Verde', Edmonton: 'Edmonton', Luxembourg: 'Luxemburg', Cologne: 'Köln', Munich: 'München', Geneva: 'Genf',
  Seville: 'Sevilla', Venice: 'Venedig', Naples: 'Neapel', Florence: 'Florenz', Gothenburg: 'Göteborg', Krakow: 'Krakau',
  Chisinau: 'Chișinău', Kaliningrad: 'Kaliningrad', Bahrain: 'Bahrain', Muscat: 'Maskat', Kuwait: 'Kuwait', Riyadh: 'Riad',
  Damascus: 'Damaskus', Beirut: 'Beirut', Nicosia: 'Nikosia', Algiers: 'Algier', Tunis: 'Tunis', Casablanca: 'Casablanca',
}
/** Ort auf Deutsch, sonst der englische Name. */
export function cityNameDe(tz: string): string {
  const c = cityName(tz)
  return CITY_DE[c] ?? c
}

/** Lesbarer Name ohne Zeitabstand: „Deutschland (Berlin)“ oder „New York“. */
export function timezoneName(tz: string): string {
  return COMMON_NAME.get(tz) ?? cityNameDe(tz)
}

/** Veraltete Schreibweisen und Zonen ohne Nutzen für Terminbuchung, die Geräte teils noch melden. */
const OBSOLETE = new Set([
  'Europe/Kiev', 'Europe/Busingen', 'Europe/Belfast', 'Europe/Tiraspol', 'Asia/Calcutta', 'Asia/Katmandu', 'Asia/Rangoon', 'Asia/Saigon',
  'Asia/Ulan_Bator', 'Asia/Thimbu', 'Asia/Macao', 'Asia/Dacca', 'Asia/Ujung_Pandang', 'Asia/Istanbul', 'Asia/Chongqing', 'Asia/Harbin',
  'Asia/Kashgar', 'America/Buenos_Aires', 'America/Indianapolis', 'America/Louisville', 'America/Godthab', 'America/Montreal',
  'America/Catamarca', 'America/Cordoba', 'America/Jujuy', 'America/Mendoza', 'America/Fort_Wayne', 'America/Knox_IN', 'America/Virgin',
  'America/Shiprock', 'America/Rosario', 'America/Atka', 'Atlantic/Faeroe', 'Atlantic/Jan_Mayen', 'Pacific/Samoa', 'Pacific/Truk',
  'Pacific/Ponape', 'Pacific/Yap', 'Africa/Asmera', 'Africa/Timbuktu', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra',
  'Australia/LHI', 'Australia/North', 'Australia/Queensland', 'Australia/South', 'Australia/Tasmania', 'Australia/Victoria',
  'Australia/West', 'Australia/Yancowinna', 'Australia/Currie',
])
/** Alte Schreibweise → kanonischer Name. */
const CANONICAL: Record<string, string> = {
  'Europe/Kiev': 'Europe/Kyiv', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Ulan_Bator': 'Asia/Ulaanbaatar', 'Asia/Thimbu': 'Asia/Thimphu', 'Asia/Macao': 'Asia/Macau',
  'Asia/Dacca': 'Asia/Dhaka', 'Asia/Ujung_Pandang': 'Asia/Makassar', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Indianapolis': 'America/Indiana/Indianapolis', 'America/Louisville': 'America/Kentucky/Louisville', 'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe', 'Africa/Asmera': 'Africa/Asmara', 'Pacific/Truk': 'Pacific/Chuuk', 'Pacific/Ponape': 'Pacific/Pohnpei',
  'Europe/Busingen': 'Europe/Zurich', 'Europe/Belfast': 'Europe/London', 'Australia/ACT': 'Australia/Sydney', 'Australia/NSW': 'Australia/Sydney',
  'Australia/Canberra': 'Australia/Sydney', 'Australia/Victoria': 'Australia/Melbourne',
}

function zoneKnown(id: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: id })
    return true
  } catch {
    return false
  }
}

/** Alias auf den kanonischen Namen abbilden, sofern die Laufzeit ihn kennt; sonst den Alias behalten (die Zone fehlt nie). */
export function canonicalZone(id: string): string {
  const c = CANONICAL[id]
  return c && zoneKnown(c) ? c : id
}

/** Für Auswahllisten geeignet: kein Etc/*, keine Antarktis-Stationen, keine veralteten Aliasse ohne Ersatz. */
export function isSelectableZone(id: string): boolean {
  return (id === 'UTC' || id.includes('/')) && !id.startsWith('Etc/') && !id.startsWith('Antarctica/') && !id.startsWith('SystemV/') && !id.startsWith('US/') && !id.startsWith('Brazil/') && !id.startsWith('Canada/') && !id.startsWith('Chile/') && !id.startsWith('Mexico/') && (!OBSOLETE.has(id) || id in CANONICAL)
}

/** Liste bereinigen: Aliasse auf kanonische Namen, ohne Doppelte, ohne ungeeignete Zonen. */
export function normalizeZones(all: string[]): string[] {
  return [...new Set(all.filter(isSelectableZone).map(canonicalZone))]
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
  all = normalizeZones(all)
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
  for (const id of normalizeZones(all).sort((a, b) => cityNameDe(a).localeCompare(cityNameDe(b), 'de'))) {
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
    if (list?.length) return normalizeZones(list)
  } catch {
    /* ältere Umgebung */
  }
  return COMMON_ZONES.map((z) => z.id)
}
