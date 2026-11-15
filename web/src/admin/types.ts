import type { Answer, Branding, BookingStatus, FormField, Location, WeeklyHours } from '@shared/types'

export interface EventType {
  id: string
  slug: string
  title: string
  description: string
  duration: number
  location: Location
  color: number
  active: boolean
  requiresConfirmation: boolean
  minNoticeMinutes: number
  windowDays: number
  bufferBefore: number
  bufferAfter: number
  slotStep: number
  fields: FormField[]
  reminders: number[]
  scheduleId: string | null
}

export interface Booking {
  id: string
  eventTypeId: string
  eventTitle?: string
  eventColor?: number
  startsAt: string
  endsAt: string
  guestName: string
  guestEmail: string
  guestTimezone: string
  answers: Answer[]
  location: Location
  status: BookingStatus
  cancelReason: string | null
  note: string
  createdVia: 'web' | 'mcp' | 'admin' | 'api'
  /** false: still eingetragen, der Gast bekommt keine Mails */
  notifyGuest?: boolean
}

export interface Schedule {
  id: string
  name: string
  timezone: string
  weekly: WeeklyHours
  exceptions: { id: string; title: string; fromDate: string; toDate: string; kind: 'off' | 'hours'; hours: [string, string][] | null }[]
}

export interface SettingsData {
  branding: Branding
  smtp: { host: string; port: number; security: 'starttls' | 'tls' | 'none'; user: string; fromName: string; fromEmail: string; replyTo: string; hasPassword: boolean } | null
  mail: { queued: number; failed: number; lastError: string | null }
  /** Zeitpunkt der letzten erfolgreichen Testmail */
  lastSmtpOk: string | null
}
