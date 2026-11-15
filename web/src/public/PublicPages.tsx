import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CalendarPlus, Check, Clock, Loader2, Mail, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { Branding, BookingStatus, PublicEventType, PublicHost } from '@shared/types'
import { LocationIcon } from '../components/LocationIcon'
import { SlotPicker } from '../components/SlotPicker'
import { api, ApiError, errorMessage } from '../lib/api'
import { fmtDateLong, fmtDuration } from '../lib/format'
import { addMinutes, dayIn, defaultH12, fmtTimeRange, googleCalendarUrl, looksLikeEmail, prefillFrom, tzShort } from '../lib/guest'
import { useT } from '../lib/i18n'
import { setAccentHue } from '../lib/theme'
import { Avatar, Badge, Button, ConfirmDialog, Dialog, Field, Input, Select, Textarea } from '../ui'

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

/** Fokus auf die Überschrift des neuen Schritts (Screenreader), ohne den Sprung zu erzwingen; nur wenn sie außerhalb des Sichtfelds liegt, wird gescrollt. */
function focusStepHeading() {
  const h = document.querySelector<HTMLElement>('[data-step-heading]')
  if (!h) return
  h.focus({ preventScroll: true })
  const r = h.getBoundingClientRect()
  if (r.top < 0 || r.top > window.innerHeight * 0.7) h.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

/* Gut sichtbarer zweiter Knopf (Link): 40 px hoch, auf Touchgeräten 44 px */
const secondaryBtn = 'press inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-medium text-fg shadow-xs hover:border-line-strong hover:bg-surface-2 pointer-coarse:h-11 [&_svg]:size-4 [&_svg]:shrink-0'
const primaryBtn = 'press inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg shadow-xs hover:bg-accent-hover pointer-coarse:h-11'

function NotFound({ error, retry, homeHref }: { error?: unknown; retry?: () => void; homeHref?: string }) {
  const { t } = useT()
  // Eine Fehlerseite gehört nicht in Suchmaschinen (der Server liefert für alle SPA-Pfade 200)
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])
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
      <h1 className="text-lg font-semibold text-balance">{t.notFound.split('. ')[0]}.</h1>
      <p className="mt-2 text-pretty text-muted">{t.notFound.split('. ').slice(1).join('. ')}</p>
      {homeHref && <Link to={homeHref} className={`${secondaryBtn} mt-6`}>{t.toOverview}</Link>}
    </Centered>
  )
}

