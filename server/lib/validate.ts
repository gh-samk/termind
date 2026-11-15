import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'

/* Standardtexte von Zod auf Deutsch (eigene Meldungen in den Schemas haben Vorrang). */
const de = z.locales.de()
z.config({
  ...de,
  customError: (iss) => {
    // Fehlende Felder und falsche Typen: eine verständliche Meldung statt Zod-Jargon
    if (iss.code === 'invalid_type') return iss.input === undefined ? 'Bitte fülle alle Pflichtfelder aus.' : 'Ungültige Eingabe.'
    return de.localeError?.(iss)
  },
})

/** Erste verständliche Meldung aus einem Zod-Fehler. */
export function firstMessage(error: { issues: readonly { message?: string }[] }): string {
  return error.issues[0]?.message || 'Ungültige Eingabe.'
}

/** Wie zValidator, antwortet bei Fehlern aber im gleichen Format wie die Fehlerbehandlung in app.ts. */
export const v = <T extends z.ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) return c.json({ error: { code: 'invalid', message: firstMessage(result.error) } }, 400)
  })
