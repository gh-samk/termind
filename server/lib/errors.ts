export type ErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'unauthorized'
  | 'invalid'
  | 'conflict'
  | 'slot_taken'
  | 'rate_limited'
  | 'setup_required'
  | 'handled'
  | 'expired'

const status: Record<ErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  unauthorized: 401,
  invalid: 400,
  conflict: 409,
  slot_taken: 409,
  rate_limited: 429,
  setup_required: 409,
  handled: 409,
  expired: 410,
}

/** Fachlicher Fehler mit verständlicher Meldung. Wird von REST und MCP gleich behandelt. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
  get status() {
    return status[this.code]
  }
}

export const notFound = (what: string) => new AppError('not_found', `${what} nicht gefunden.`)
export const forbidden = (msg = 'Dafür fehlen die Rechte.') => new AppError('forbidden', msg)
export const invalid = (msg: string) => new AppError('invalid', msg)