/* Platzhalter beim Laden (Pulsieren wird bei „Bewegung reduzieren“ in index.css abgeschaltet) */
function Loading({ kind = 'card' }: { kind?: 'card' | 'profile' }) {
  const { t } = useT()
  if (kind === 'profile')
    return (
      <div role="status" aria-busy="true" className="mx-auto max-w-[640px] animate-pulse">
        <span className="sr-only">{t.loading}</span>
        <div className="flex flex-col items-center">
          <div className="size-[72px] rounded-full bg-surface-2" />
          <div className="mt-5 h-7 w-56 rounded bg-surface-2" />
          <div className="mt-4 h-4 w-72 max-w-full rounded bg-surface-2" />
        </div>
        <div className="mt-10 flex flex-col gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-[82px] rounded-2xl border border-line bg-surface" />)}
        </div>
      </div>
    )
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-[1080px] animate-pulse overflow-hidden rounded-3xl border border-line bg-surface">
      <span className="sr-only">{t.loading}</span>
      <div className="grid lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="flex items-center gap-3"><div className="size-11 rounded-full bg-surface-2" /><div className="h-4 w-32 rounded bg-surface-2" /></div>
          <div className="h-7 w-48 rounded bg-surface-2" />
          <div className="h-4 w-24 rounded bg-surface-2" />
        </div>
        <div className="border-t border-line p-5 sm:p-7 lg:border-t-0 lg:border-l">
          <div className="h-5 w-40 rounded bg-surface-2" />
          <div className="mt-6 h-64 rounded-xl bg-surface-2" />
        </div>
      </div>
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
      {q.isLoading ? <Loading kind="profile" /> : q.isError || !q.data ? (
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

function EventInfo({ host, e, start, end, tz, h12, startLabel, struck, onBack, compact }: { host: PublicHost; e: PublicEventType; start?: string | null; end?: string; tz?: string; h12?: boolean; startLabel?: string; struck?: boolean; onBack?: () => void; compact?: boolean }) {
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
              {startLabel && <span className="block text-xs font-normal text-subtle">{startLabel}</span>}
              <span className={struck ? 'line-through' : undefined}>
                <span className="capitalize">{fmtDateLong(start, tz, locale)}</span>
                <br />
                <span className="tabular whitespace-nowrap">{fmtTimeRange(start, end ?? addMinutes(start, e.duration), tz, locale, h12 ?? defaultH12(locale, tz))}</span>
              </span>
              <br />
              <span className="text-[13px] font-normal text-muted">{tzShort(tz, new Date(start), locale)}</span>
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
      {q.isLoading ? <Loading /> : q.isError || !q.data ? <NotFound error={q.error} retry={() => q.refetch()} homeHref={isEmbed ? undefined : `/${encodeURIComponent(handle)}`} /> : <BookingFlow host={q.data.host} e={q.data.eventType} />}
    </PublicShell>
  )
}

function BookingFlow({ host, e }: { host: PublicHost; e: PublicEventType }) {
  const { t, locale } = useT()
  const branding = useBranding()
  const qc = useQueryClient()
  const loc = useLocation()
  const [step, setStep] = useState<'pick' | 'form' | 'done'>('pick')
  const [start, setStart] = useState<string | null>(null)
  const [tz, setTz] = useState('')
  const [h12, setH12] = useState(false)
  // Name und E-Mail dürfen vorbelegt sein (z. B. nach einem vergangenen Termin), bleiben aber editierbar
  const [form, setForm] = useState(() => prefillFrom(loc.state))
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [result, setResult] = useState<{ manageToken: string; status: BookingStatus } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const book = useMutation({
    mutationFn: () => api<{ manageToken: string; status: BookingStatus }>('/api/public/bookings', { body: { eventTypeId: e.id, start, name: form.name, email: form.email, timezone: tz, locale, answers, consent } }),
    onSuccess: (r) => {
      setResult(r)
      setStep('done')
      // Nur der Status geht an die einbettende Seite, keine Termin- oder Personendaten
      if (isEmbed) window.parent.postMessage({ type: 'termind:booked', status: r.status }, '*')
    },
    onError: (err) => {
      // Zeit inzwischen vergeben: zurück zur Auswahl, frische Zeiten laden, Eingaben bleiben stehen
      if (err instanceof ApiError && err.code === 'slot_taken') {
        qc.removeQueries({ queryKey: ['slots'] })
        setNotice(t.slotTaken)
        setStep('pick')
        return
      }
      // Fehler des Servers am Feld anzeigen (Name/E-Mail), alles andere als Meldung über dem Knopf
      const mapped: Record<string, string> = {}
      if (err instanceof ApiError) {
        for (const i of err.issues ?? []) {
          const k = i.path[0]
          if (k === 'name' && !mapped.name) mapped.name = i.code === 'too_small' ? t.nameRequired : i.message
          if (k === 'email' && !mapped.email) mapped.email = i.code === 'too_small' || i.code === 'invalid_format' ? t.emailInvalid : i.message
        }
      }
      if (Object.keys(mapped).length) {
        setErrors(mapped)
        setFocusTick((n) => n + 1)
      } else setFormError(errorMessage(err))
    },
  })

  // Nach „Zeit vergeben“: Hinweis sichtbar machen und vorlesen lassen
  useEffect(() => {
    if (step !== 'pick' || !notice || !noticeRef.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    noticeRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
    noticeRef.current.focus({ preventScroll: true })
  }, [step, notice])

  // Fokus auf das erste fehlerhafte Feld
  useEffect(() => {
    if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  // Beim Schrittwechsel Überschrift fokussieren (nicht beim ersten Anzeigen); bei Hinweis „Zeit vergeben“ übernimmt der Hinweis
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) return void (firstStep.current = false)
    if (step === 'pick' && notice) return
    requestAnimationFrame(focusStepHeading)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearError = (k: string) => setErrors((er) => (k in er ? Object.fromEntries(Object.entries(er).filter(([x]) => x !== k)) : er))

  const validate = () => {
    const er: Record<string, string> = {}
    if (!form.name.trim()) er.name = t.nameRequired
    if (!form.email.trim()) er.email = t.emailRequired
    else if (!looksLikeEmail(form.email)) er.email = t.emailInvalid
    for (const f of e.fields) {
      if (!f.required) continue
      const v = answers[f.id] ?? ''
      if (f.type === 'checkbox' ? v !== 'true' : !v.trim()) er[`f-${f.id}`] = f.type === 'checkbox' ? t.checkNamed(f.label) : f.type === 'select' ? t.choiceNamed(f.label) : t.fieldNamed(f.label)
    }
    if (branding?.consentRequired && !consent) er.consent = e.requiresConfirmation ? t.consentRequiredRequest : t.consentRequired
    return er
  }

  const submit = (ev: { preventDefault: () => void }) => {
    ev.preventDefault()
    if (book.isPending) return
    setFormError(null)
    const er = validate()
    setErrors(er)
    if (Object.keys(er).length) return setFocusTick((n) => n + 1)
    book.mutate()
  }

  return (
    <div className={isEmbed ? 'w-full bg-surface' : 'enter mx-auto w-full max-w-[1080px] overflow-hidden rounded-3xl border border-line bg-surface shadow-card'}>
      <div className="grid lg:grid-cols-[300px_1fr]">
        <EventInfo host={host} e={e} start={step !== 'pick' ? start : null} tz={tz} h12={h12} compact={step === 'done'} onBack={step === 'form' ? () => setStep('pick') : undefined} />
        <div className="border-t border-line lg:border-t-0 lg:border-l">
          {step === 'pick' && (
            <>
              {notice && (
                <div ref={noticeRef} tabIndex={-1} role="alert" className="mx-5 mt-5 scroll-mt-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn-fg focus:outline-none sm:mx-7 sm:mt-7">{notice}</div>
              )}
              <SlotPicker
                slotsUrl={`/api/public/event-types/${e.id}/slots`}
                initialTz={tz || undefined}
                initialDay={start && tz ? dayIn(start, tz) : undefined}
                initialH12={tz ? h12 : undefined}
                onPick={(iso, z, hh) => { setStart(iso); setTz(z); setH12(hh); setNotice(null); setStep('form') }}
              />
            </>
          )}

          {step === 'form' && (
            <section className="enter p-5 sm:p-7">
              <h2 data-step-heading tabIndex={-1} className="text-[17px] font-semibold focus:outline-none">{t.yourDetails}</h2>
              <form ref={formRef} noValidate className="mt-5 flex max-w-[460px] flex-col gap-4" onSubmit={submit}>
                <Field label={`${t.name} ${t.requiredMark}`} htmlFor="name" error={errors.name}>
                  <Input id="name" aria-required autoComplete="name" value={form.name} onChange={(x) => { setForm({ ...form, name: x.target.value }); clearError('name') }} />
                </Field>
                <Field label={`${t.email} ${t.requiredMark}`} htmlFor="email" hint={t.emailHint} error={errors.email}>
                  <Input id="email" type="email" aria-required autoComplete="email" value={form.email} onChange={(x) => { setForm({ ...form, email: x.target.value }); clearError('email') }} />
                </Field>
                {e.fields.map((f) => {
                  const key = `f-${f.id}`
                  const label = `${f.label} ${f.required ? t.requiredMark : t.optional}`
                  const value = answers[f.id] ?? ''
                  const set = (v: string) => { setAnswers((a) => ({ ...a, [f.id]: v })); clearError(key) }
                  if (f.type === 'checkbox')
                    return (
                      <div key={f.id}>
                        <label className="flex items-start gap-3 text-sm">
                          <input id={key} type="checkbox" checked={value === 'true'} aria-required={f.required || undefined} aria-invalid={errors[key] ? true : undefined} aria-describedby={errors[key] ? `${key}-err` : undefined} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" onChange={(x) => set(String(x.target.checked))} />
                          <span>{label}</span>
                        </label>
                        {errors[key] && <p id={`${key}-err`} role="alert" className="mt-1.5 pl-7 text-[13px] leading-snug text-danger">{errors[key]}</p>}
                      </div>
                    )
                  return (
                    <Field key={f.id} label={label} htmlFor={key} error={errors[key]}>
                      {f.type === 'textarea' ? (
                        <Textarea id={key} aria-required={f.required || undefined} value={value} onChange={(x) => set(x.target.value)} />
                      ) : f.type === 'select' ? (
                        <Select id={key} aria-required={f.required || undefined} value={value} onChange={(x) => set(x.target.value)}>
                          <option value="" disabled>{t.pleaseChoose}</option>
                          {f.options?.map((o) => <option key={o}>{o}</option>)}
                        </Select>
                      ) : (
                        <Input id={key} type={f.type === 'phone' ? 'tel' : 'text'} autoComplete={f.type === 'phone' ? 'tel' : undefined} aria-required={f.required || undefined} value={value} onChange={(x) => set(x.target.value)} />
                      )}
                    </Field>
                  )
                })}
                {branding?.consentRequired && (
                  <div className="mt-1">
                    <label className="flex items-start gap-3 text-sm text-muted">
                      <input type="checkbox" id="consent" aria-required checked={consent} aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? 'consent-err' : undefined} onChange={(x) => { setConsent(x.target.checked); clearError('consent') }} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
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
                    {errors.consent && <p id="consent-err" role="alert" className="mt-1.5 pl-7 text-[13px] leading-snug text-danger">{errors.consent}</p>}
                  </div>
                )}
                {formError && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">{formError}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button type="submit" variant="primary" size="lg" disabled={book.isPending} aria-busy={book.isPending}>
                    {book.isPending ? (
                      <><Loader2 className="animate-spin" aria-hidden /> {e.requiresConfirmation ? t.requesting : t.booking}</>
                    ) : e.requiresConfirmation ? t.request : t.book}
                  </Button>
                  {e.requiresConfirmation && <p className="text-[13px] text-muted">{t.requestHint(host.name.split(' ')[0])}</p>}
                </div>
              </form>
            </section>
          )}

          {step === 'done' && result && start && (
            <Done e={e} host={host} start={start} tz={tz} h12={h12} email={form.email} name={form.name} result={result} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Ort für den Kalendereintrag: Adresse, Video-Link oder (ohne Link) die Bezeichnung der Art */
const calendarLocation = (kind: PublicEventType['location']['kind'], label: string, value?: string) => (kind === 'onsite' || kind === 'video' ? value || label : label)

function Done({ e, host, start, tz, h12, email, name, result }: { e: PublicEventType; host: PublicHost; start: string; tz: string; h12: boolean; email: string; name: string; result: { manageToken: string; status: BookingStatus } }) {
  const { t, locale } = useT()
  const pending = result.status === 'pending'
  const end = addMinutes(start, e.duration)
  return (
    <section className="p-6 sm:p-10">
      <div className="enter mx-auto flex max-w-[440px] flex-col items-center text-center">
        <span className="check-pop flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          {pending ? <Mail className="size-6" /> : <Check className="size-7" strokeWidth={2.5} />}
        </span>
        <h2 data-step-heading tabIndex={-1} className="mt-5 font-display text-[28px] leading-tight focus:outline-none">{pending ? t.requested : t.booked}</h2>
        <p className="mt-2 text-[15px] text-pretty text-muted">
          {pending ? t.requestedText(host.name.split(' ')[0], email) : <>{name ? t.thanks(name.split(' ')[0]) + ' ' : ''}{t.bookedText(email)}</>}
        </p>
        <div className="mt-7 w-full rounded-2xl border border-line bg-surface-2/50 p-5 text-left">
          <p className="font-medium">{e.title}</p>
          <p className="mt-1 text-sm text-muted tabular"><span className="capitalize">{fmtDateLong(start, tz, locale)}</span>, <span className="whitespace-nowrap">{fmtTimeRange(start, end, tz, locale, h12)}</span></p>
          <p className="mt-0.5 text-[13px] text-subtle">{tzShort(tz, new Date(start), locale)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><LocationIcon kind={e.location.kind} className="size-3.5" /> {e.location.label}</p>
        </div>
        {!pending && (
          <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
            <a href={`/api/public/b/${result.manageToken}/ics`} className={secondaryBtn}><CalendarPlus /> {t.addIcs}</a>
            <a href={googleCalendarUrl({ title: `${e.title} · ${host.name}`, start, durationMin: e.duration, location: calendarLocation(e.location.kind, e.location.label, e.location.detail), description: e.description, footer: t.manageNote })} target="_blank" rel="noreferrer" className={secondaryBtn}>{t.addGoogle}</a>
          </div>
        )}
        <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
          <Link to={`/b/${result.manageToken}?action=reschedule`} className={secondaryBtn}><RotateCcw /> {t.reschedule}</Link>
          <Link to={`/b/${result.manageToken}?action=cancel`} className={secondaryBtn}><X /> {t.cancel}</Link>
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
  const qc = useQueryClient()
  const params = new URLSearchParams(location.search)
  const [mode, setMode] = useState<'view' | 'reschedule'>(params.get('action') === 'reschedule' ? 'reschedule' : 'view')
  const [cancelOpen, setCancelOpen] = useState(params.get('action') === 'cancel')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  // Gewählte neue Zeit, die noch bestätigt werden muss; letzte Auswahl bleibt für den Fall „Zeit vergeben“ erhalten
  const [pick, setPick] = useState<{ iso: string; tz: string; h12: boolean } | null>(null)
  const [lastPick, setLastPick] = useState<{ tz: string; day: string; h12: boolean } | null>(null)
  const [pickerKey, setPickerKey] = useState(0)
  const [moveNotice, setMoveNotice] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['manage', token], queryFn: () => api<ManageData>(`/api/public/b/${encodeURIComponent(token)}`), retry: false })

  const cancel = useMutation({
    mutationFn: () => api(`/api/public/b/${encodeURIComponent(token)}/cancel`, { body: { reason: reason || undefined } }),
    onSuccess: () => { setCancelOpen(false); setNotice(t.cancelledDone); q.refetch() },
  })
  const move = useMutation({
    mutationFn: (start: string) => api(`/api/public/b/${encodeURIComponent(token)}/reschedule`, { body: { start } }),
    onSuccess: async () => {
      setPick(null)
      setMode('view')
      // Der neue Status entscheidet, was der Gast liest: bestätigt oder erst angefragt
      const r = await q.refetch()
      setNotice(r.data?.booking.status === 'pending' ? t.rescheduleDonePending : t.rescheduleDoneConfirmed)
    },
    onError: (err) => {
      setPick(null)
      if (err instanceof ApiError && err.code === 'slot_taken') {
        qc.removeQueries({ queryKey: ['slots'] })
        setPickerKey((k) => k + 1)
        setMoveNotice(t.slotTakenMove)
      } else setMoveNotice(errorMessage(err))
    },
  })

  // Nach Verschieben/Absagen (Hinweis) und beim Wechsel der Ansicht: Überschrift fokussieren
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) return void (firstView.current = false)
    requestAnimationFrame(focusStepHeading)
  }, [mode, notice])

  if (q.isLoading) return <PublicShell><Loading /></PublicShell>
  if (q.isError || !q.data) return <PublicShell><NotFound error={q.error} retry={() => q.refetch()} /></PublicShell>
  const { booking: b, host, eventType: e } = q.data
  const tz = b.guestTimezone
  const h12 = defaultH12(locale, tz)
  const active = b.status === 'confirmed' || b.status === 'pending'
  const past = Date.parse(b.startsAt) < Date.now()
  const statusBadge = { confirmed: <Badge tone="accent">{t.statusConfirmed}</Badge>, pending: <Badge tone="warn">{t.statusPending}</Badge>, cancelled: <Badge tone="danger">{t.statusCancelled}</Badge>, declined: <Badge tone="danger">{t.statusDeclined}</Badge> }[b.status]
  const durationMin = Math.max(1, Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000))
  const whenText = (iso: string, z: string, hh: boolean) => `${fmtDateLong(iso, z, locale)}, ${fmtTimeRange(iso, addMinutes(iso, durationMin), z, locale, hh)}`
  const oldText = (z: string, hh: boolean) => whenText(b.startsAt, z, hh)

  return (
    <PublicShell>
      <div className="enter mx-auto w-full max-w-[1080px] overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="grid lg:grid-cols-[300px_1fr]">
          <EventInfo host={host} e={e} start={b.startsAt} end={b.endsAt} tz={tz} h12={h12} startLabel={!active ? (b.status === 'declined' ? t.statusDeclined : t.statusCancelled) : mode === 'reschedule' ? t.previously : undefined} struck={!active} compact onBack={mode === 'reschedule' ? () => setMode('view') : undefined} />
          <div className="border-t border-line lg:border-t-0 lg:border-l">
            {mode === 'reschedule' && active && !past ? (
              <>
                <div className="px-5 pt-5 sm:px-7 sm:pt-7">
                  <p className="text-sm font-medium text-muted">{t.rescheduleTitle}</p>
                  <p className="mt-1 text-sm text-subtle tabular">{t.previouslyAt(oldText(tz, h12))}</p>
                </div>
                {moveNotice && <p role="alert" className="mx-5 mt-4 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn-fg sm:mx-7">{moveNotice}</p>}
                <SlotPicker
                  key={pickerKey}
                  slotsUrl={`/api/public/b/${encodeURIComponent(token)}/slots`}
                  busy={move.isPending}
                  current={b.startsAt}
                  initialTz={lastPick?.tz}
                  initialDay={lastPick?.day}
                  initialH12={lastPick?.h12}
                  onPick={(iso, z, hh) => { setMoveNotice(null); setLastPick({ tz: z, day: dayIn(iso, z), h12: hh }); setPick({ iso, tz: z, h12: hh }) }}
                />
              </>
            ) : (
              <section className="p-6 sm:p-10">
                <div className="mx-auto max-w-[460px]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 data-step-heading tabIndex={-1} className="text-[17px] font-semibold focus:outline-none">{t.manageTitle}</h2>
                    {statusBadge}
                  </div>
                  {notice && <p role="status" className="enter mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-fg">{notice}</p>}
                  <dl className="mt-5 grid grid-cols-[80px_1fr] gap-x-4 gap-y-3 text-sm">
                    <dt className="text-muted">{t.when}</dt>
                    <dd className="tabular"><span className="capitalize">{fmtDateLong(b.startsAt, tz, locale)}</span><br /><span className="whitespace-nowrap">{fmtTimeRange(b.startsAt, b.endsAt, tz, locale, h12)}</span><br /><span className="text-[13px] text-subtle">{tzShort(tz, new Date(b.startsAt), locale)}</span></dd>
                    <dt className="text-muted">{t.where}</dt>
                    <dd>{b.location.kind === 'video' && b.location.value ? <a href={b.location.value} className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noreferrer">{t.join}</a> : b.location.value || b.location.label}</dd>
                    <dt className="text-muted">{t.name}</dt>
                    <dd>{b.guestName}</dd>
                  </dl>
                  {active && past && <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t.past}</p>}
                  {active && !past && (
                    <div className="mt-8 flex flex-wrap gap-2">
                      {b.status === 'confirmed' && (
                        <>
                          <a href={`/api/public/b/${encodeURIComponent(token)}/ics`} className={secondaryBtn}><CalendarPlus /> {t.addIcs}</a>
                          <a href={googleCalendarUrl({ title: `${b.eventTitle} · ${host.name}`, start: b.startsAt, durationMin, location: calendarLocation(b.location.kind, b.location.label, b.location.value), description: e.description, footer: t.manageNote })} target="_blank" rel="noreferrer" className={secondaryBtn}>{t.addGoogle}</a>
                        </>
                      )}
                      <Button onClick={() => { setNotice(null); setMoveNotice(null); setMode('reschedule') }}><RotateCcw /> {t.reschedule}</Button>
                      <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setCancelOpen(true)}><X /> {t.cancel}</Button>
                    </div>
                  )}
                  {(!active || past) && (
                    <Link to={`/${encodeURIComponent(host.handle)}/${encodeURIComponent(b.eventSlug)}`} state={{ name: b.guestName, email: b.guestEmail }} className={`${primaryBtn} mt-8`}>{t.bookAgain}</Link>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!pick}
        onOpenChange={(o) => { if (!o && !move.isPending) setPick(null) }}
        title={t.moveTitle}
        description={pick && (
          <>
            {t.moveConfirm(whenText(b.startsAt, pick.tz, pick.h12), whenText(pick.iso, pick.tz, pick.h12))}
            <span className="mt-1 block text-[13px] text-subtle">{tzShort(pick.tz, new Date(pick.iso), locale)}</span>
          </>
        )}
        confirmLabel={t.moveDo}
        cancelLabel={t.backToTimes}
        danger={false}
        pending={move.isPending}
        onConfirm={() => pick && move.mutate(pick.iso)}
      />
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
