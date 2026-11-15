/** Schlanker Fetch-Wrapper: JSON rein, JSON raus, verständliche Fehlermeldungen. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Feldbezogene Prüffehler vom Server (Pfad + Meldung), falls vorhanden */
    public issues?: { path: (string | number)[]; message: string; code?: string }[],
  ) {
    super(message)
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'network', NETWORK_MESSAGE)
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => null) : null
  if (!res.ok) {
    // Sitzung abgelaufen: im Admin-Bereich zur Anmeldung leiten
    if (res.status === 401 && location.pathname.startsWith('/admin') && !path.startsWith('/api/auth/')) {
      location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
    }
    // Fehlerkörper ist normalerweise { error: { code, message } }, ein reiner Text wird ebenfalls angezeigt
    const err = data?.error
    const message = typeof err === 'string' ? err : err?.message
    throw new ApiError(res.status, (typeof err === 'object' && err?.code) || 'error', message ?? 'Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.', Array.isArray(err?.issues) ? err.issues : undefined)
  }
  return data as T
}

const NETWORK_MESSAGE = 'Keine Verbindung zum Server. Bitte versuch es noch einmal.'

export const errorMessage = (e: unknown) => {
  if (e instanceof TypeError) return NETWORK_MESSAGE // fetch ohne Verbindung
  return e instanceof Error ? e.message : 'Unbekannter Fehler'
}
