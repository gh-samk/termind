import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'
import { invalid } from './errors'

/**
 * Schutz vor SSRF: Kalender-, Webhook- und Client-Metadaten-URLs kommen von außen.
 * Sie dürfen nicht auf interne Dienste zeigen. Die Prüfung passiert beim Verbindungsaufbau
 * (eigene DNS-Auflösung im Agent), damit DNS-Rebinding nicht hilft.
 * Self-Hoster mit Nextcloud im LAN setzen ALLOW_PRIVATE_HOSTS=true (gilt nicht für anonyme Abrufe).
 */
export const allowPrivateEnv = () => process.env.ALLOW_PRIVATE_HOSTS === 'true'

const blocked = new BlockList()
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, bits, 'ipv4')
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32]] as const) blocked.addSubnet(net, bits, 'ipv6')

/** IPv4-gemappte IPv6-Adressen (::ffff:a.b.c.d oder ::ffff:7f00:1) auf IPv4 zurückführen. */
function embeddedV4(ip: string): string | null {
  const v = ip.toLowerCase()
  const m = v.match(/^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(.+)$/) ?? v.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (!m) return null
  const rest = m[1]
  if (rest.includes('.')) return rest
  const parts = rest.split(':')
  if (parts.length !== 2) return null
  const hi = parseInt(parts[0], 16)
  const lo = parseInt(parts[1], 16)
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
}

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return blocked.check(ip, 'ipv4')
  if (kind === 6) {
    const v4 = embeddedV4(ip)
    if (v4) return isIP(v4) !== 4 || blocked.check(v4, 'ipv4')
    return blocked.check(ip, 'ipv6')
  }
  return true
}

function guardedAgent(allowPrivate: boolean) {
  return new Agent({
    connect: {
      timeout: 10_000,
      lookup(hostname, options, cb) {
        dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return cb(err, '', 4)
          const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[]
          const ok = list.filter((a) => allowPrivate || !isPrivateIp(a.address))
          if (ok.length === 0) return cb(Object.assign(new Error('Adresse im internen Netz ist nicht erlaubt'), { code: 'EBLOCKED' }), '', 4)
          if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: LookupAddress[]) => void)(null, ok)
          cb(null, ok[0].address, ok[0].family)
        })
      },
    },
  })
}
const publicAgent = guardedAgent(false)
const lanAgent = guardedAgent(true)

export interface SafeOptions {
  /** Interne Adressen nie erlauben (z. B. für anonyme Abrufe), egal was ALLOW_PRIVATE_HOSTS sagt */
  forcePublic?: boolean
  /** Antwort beim Lesen nach so vielen Bytes abbrechen */
  maxBytes?: number
}

/** Antwort-Body auf eine Größe begrenzen, ohne ihn vorher komplett zu puffern. */
function limitBody(res: Response, maxBytes: number): Response {
  if (!res.body) return res
  let size = 0
  const limited = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        size += chunk.byteLength
        if (size > maxBytes) ctrl.error(new Error('Antwort zu groß'))
        else ctrl.enqueue(chunk)
      },
    }),
  )
  return new Response(limited, { status: res.status, statusText: res.statusText, headers: res.headers })
}

export async function assertPublicUrl(raw: string, opts: SafeOptions = {}) {
  let u: URL
  try {
    u = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'))
  } catch {
    throw invalid('Ungültige Adresse.')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw invalid('Nur http(s)-Adressen sind erlaubt.')
  if (u.username || u.password) throw invalid('Zugangsdaten in der Adresse sind nicht erlaubt.')
  const allowPrivate = allowPrivateEnv() && !opts.forcePublic
  if (allowPrivate) return u
  if (u.protocol !== 'https:') throw invalid('Bitte eine https-Adresse verwenden.')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && isPrivateIp(host)) throw invalid('Adressen im internen Netz sind hier nicht erlaubt.')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw invalid('Adressen im internen Netz sind hier nicht erlaubt.')
  return u
}

/** fetch mit Adressprüfung (auch beim Verbindungsaufbau), Zeitlimit und manuell geprüften Weiterleitungen. */
export function makeSafeFetch(opts: SafeOptions = {}): typeof fetch {
  const run = async (input: Parameters<typeof fetch>[0], init: RequestInit | undefined, hops: number): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = await assertPublicUrl(url, opts)
    const dispatcher = allowPrivateEnv() && !opts.forcePublic ? lanAgent : publicAgent
    const req = typeof input === 'string' || input instanceof URL ? u.href : input
    const res = (await undiciFetch(req as string, {
      ...(init as object),
      redirect: 'manual',
      dispatcher,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
    } as never)) as unknown as Response
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hops >= 3) throw invalid('Zu viele Weiterleitungen.')
      await res.body?.cancel().catch(() => {})
      return run(new URL(res.headers.get('location')!, u).href, init, hops + 1)
    }
    return opts.maxBytes ? limitBody(res, opts.maxBytes) : res
  }
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) => run(input, init, 0)) as typeof fetch
}

export const safeFetch = makeSafeFetch()

/** Text laden, beim Lesen nach maxBytes abbrechen (kein unbegrenztes Puffern). */
export async function fetchText(url: string, maxBytes = 15 * 1024 * 1024, headers?: Record<string, string>, opts: SafeOptions = {}) {
  const res = await makeSafeFetch(opts)(url.trim().replace(/^webcals?:\/\//i, 'https://'), { headers })
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    throw invalid(`Der Server antwortet mit Fehler ${res.status}.`)
  }
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) {
    await res.body?.cancel().catch(() => {})
    throw invalid('Die Datei ist zu groß.')
  }
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      throw invalid('Die Datei ist zu groß.')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
