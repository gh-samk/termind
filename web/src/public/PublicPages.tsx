import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CalendarPlus, Check, Clock, Mail, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Branding, BookingStatus, PublicEventType, PublicHost } from '@shared/types'
import { LocationIcon } from '../components/LocationIcon'
import { SlotPicker } from '../components/SlotPicker'
import { api, ApiError, errorMessage } from '../lib/api'
import { fmtDateLong, fmtDuration, fmtTime } from '../lib/format'
import { useT } from '../lib/i18n'
import { setAccentHue } from '../lib/theme'
import { Avatar, Badge, Button, Dialog, Field, Input, Select, Textarea } from '../ui'

/* ---------------- Rahmen ---------------- */

export function useBranding() {
  const q = useQuery({ queryKey: ['instance'], queryFn: () => api<{ setupComplete: boolean; branding: Branding }>('/api/public/instance'), staleTime: 300_000 })
  useEffect(() => {
    if (q.data) setAccentHue(q.data.branding.accentHue)
  }, [q.data])
  return q.data?.branding
}

/* Eingebettet (?embed=1): ohne Seitenrahmen, Höhe wird an die Webseite gemeldet. */
export const isEmbed = new URLSearchParams(location.search).get('embed') === '1'

function useEmbedBridge() {
  useEffect(() => {
    if (!isEmbed) return
    const theme = new URLSearchParams(location.search).get('theme')
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
    document.documentElement.classList.add('embed')
    let last = 0
    const send = () => {
      const h = document.documentElement.scrollHeight
      if (Math.abs(h - last) > 1) {
        last = h
        window.parent.postMessage({ type: 'termind:height', height: h }, '*')
      }
    }
    const ro = new ResizeObserver(send)
    ro.observe(document.body)
    send()
    // Escape im iframe schließt das Popup auf der Webseite
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=dialog]') && window.parent.postMessage({ type: 'termind:close' }, '*')
    window.addEventListener('keydown', onKey)
    return () => {
      ro.disconnect()
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}

function PublicShell({ children }: { children: ReactNode }) {
  const { t } = useT()
  const b = useBranding()
  useEmbedBridge()
  if (isEmbed) {
    return (
      <main>
        {children}
        <p className="px-5 pt-3 pb-4 text-right text-[12px] text-subtle sm:px-7">{t.poweredBy} <span className="font-medium text-muted">termind</span></p>
      </main>
    )
  }
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-8 pb-8 sm:px-6 sm:pt-14">
      <main className="flex-1">{children}</main>
      <footer className="mx-auto mt-10 flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-3 px-1 text-[13px] text-subtle">
        <nav className="flex gap-4">
          {b?.imprintUrl && <a href={b.imprintUrl} className="hover:text-fg" target="_blank" rel="noreferrer">{t.imprint}</a>}
          {b?.privacyUrl && <a href={b.privacyUrl} className="hover:text-fg" target="_blank" rel="noreferrer">{t.privacy}</a>}
        </nav>
        <span>
          {t.poweredBy} <span className="font-medium text-muted">termind</span>
        </span>
      </footer>
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center text-center">{children}</div>
}

function NotFound({ error, retry }: { error?: unknown; retry?: () => void }) {
  const { t } = useT()
  // Nur echte 404 als „gibt es nicht“ anzeigen, alles andere als vorübergehenden Fehler
  if (error && !(error instanceof ApiError && error.status === 404)) {
    return (
      <Centered>
        <p className="font-semibold">{t.error}</p>
        {retry && <Button className="mt-4" onClick={retry}>{t.retry}</Button>}
      </Centered>
    )
  }
  return (
    <Centered>
      <p className="text-lg font-semibold">404</p>
      <p className="mt-2 text-muted">{t.notFound}</p>
    </Centered>
  )
}

function Loading() {
  return (
    <div className="mx-auto max-w-[1080px] animate-pulse rounded-3xl border border-line bg-surface p-8">
      <div className="h-5 w-40 rounded bg-surface-2" />
      <div className="mt-6 h-8 w-72 rounded bg-surface-2" />
      <div className="mt-10 h-64 rounded-xl bg-surface-2" />
    </div>
  )
}

function locationText(e: PublicEventType, host: PublicHost, t: ReturnType<typeof useT>['t']) {
  if (e.location.kind === 'onsite') return e.location.detail ?? e.location.label
  if (e.location.kind === 'phone-host-calls') return t.hostCalls(host.name.split(' ')[0])
  if (e.location.kind === 'phone-guest-calls') return t.guestCalls
  return `${e.location.label}, ${t.linkByMail}`
}

/* ---------------- Profil ---------------- */

export function ProfilePage() {
  const { handle = '' } = useParams()
  const { t, locale } = useT()
  const q = useQuery({ queryKey: ['profile', handle, locale], queryFn: () => api<{ host: PublicHost; eventTypes: PublicEventType[] }>(`/api/public/u/${encodeURIComponent(handle)}?lang=${locale}`), retry: false })
  useEffect(() => {
    if (q.data) document.title = q.data.host.name
  }, [q.data])
  return (
    <PublicShell>
      {q.isLoading ? null : q.isError || !q.data ? (
        <NotFound error={q.error} retry={() => q.refetch()} />
      ) : (
        <div className="mx-auto max-w-[640px]">
          <header className="enter flex flex-col items-center text-center">
            <Avatar name={q.data.host.name} size={72} />
            <h1 className="mt-5 font-display text-[28px] leading-tight">{q.data.host.name}</h1>
            {q.data.host.subtitle && <p className="mt-2 text-muted">{q.data.host.subtitle}</p>}
            <p className="mt-4 max-w-[46ch] text-[15px] text-pretty text-muted">{t.choosePage}</p>
          </header>
          {q.data.eventTypes.length === 0 && <p className="mt-10 text-center text-sm text-muted">{t.noPages}</p>}
          <ul className="enter-stagger mt-10 flex flex-col gap-3">
            {q.data.eventTypes.map((e) => (
              <li key={e.id}>
                <Link to={`/${encodeURIComponent(handle)}/${encodeURIComponent(e.slug)}${location.search}`} className="press hover-lift group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs">
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: `oklch(0.7 0.11 ${e.color})` }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{e.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden /> {fmtDuration(e.duration, locale)}</span>
                      <span className="inline-flex items-center gap-1.5"><LocationIcon kind={e.location.kind} className="size-3.5" /> {e.location.label}</span>
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PublicShell>
  )
}

/* ---------------- Buchung ---------------- */

function EventInfo({ host, e, start, tz, onBack, compact }: { host: PublicHost; e: PublicEventType; start?: string | null; tz?: string; onBack?: () => void; compact?: boolean }) {
  const { t, locale } = useT()
  return (
    <aside className="flex flex-col gap-5 p-5 sm:p-7">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 self-start"><ArrowLeft /> {t.back}</Button>
      )}
      <div className="flex items-center gap-3">
        <Avatar name={host.name} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{host.name}</p>
          {host.subtitle && <p className="truncate text-[13px] text-muted">{host.subtitle}</p>}
        </div>
      </div>
      <h1 className="font-display text-[24px] leading-[1.2] text-balance">{e.title}</h1>
      <ul className="flex flex-col gap-2.5 text-sm text-muted">
        <li className="flex items-center gap-2.5"><Clock className="size-4 shrink-0" aria-hidden /> {fmtDuration(e.duration, locale)}</li>
        <li className="flex items-start gap-2.5"><LocationIcon kind={e.location.kind} className="mt-0.5 size-4 shrink-0" /> {locationText(e, host, t)}</li>
        {start && tz && (
          <li className="enter flex items-start gap-2.5 font-medium text-fg">
            <CalendarPlus className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="capitalize">{fmtDateLong(start, tz, locale)}</span>
              <br />
              <span className="tabular">{fmtTime(start, tz, locale)} – {fmtTime(new Date(Date.parse(start) + e.duration * 60_000).toISOString(), tz, locale)}</span>
            </span>
          </li>
        )}
      </ul>
      {!compact && e.description && <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{e.description}</p>}
    </aside>
  )
}

export function EventPage() {
  const { handle = '', slug = '' } = useParams()
  const { locale } = useT()
  const q = useQuery({ queryKey: ['event', handle, slug, locale], queryFn: () => api<{ host: PublicHost; eventType: PublicEventType }>(`/api/public/u/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}?lang=${locale}`), retry: false })
  useEffect(() => {
    if (q.data) document.title = `${q.data.eventType.title} · ${q.data.host.name}`
  }, [q.data])
  return (
    <PublicShell>
      {q.isLoading ? <Loading /> : q.isError || !q.data ? <NotFound error={q.error} retry={() => q.refetch()} /> : <BookingFlow host={q.data.host} e={q.data.eventType} />}
    </PublicShell>
  )
}

function BookingFlow({ host, e }: { host: PublicHost; e: PublicEventType }) {
  const { t, locale } = useT()
  const branding = useBranding()
  const [step, setStep] = useState<'pick' | 'form' | 'done'>('pick')
  const [start, setStart] = useState<string | null>(null)
  const [tz, setTz] = useState('')
  const [form, setForm] = useState({ name: '', email: '' })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [consent, setConsent] = useState(false)
  const [result, setResult] = useState<{ manageToken: string; status: BookingStatus } | null>(null)

  const book = useMutation({
    mutationFn: () => api<{ manageToken: string; status: BookingStatus }>('/api/public/bookings', { body: { eventTypeId: e.id, start, name: form.name, email: form.email, timezone: tz, locale, answers, consent } }),
    onSuccess: (r) => {
      setResult(r)
      setStep('done')
      // Nur der Status geht an die einbettende Seite, keine Termin- oder Personendaten
      if (isEmbed) window.parent.postMessage({ type: 'termind:booked', status: r.status }, '*')
    },
  })

  return (
    <div className={isEmbed ? 'w-full bg-surface' : 'enter mx-auto w-full max-w-[1080px] overflow-hidden rounded-3xl border border-line bg-surface shadow-card'}>
      <div className="grid lg:grid-cols-[300px_1fr]">
        <EventInfo host={host} e={e} start={step !== 'pick' ? start : null} tz={tz} compact={step === 'done'} onBack={step === 'form' ? () => setStep('pick') : undefined} />
        <div className="border-t border-line lg:border-t-0 lg:border-l">
          {step === 'pick' && (
            <SlotPicker slotsUrl={`/api/public/event-types/${e.id}/slots`} onPick={(iso, z) => { setStart(iso); setTz(z); setStep('form') }} />
          )}

          {step === 'form' && (
            <section className="enter p-5 sm:p-7">
              <h2 className="text-[17px] font-semibold">{t.yourDetails}</h2>
              <form className="mt-5 flex max-w-[460px] flex-col gap-4" onSubmit={(ev) => { ev.preventDefault(); book.mutate() }}>
                <Field label={t.name} htmlFor="name">
                  <Input id="name" required autoComplete="name" value={form.name} onChange={(x) => setForm({ ...form, name: x.target.value })} />
                </Field>
                <Field label={t.email} htmlFor="email" hint={t.emailHint}>
                  <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(x) => setForm({ ...form, email: x.target.value })} />
                </Field>
                {e.fields.map((f) => {
                  const label = f.label + (f.required ? '' : ` ${t.optional}`)
                  const set = (v: string) => setAnswers((a) => ({ ...a, [f.id]: v }))
                  if (f.type === 'checkbox')
                    return (
                      <label key={f.id} className="flex items-start gap-3 text-sm">
                        <input type="checkbox" required={f.required} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" onChange={(x) => set(String(x.target.checked))} />
                        <span>{label}</span>
                      </label>
                    )
                  return (
                    <Field key={f.id} label={label} htmlFor={`f-${f.id}`}>
                      {f.type === 'textarea' ? (
                        <Textarea id={`f-${f.id}`} required={f.required} onChange={(x) => set(x.target.value)} />
                      ) : f.type === 'select' ? (
                        <Select id={`f-${f.id}`} required={f.required} defaultValue="" onChange={(x) => set(x.target.value)}>
                          <option value="" disabled>{t.pleaseChoose}</option>
                          {f.options?.map((o) => <option key={o}>{o}</option>)}
                        </Select>
                      ) : (
                        <Input id={`f-${f.id}`} type={f.type === 'phone' ? 'tel' : 'text'} autoComplete={f.type === 'phone' ? 'tel' : undefined} required={f.required} onChange={(x) => set(x.target.value)} />
                      )}
                    </Field>
                  )
                })}
                {branding?.consentRequired && (
                  <label className="mt-1 flex items-start gap-3 text-sm text-muted">
                    <input type="checkbox" required checked={consent} onChange={(x) => setConsent(x.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
                    <span>
                      {t.consent('§').split('§')[0]}
                      {branding.privacyUrl ? (
                        <a className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg" href={branding.privacyUrl} target="_blank" rel="noreferrer">{t.privacyNotes}</a>
                      ) : (
                        t.privacyNotes
                      )}
                      {t.consent('§').split('§')[1]}
                    </span>
                  </label>
                )}
                {book.isError && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">{errorMessage(book.error)}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button type="submit" variant="primary" size="lg" disabled={book.isPending}>
                    {e.requiresConfirmation ? t.request : t.book}
                  </Button>
                  {e.requiresConfirmation && <p className="text-[13px] text-muted">{t.requestHint(host.name.split(' ')[0])}</p>}
                </div>
              </form>
            </section>
          )}

          {step === 'done' && result && start && (
            <Done e={e} host={host} start={start} tz={tz} email={form.email} name={form.name} result={result} />
          )}
        </div>
      </div>
    </div>
  )
}

function googleUrl(e: PublicEventType, host: PublicHost, start: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const s = new Date(start)
  const en = new Date(s.getTime() + e.duration * 60_000)
  const p = new URLSearchParams({ action: 'TEMPLATE', text: `${e.title} · ${host.name}`, dates: `${f(s)}/${f(en)}` })
  return `https://calendar.google.com/calendar/render?${p}`
}

function Done({ e, host, start, tz, email, name, result }: { e: PublicEventType; host: PublicHost; start: string; tz: string; email: string; name: string; result: { manageToken: string; status: BookingStatus } }) {
  const { t, locale } = useT()
  const pending = result.status === 'pending'
  return (
    <section className="p-6 sm:p-10">
      <div className="enter mx-auto flex max-w-[440px] flex-col items-center text-center">
        <span className="check-pop flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          {pending ? <Mail className="size-6" /> : <Check className="size-7" strokeWidth={2.5} />}
        </span>
        <h2 className="mt-5 font-display text-[28px] leading-tight">{pending ? t.requested : t.booked}</h2>
        <p className="mt-2 text-[15px] text-pretty text-muted">
          {pending ? t.requestedText(host.name.split(' ')[0], email) : <>{name ? t.thanks(name.split(' ')[0]) + ' ' : ''}{t.bookedText(email)}</>}
        </p>
        <div className="mt-7 w-full rounded-2xl border border-line bg-surface-2/50 p-5 text-left">
          <p className="font-medium">{e.title}</p>
          <p className="mt-1 text-sm text-muted tabular"><span className="capitalize">{fmtDateLong(start, tz, locale)}</span>, {fmtTime(start, tz, locale)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><LocationIcon kind={e.location.kind} className="size-3.5" /> {e.location.label}</p>
        </div>
        {!pending && (
          <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
            <a href={`/api/public/b/${result.manageToken}/ics`} className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium shadow-xs hover:border-line-strong"><CalendarPlus className="size-4" /> {t.addIcs}</a>
            <a href={googleUrl(e, host, start)} target="_blank" rel="noreferrer" className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium shadow-xs hover:border-line-strong">{t.addGoogle}</a>
          </div>
        )}
        <div className="mt-8 flex items-center gap-1 text-sm">
          <Link to={`/b/${result.manageToken}?action=reschedule`} className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg"><RotateCcw className="size-4" /> {t.reschedule}</Link>
          <span className="text-line-strong" aria-hidden>·</span>
          <Link to={`/b/${result.manageToken}?action=cancel`} className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg"><X className="size-4" /> {t.cancel}</Link>
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-subtle"><ShieldCheck className="size-3.5" /> {t.privacyFooter}</p>
      </div>
    </section>
  )
}

/* ---------------- Termin verwalten (Gast) ---------------- */

interface ManageData {
  booking: { status: BookingStatus; startsAt: string; endsAt: string; guestName: string; guestEmail: string; guestTimezone: string; eventTitle: string; eventSlug: string; location: { kind: PublicEventType['location']['kind']; label: string; value: string } }
  host: PublicHost
  eventType: PublicEventType
}

export function ManagePage() {
  const { token = '' } = useParams()
  const { t, locale } = useT()
  const params = new URLSearchParams(location.search)
  const [mode, setMode] = useState<'view' | 'reschedule'>(params.get('action') === 'reschedule' ? 'reschedule' : 'view')
  const [cancelOpen, setCancelOpen] = useState(params.get('action') === 'cancel')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['manage', token], queryFn: () => api<ManageData>(`/api/public/b/${encodeURIComponent(token)}`), retry: false })

  const cancel = useMutation({
    mutationFn: () => api(`/api/public/b/${encodeURIComponent(token)}/cancel`, { body: { reason: reason || undefined } }),
    onSuccess: () => { setCancelOpen(false); setNotice(t.cancelledDone); q.refetch() },
  })
  const move = useMutation({
    mutationFn: (start: string) => api(`/api/public/b/${encodeURIComponent(token)}/reschedule`, { body: { start } }),
    onSuccess: () => { setMode('view'); setNotice(t.rescheduleDone); q.refetch() },
  })

  if (q.isLoading) return <PublicShell><Loading /></PublicShell>
  if (q.isError || !q.data) return <PublicShell><NotFound error={q.error} retry={() => q.refetch()} /></PublicShell>
  const { booking: b, host, eventType: e } = q.data
  const tz = b.guestTimezone
  const active = b.status === 'confirmed' || b.status === 'pending'
  const statusBadge = { confirmed: <Badge tone="accent">{t.statusConfirmed}</Badge>, pending: <Badge tone="warn">{t.statusPending}</Badge>, cancelled: <Badge tone="danger">{t.statusCancelled}</Badge>, declined: <Badge tone="danger">{t.statusDeclined}</Badge> }[b.status]

  return (
    <PublicShell>
      <div className="enter mx-auto w-full max-w-[1080px] overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="grid lg:grid-cols-[300px_1fr]">
          <EventInfo host={host} e={e} start={b.startsAt} tz={tz} compact onBack={mode === 'reschedule' ? () => setMode('view') : undefined} />
          <div className="border-t border-line lg:border-t-0 lg:border-l">
            {mode === 'reschedule' && active ? (
              <>
                <p className="px-5 pt-5 text-sm font-medium text-muted sm:px-7 sm:pt-7">{t.rescheduleTitle}</p>
                <SlotPicker slotsUrl={`/api/public/b/${encodeURIComponent(token)}/slots`} confirmLabel={move.isPending ? '…' : t.reschedule} busy={move.isPending} onPick={(iso) => move.mutate(iso)} />
                {move.isError && <p role="alert" className="mx-7 mb-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">{errorMessage(move.error)}</p>}
              </>
            ) : (
              <section className="p-6 sm:p-10">
                <div className="mx-auto max-w-[460px]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[17px] font-semibold">{t.manageTitle}</h2>
                    {statusBadge}
                  </div>
                  {notice && <p role="status" className="enter mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-fg">{notice}</p>}
                  <dl className="mt-5 grid grid-cols-[80px_1fr] gap-x-4 gap-y-3 text-sm">
                    <dt className="text-muted">{t.when}</dt>
                    <dd className="tabular"><span className="capitalize">{fmtDateLong(b.startsAt, tz, locale)}</span><br />{fmtTime(b.startsAt, tz, locale)} – {fmtTime(b.endsAt, tz, locale)} <span className="text-subtle">({tz})</span></dd>
                    <dt className="text-muted">{t.where}</dt>
                    <dd>{b.location.kind === 'video' && b.location.value ? <a href={b.location.value} className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noreferrer">{t.join}</a> : b.location.value || b.location.label}</dd>
                    <dt className="text-muted">{t.name}</dt>
                    <dd>{b.guestName}</dd>
                  </dl>
                  {active ? (
                    <div className="mt-8 flex flex-wrap gap-2">
                      {b.status === 'confirmed' && <a href={`/api/public/b/${encodeURIComponent(token)}/ics`} className="press inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-medium shadow-xs hover:border-line-strong"><CalendarPlus className="size-4" /> .ics</a>}
                      <Button onClick={() => { setNotice(null); setMode('reschedule') }}><RotateCcw /> {t.reschedule}</Button>
                      <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setCancelOpen(true)}><X /> {t.cancel}</Button>
                    </div>
                  ) : (
                    <Link to={`/${host.handle}/${b.eventSlug}`} className="press mt-8 inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg shadow-xs hover:bg-accent-hover">{t.bookAgain}</Link>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      <Dialog
        open={cancelOpen && active}
        onOpenChange={setCancelOpen}
        title={t.cancelConfirm}
        footer={<><Button variant="ghost" onClick={() => setCancelOpen(false)}>{t.keep}</Button><Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{t.cancelDo}</Button></>}
      >
        <Field label={t.cancelReason} htmlFor="reason">
          <Textarea id="reason" value={reason} onChange={(x) => setReason(x.target.value)} className="min-h-20" />
        </Field>
        {cancel.isError && <p role="alert" className="mt-3 text-sm text-danger">{errorMessage(cancel.error)}</p>}
      </Dialog>
    </PublicShell>
  )
}
