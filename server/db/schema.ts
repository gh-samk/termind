import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Answer, FormField, Location, WeeklyHours } from '../../shared/types'

const id = () => text('id').primaryKey()
const createdAt = () => text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)

/* ---------------- Personen & Anmeldung ---------------- */

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  handle: text('handle').notNull().unique(),
  subtitle: text('subtitle').notNull().default(''),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  /** Letzter verwendeter TOTP-Zeitschritt (Schutz gegen Wiederverwendung) */
  totpLastStep: integer('totp_last_step'),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  locale: text('locale', { enum: ['de', 'en'] }).notNull().default('de'),
  createdAt: createdAt(),
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(), // SHA-256 des Cookie-Tokens
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    /** true = Passwort ok, aber zweiter Faktor fehlt noch */
    pendingSecondFactor: integer('pending_second_factor', { mode: 'boolean' }).notNull().default(false),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const passkeys = sqliteTable('passkeys', {
  id: id(), // Credential-ID (base64url)
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(), // base64url
  counter: integer('counter').notNull().default(0),
  transports: text('transports', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  name: text('name').notNull(),
  lastUsedAt: text('last_used_at'),
  createdAt: createdAt(),
})

export const apiTokens = sqliteTable('api_tokens', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  scope: text('scope', { enum: ['read', 'write'] }).notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
  createdAt: createdAt(),
})

/* ---------------- Instanz-Einstellungen ---------------- */

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
})

/* ---------------- Verfügbarkeit ---------------- */

export const schedules = sqliteTable('schedules', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  weekly: text('weekly', { mode: 'json' }).$type<WeeklyHours>().notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
})

export const scheduleExceptions = sqliteTable(
  'schedule_exceptions',
  {
    id: id(),
    scheduleId: text('schedule_id').notNull().references(() => schedules.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    fromDate: text('from_date').notNull(), // YYYY-MM-DD in Zeitzone des Plans
    toDate: text('to_date').notNull(),
    kind: text('kind', { enum: ['off', 'hours'] }).notNull(),
    hours: text('hours', { mode: 'json' }).$type<[string, string][]>(),
    createdAt: createdAt(),
  },
  (t) => [index('exceptions_schedule_idx').on(t.scheduleId)],
)

/* ---------------- Terminseiten ---------------- */

export const eventTypes = sqliteTable(
  'event_types',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scheduleId: text('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    duration: integer('duration').notNull(),
    location: text('location', { mode: 'json' }).$type<Location>().notNull(),
    color: integer('color').notNull().default(172),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    requiresConfirmation: integer('requires_confirmation', { mode: 'boolean' }).notNull().default(false),
    minNoticeMinutes: integer('min_notice_minutes').notNull().default(720),
    windowDays: integer('window_days').notNull().default(60),
    bufferBefore: integer('buffer_before').notNull().default(0),
    bufferAfter: integer('buffer_after').notNull().default(0),
    slotStep: integer('slot_step').notNull().default(30),
    fields: text('fields', { mode: 'json' }).$type<FormField[]>().notNull().default(sql`'[]'`),
    reminders: text('reminders', { mode: 'json' }).$type<number[]>().notNull().default(sql`'[1440,60]'`),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: text('updated_at'),
  },
  (t) => [uniqueIndex('event_types_user_slug').on(t.userId, t.slug)],
)

/* ---------------- Buchungen ---------------- */

export const bookings = sqliteTable(
  'bookings',
  {
    id: id(),
    /** Geheimer Schlüssel für Absage-/Verschiebe-Links des Gastes */
    manageToken: text('manage_token').notNull().unique(),
    eventTypeId: text('event_type_id').notNull().references(() => eventTypes.id),
    hostId: text('host_id').notNull().references(() => users.id),
    startsAt: text('starts_at').notNull(), // UTC ISO
    endsAt: text('ends_at').notNull(),
    /** Puffer zum Buchungszeitpunkt, damit spätere Änderungen alte Termine nicht verschieben */
    bufferBefore: integer('buffer_before').notNull().default(0),
    bufferAfter: integer('buffer_after').notNull().default(0),
    guestName: text('guest_name').notNull(),
    guestEmail: text('guest_email').notNull(),
    guestTimezone: text('guest_timezone').notNull(),
    locale: text('locale', { enum: ['de', 'en'] }).notNull().default('de'),
    answers: text('answers', { mode: 'json' }).$type<Answer[]>().notNull().default(sql`'[]'`),
    location: text('location', { mode: 'json' }).$type<Location>().notNull(),
    status: text('status', { enum: ['confirmed', 'pending', 'cancelled', 'declined'] }).notNull(),
    cancelReason: text('cancel_reason'),
    cancelledBy: text('cancelled_by', { enum: ['host', 'guest'] }),
    /** Zähler für Kalender-Updates (.ics SEQUENCE) */
    sequence: integer('sequence').notNull().default(0),
    note: text('note').notNull().default(''),
    /** Wo der Termin im Kalender des Gastgebers eingetragen wurde (CalDAV) */
    calendarRef: text('calendar_ref', { mode: 'json' }).$type<{ connectionId: string; objectUrl: string; etag?: string } | null>(),
    createdVia: text('created_via', { enum: ['web', 'mcp', 'admin', 'api'] }).notNull().default('web'),
    anonymizedAt: text('anonymized_at'),
    createdAt: createdAt(),
    updatedAt: text('updated_at'),
  },
  (t) => [index('bookings_host_start').on(t.hostId, t.startsAt), index('bookings_email').on(t.guestEmail)],
)

/* ---------------- Hintergrundaufgaben (Mail-Warteschlange) ---------------- */

export const jobs = sqliteTable(
  'jobs',
  {
    id: id(),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    runAt: text('run_at').notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    dedupeKey: text('dedupe_key').unique(),
    createdAt: createdAt(),
  },
  (t) => [index('jobs_due').on(t.status, t.runAt)],
)

/* ---------------- Protokoll & KI-Bestätigungen ---------------- */

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    at: createdAt(),
    actorType: text('actor_type', { enum: ['user', 'token', 'guest', 'system'] }).notNull(),
    actorId: text('actor_id'),
    client: text('client'),
    action: text('action').notNull(),
    detail: text('detail').notNull().default(''),
    kind: text('kind', { enum: ['read', 'write', 'confirm'] }).notNull(),
  },
  (t) => [index('audit_at').on(t.at)],
)

