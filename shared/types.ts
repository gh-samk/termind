/* Gemeinsame Typen für Server und Web-App. */

export type DayKey = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so'
export const DAY_KEYS: DayKey[] = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']

/** Zeitfenster pro Wochentag, z. B. { di: [['09:00','12:45'], ['14:30','17:30']] } */
export type WeeklyHours = Record<DayKey, [string, string][]>

export type LocationKind = 'video' | 'video-template' | 'onsite' | 'phone-host-calls' | 'phone-guest-calls'

export interface Location {
  kind: LocationKind
  /** Link, Link-Vorlage mit {id}, Adresse oder Telefonnummer des Gastgebers */
  value: string
  /** Anzeigename, z. B. „Zoom“ oder „kMeet“ */
  label?: string
}

export type FieldType = 'text' | 'textarea' | 'phone' | 'select' | 'checkbox'

export interface FormField {
  id: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
}

export interface Answer {
  fieldId: string
  label: string
  value: string
}

export type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'declined'
export type Locale = 'de' | 'en'

export interface PublicEventType {
  id: string
  slug: string
  title: string
  description: string
  duration: number
  location: { kind: LocationKind; label: string; detail?: string }
  color: number
  requiresConfirmation: boolean
  fields: FormField[]
}

export interface PublicHost {
  name: string
  handle: string
  subtitle: string
  timezone: string
}

export interface Branding {
  instanceName: string
  accentHue: number
  imprintUrl: string
  privacyUrl: string
  consentRequired: boolean
}

/** Freie Startzeiten, gruppiert nach Datum (YYYY-MM-DD) in der Zeitzone des Gastes. Werte sind UTC-ISO-Zeitstempel. */
export type SlotMap = Record<string, string[]>
