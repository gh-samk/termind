/** Nur http(s)-Adressen als Link verwenden (kein javascript:, data: o. Ä.). Gibt die Adresse zurück oder null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!v || v.length > 2000 || /[\u0000- \u007f<>"]/.test(v)) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : null
  } catch {
    return null
  }
}
