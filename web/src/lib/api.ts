/** Schlanker Fetch-Wrapper: JSON rein, JSON raus, verständliche Fehlermeldungen. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null
  if (!res.ok) {
    // Sitzung abgelaufen: im Admin-Bereich zur Anmeldung leiten
    if (res.status === 401 && location.pathname.startsWith('/admin') && !path.startsWith('/api/auth/')) {
      location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
    }
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.')
  }
  return data as T
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Unbekannter Fehler')