export const pendingActions = sqliteTable('pending_actions', {
  id: id(),
  tokenId: text('token_id').notNull(),
  action: text('action').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  preview: text('preview').notNull(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: createdAt(),
})

/* ---------------- Kalender-Abgleich ---------------- */

export interface RemoteCalendar {
  url: string
  name: string
  color?: string
  /** Belegte Zeiten aus diesem Kalender berücksichtigen */
  checkBusy: boolean
}

export const calendarConnections = sqliteTable('calendar_connections', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['caldav', 'ics'] }).notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  username: text('username'),
  passwordEnc: text('password_enc'),
  calendars: text('calendars', { mode: 'json' }).$type<RemoteCalendar[]>().notNull().default(sql`'[]'`),
  /** Kalender, in den neue Termine eingetragen werden (nur CalDAV) */
  writeCalendarUrl: text('write_calendar_url'),
  status: text('status', { enum: ['ok', 'error', 'pending'] }).notNull().default('pending'),
  lastError: text('last_error'),
  lastSyncAt: text('last_sync_at'),
  createdAt: createdAt(),
})

export const calendarBusy = sqliteTable(
  'calendar_busy',
  {
    connectionId: text('connection_id').notNull().references(() => calendarConnections.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
  },
  (t) => [index('busy_user_range').on(t.userId, t.startsAt)],
)

/* ---------------- OAuth 2.1 für MCP-Connectors ---------------- */

export const oauthClients = sqliteTable('oauth_clients', {
  id: id(), // client_id (zufällig bei DCR, URL bei Client-ID-Metadatendokument)
  name: text('name').notNull(),
  redirectUris: text('redirect_uris', { mode: 'json' }).$type<string[]>().notNull(),
  kind: text('kind', { enum: ['dcr', 'cimd'] }).notNull().default('dcr'),
  lastUsedAt: text('last_used_at'),
  createdAt: createdAt(),
})

export const oauthCodes = sqliteTable('oauth_codes', {
  id: id(), // SHA-256 des Codes
  clientId: text('client_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scope: text('scope', { enum: ['read', 'write'] }).notNull(),
  resource: text('resource'),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
})

export const oauthGrants = sqliteTable(
  'oauth_grants',
  {
    id: id(),
    clientId: text('client_id').notNull(),
    clientName: text('client_name').notNull(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['read', 'write'] }).notNull(),
    resource: text('resource'),
    accessHash: text('access_hash').notNull().unique(),
    accessExpiresAt: text('access_expires_at').notNull(),
    refreshHash: text('refresh_hash').unique(),
    refreshExpiresAt: text('refresh_expires_at'),
    revokedAt: text('revoked_at'),
    lastUsedAt: text('last_used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('grants_user').on(t.userId)],
)

/* ---------------- Webhooks ---------------- */

export const webhooks = sqliteTable('webhooks', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secretEnc: text('secret_enc').notNull(),
  events: text('events', { mode: 'json' }).$type<string[]>().notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
})

export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: id(),
    webhookId: text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    statusCode: integer('status_code'),
    ok: integer('ok', { mode: 'boolean' }).notNull(),
    error: text('error'),
    attempt: integer('attempt').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('deliveries_hook').on(t.webhookId, t.createdAt)],
)
