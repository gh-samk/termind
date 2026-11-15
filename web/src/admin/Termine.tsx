import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { safeHttpUrl } from '@shared/url'
import { AlertTriangle, ArrowRight, Bot, CalendarClock, Check, CircleDashed, ExternalLink, Mail, Plus, Search, SlidersHorizontal, Video, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LocationIcon } from '../components/LocationIcon'
import { useAuth } from '../auth/useAuth'
import { api, errorMessage } from '../lib/api'
import { cn } from '../lib/cn'
import { fmtDateLong, fmtDayMonth, fmtTime, fmtWeekday, isoDateIn, relativeDays } from '../lib/format'
import { Avatar, Badge, Button, CopyButton, Dialog, Field, Input, Segmented, Select, Sheet, Textarea, toast } from '../ui'
import { ErrorBox, PageHeader } from './AdminShell'
import { CalendarProblems } from './Kalender'
import { AddBookingDialog, RescheduleDialog } from './TermineDialogs'
import type { Booking, EventType, SettingsData } from './types'
import { dayEndIso, dayStartIso, fmtShortDate } from './zeit'

type View = 'upcoming' | 'pending' | 'past' | 'cancelled'

export function Termine() {
  const me = useAuth().data!.user!
  const tz = me.timezone
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('upcoming')
  const [q, setQ] = useState('')
  const [cancel, setCancel] = useState<Booking | null>(null)
  const [move, setMove] = useState<Booking | null>(null)
  const [adding, setAdding] = useState(false)
  const addBtn = useRef<HTMLButtonElement>(null)
  const [eventId, setEventId] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const qc = useQueryClient()
  const events = useQuery({ queryKey: ['event-types'], queryFn: () => api<EventType[]>('/api/event-types') })
  // Zeitraum nur anwenden, wenn er stimmig ist
  const rangeWrong = !!from && !!to && to < from
  const filterUrl = useMemo(() => {
    const p = new URLSearchParams({ view })
    if (q) p.set('q', q)
    if (eventId) p.set('eventTypeId', eventId)
    if (from && !rangeWrong) p.set('from', dayStartIso(from, tz))
    if (to && !rangeWrong) p.set('to', dayEndIso(to, tz))
    return `/api/bookings?${p}`
  }, [view, q, eventId, from, to, rangeWrong, tz])
  const filtered = !!(q || eventId || from || to)
  const activeFilters = (eventId ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0)

  const list = useQuery({ queryKey: ['bookings', 'list', filterUrl], queryFn: () => api<Booking[]>(filterUrl) })
  const pendingCount = useQuery({ queryKey: ['bookings', 'pending'], queryFn: () => api<Booking[]>('/api/bookings?view=pending'), select: (d) => d.length })
  const openId = params.get('termin')
  const open = useQuery({ queryKey: ['booking', openId], queryFn: () => api<Booking>(`/api/bookings/${openId}`), enabled: !!openId })

  const accept = useMutation({
    mutationFn: (b: Booking) => api(`/api/bookings/${b.id}/accept`, { body: {} }),
    onSuccess: (_r, b) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      toast(`Bestätigt, Mail an ${b.guestName.split(' ')[0]} ist raus`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>()
    for (const b of list.data ?? []) {
      const d = isoDateIn(new Date(b.startsAt), tz)
      m.set(d, [...(m.get(d) ?? []), b])
    }
    return [...m.entries()]
  }, [list.data, tz])

  return (
    <>
      <PageHeader
        title="Termine"
        description="Alles, was ansteht, und alles, was auf deine Antwort wartet."
        actions={<Button ref={addBtn} variant="primary" onClick={() => setAdding(true)}><Plus /> Termin eintragen</Button>}
      />
      <CalendarProblems />
      <Onboarding />
      <TodayCard tz={tz} onOpen={(id) => setParams({ termin: id })} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Ansicht"
          wrap
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: 'Bevorstehend' },
            { value: 'pending', label: <>Anfragen {!!pendingCount.data && <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-accent-fg tabular">{pendingCount.data}</span>}</> },
            { value: 'past', label: 'Vergangen' },
            { value: 'cancelled', label: 'Abgesagt' },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label="Termine durchsuchen" placeholder="Name oder E-Mail" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      <Button className="mb-4 sm:hidden" aria-expanded={showFilters} aria-controls="termin-filter" onClick={() => setShowFilters((v) => !v)}>
        <SlidersHorizontal /> Filter{activeFilters > 0 && <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-accent-fg tabular">{activeFilters}</span>}
      </Button>
      <div id="termin-filter" className={cn('mb-6 grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap', showFilters ? 'grid' : 'hidden')} role="group" aria-label="Filter">
        {(events.data?.length ?? 0) > 1 && (
          <div className="col-span-2 w-full sm:w-56">
            <Select aria-label="Nach Terminseite filtern" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Alle Terminseiten</option>
              {events.data!.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </Select>
          </div>
        )}
        <label className="flex min-w-0 flex-col gap-1 text-[13px] text-muted sm:flex-row sm:items-center sm:gap-2">Von <Input type="date" aria-label="Zeitraum von" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-10 w-full min-w-0 sm:w-40" /></label>
        <label className="flex min-w-0 flex-col gap-1 text-[13px] text-muted sm:flex-row sm:items-center sm:gap-2">Bis <Input type="date" aria-label="Zeitraum bis" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-10 w-full min-w-0 sm:w-40" /></label>
        {(eventId || from || to) && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setEventId(''); setFrom(''); setTo('') }}>Filter zurücksetzen</Button>}
      </div>
      {rangeWrong && <p role="alert" className="mb-4 text-sm text-danger">Das Ende des Zeitraums liegt vor dem Beginn. Der Zeitraum wird solange ignoriert.</p>}

      <ErrorBox error={list.error} />
      {list.isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-line bg-surface" />)}</div>
      ) : list.isError ? null : groups.length === 0 ? (
        <div className="enter flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <Check className="size-6 text-accent" aria-hidden />
          <p className="mt-3 font-medium">{filtered ? 'Nichts gefunden' : view === 'pending' ? 'Keine offenen Anfragen' : view === 'cancelled' ? 'Keine abgesagten Termine' : view === 'past' ? 'Keine vergangenen Termine' : 'Keine bevorstehenden Termine'}</p>
          <p className="mt-1 max-w-[42ch] text-sm text-muted">
            {filtered ? 'Mit diesen Filtern gibt es keine Treffer. Ändere die Auswahl oder setze die Filter zurück.' : view === 'pending' ? 'Neue Anfragen landen hier und per Mail bei dir.' : view === 'cancelled' ? 'Abgesagte und abgelehnte Termine erscheinen hier, getrennt von den vergangenen.' : view === 'past' ? 'Stattgefundene Termine erscheinen hier.' : <>Teile deinen Link <a className="text-fg underline decoration-line-strong underline-offset-2" href={`/${me.handle}`} target="_blank" rel="noreferrer">{location.host}/{me.handle}</a>, dann füllt sich die Liste.</>}
          </p>
        </div>
      ) : (
        <div key={view} className="enter-stagger flex flex-col gap-8">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-3 flex items-baseline gap-2 text-sm">
                <span className="font-semibold"><span className="capitalize">{fmtWeekday(items[0].startsAt, tz)}</span>, {fmtDayMonth(items[0].startsAt, tz)}</span>
                <span className="text-subtle">{relativeDays(items[0].startsAt, tz)}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((b) => (
                  <BookingRow key={b.id} b={b} tz={tz} accepting={accept.isPending && accept.variables?.id === b.id} onOpen={() => setParams({ termin: b.id })} onAccept={() => accept.mutate(b)} onDecline={() => setCancel(b)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <BookingSheet b={open.data ?? null} tz={tz} onClose={() => setParams({})} onOpenOther={(id) => setParams({ termin: id })} onCancel={(b) => { setParams({}); setCancel(b) }} onMove={(b) => { setParams({}); setMove(b) }} />
      <CancelDialog b={cancel} tz={tz} onClose={() => setCancel(null)} />
      {move && <RescheduleDialog b={move} onClose={() => setMove(null)} />}
      {adding && <AddBookingDialog onClose={() => { setAdding(false); requestAnimationFrame(() => addBtn.current?.focus()) }} onCreated={(id) => setParams({ termin: id })} />}
    </>
  )
}

/* ---------------- Heute ---------------- */

const joinUrl = (b: Booking) => (b.location.kind === 'video' ? safeHttpUrl(b.location.value) : null)
const placeOf = (b: Booking) => b.location.label || { video: 'Videocall', 'video-template': 'Videocall', onsite: b.location.value || 'Vor Ort', 'phone-host-calls': 'Telefon', 'phone-guest-calls': 'Telefon' }[b.location.kind]

function TodayCard({ tz, onOpen }: { tz: string; onOpen: (id: string) => void }) {
  // Großzügiges Fenster, den Tag in der Zeitzone des Gastgebers filtern wir selbst
  const day = useQuery({
    queryKey: ['bookings', 'today', isoDateIn(new Date(), tz)],
    queryFn: () => api<Booking[]>(`/api/bookings?view=all&from=${encodeURIComponent(new Date(Date.now() - 36 * 3600e3).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 36 * 3600e3).toISOString())}`),
    refetchInterval: 60_000,
  })
  const today = isoDateIn(new Date(), tz)
  const todays = (day.data ?? []).filter((b) => (b.status === 'confirmed' || b.status === 'pending') && isoDateIn(new Date(b.startsAt), tz) === today)
  const now = Date.now()
  const rest = todays.filter((b) => Date.parse(b.endsAt) > now)
  const next = rest[0]
  const nextOverall = useQuery({ queryKey: ['bookings', 'next'], queryFn: () => api<Booking[]>('/api/bookings?view=upcoming'), select: (d) => d.find((b) => isoDateIn(new Date(b.startsAt), tz) !== today) ?? null, enabled: day.isSuccess && !next })
  if (!day.isSuccess) return null
  const running = next && Date.parse(next.startsAt) <= now
  const join = next && next.status === 'confirmed' ? joinUrl(next) : null

  return (
    <section aria-labelledby="heute" className="enter mb-8 rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="heute" className="font-semibold">Heute</h2>
        {todays.length > 0 && <p className="text-sm text-muted tabular">{todays.length === 1 ? '1 Termin' : `${todays.length} Termine`}</p>}
      </div>
      {next ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="w-[88px] shrink-0 tabular">
            <p className="text-[17px] font-semibold">{fmtTime(next.startsAt, tz)}</p>
            <p className="text-[13px] text-muted">bis {fmtTime(next.endsAt, tz)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-accent">{running ? 'Läuft gerade' : 'Als Nächstes'}{next.status === 'pending' && ' · wartet auf deine Antwort'}</p>
            <p className="truncate font-semibold">{next.guestName} · {next.eventTitle}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted"><LocationIcon kind={next.location.kind} className="size-3.5" /> <span className="min-w-0 truncate">{placeOf(next)}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {join && <a href={join} target="_blank" rel="noreferrer" className="press inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg shadow-xs hover:bg-accent-hover pointer-coarse:h-11"><Video className="size-4" aria-hidden /> Beitreten<span className="sr-only"> (öffnet in neuem Tab)</span></a>}
            <Button onClick={() => onOpen(next.id)}>Details</Button>
          </div>
          {rest.length > 1 && <p className="basis-full text-sm text-muted">Danach: {rest.slice(1, 4).map((b) => `${fmtTime(b.startsAt, tz)} ${b.guestName}`).join(', ')}{rest.length > 4 ? ` und ${rest.length - 4} weitere` : ''}</p>}
        </div>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 text-left">
            {todays.length > 0 ? 'Für heute ist alles erledigt.' : 'Heute keine Termine.'}
            {nextOverall.data ? <> Nächster: <button type="button" onClick={() => onOpen(nextOverall.data!.id)} className="text-left font-medium text-fg underline decoration-line-strong underline-offset-2"><span className="capitalize">{fmtWeekday(nextOverall.data.startsAt, tz)}</span>, {fmtDayMonth(nextOverall.data.startsAt, tz)}, {fmtTime(nextOverall.data.startsAt, tz)} Uhr mit {nextOverall.data.guestName}</button></> : nextOverall.isSuccess ? ' Es steht auch nichts Weiteres an.' : null}
          </span>
        </p>
      )}
    </section>
  )
}

/* ---------------- Erste Schritte ---------------- */

interface OnboardingData {
  celebrate: boolean
  steps: { id: 'mail' | 'availability' | 'eventType' | 'legal' | 'calendar' | 'testBooking'; done: boolean; optional: boolean }[]
  doneCount: number
  total: number
  allDone: boolean
  hidden: boolean
}

function Onboarding() {
  const me = useAuth().data!.user!
  const owner = me.role === 'owner'
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  // ?willkommen=1 kommt nach der Einrichtung: Karte einmal zeigen, Parameter aus der Adresse entfernen
  const [welcome, setWelcome] = useState(params.get('willkommen') === '1')
  useEffect(() => {
    if (!params.has('willkommen')) return
    const next = new URLSearchParams(params)
    next.delete('willkommen')
    setParams(next, { replace: true })
  }, [params, setParams])
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsData>('/api/settings'), enabled: owner })
  const events = useQuery({ queryKey: ['event-types'], queryFn: () => api<EventType[]>('/api/event-types') })
  const list = useQuery({ queryKey: ['onboarding'], queryFn: () => api<OnboardingData>('/api/onboarding'), enabled: owner })
  const hide = useMutation({
    mutationFn: () => api('/api/onboarding', { method: 'PUT', body: { hidden: true } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['onboarding'] }); toast('Ausgeblendet. Du kannst sie unter Einstellungen → Profil wieder einblenden.') },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const dismissDone = useMutation({
    mutationFn: () => api('/api/onboarding', { method: 'PUT', body: { doneDismissed: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const mailFailing = (settings.data?.mail.failed ?? 0) > 0
  const profileUrl = `${location.origin}/${me.handle}`
  const firstActive = events.data?.find((e) => e.active)
  const testUrl = firstActive ? `/${me.handle}/${firstActive.slug}` : `/${me.handle}`
  const info: Record<OnboardingData['steps'][number]['id'], { label: string; hint?: string; to: string; external?: boolean }> = {
    mail: { label: 'E-Mail-Versand einrichten und testen', hint: 'Mit erfolgreicher Testmail', to: '/admin/einstellungen/email' },
    availability: { label: 'Verfügbarkeit festlegen', hint: 'Einmal speichern genügt', to: '/admin/verfuegbarkeit' },
    eventType: { label: 'Erste Terminseite anlegen', to: '/admin/terminseiten/neu' },
    legal: { label: 'Impressum und Datenschutz verlinken', hint: 'Beide Links hinterlegen', to: '/admin/einstellungen/datenschutz' },
    calendar: { label: 'Kalender verbinden', hint: 'Belegte Zeiten werden automatisch ausgespart', to: '/admin/einstellungen/kalender' },
    testBooking: { label: 'Testbuchung machen', hint: 'Buche dich mit einer zweiten E-Mail-Adresse und sage den Termin danach ab', to: testUrl, external: true },
  }
  const data = list.data
  const remaining = data ? data.total - data.doneCount : 0

  return (
    <>
      {welcome && (
        <div className="enter mb-6 rounded-2xl border border-accent/30 bg-accent-soft p-5 text-accent-soft-fg sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Willkommen, {me.name.split(' ')[0]}! Dein Konto steht.</p>
              <p className="mt-1 text-sm opacity-90">Das ist der Link zu deiner Terminseite. Er funktioniert, sobald du unten die ersten Schritte erledigt hast.</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Schließen" onClick={() => setWelcome(false)} className="-mt-1 -mr-2 shrink-0 text-accent-soft-fg hover:text-accent-soft-fg"><X /></Button>
          </div>
          <code className="mt-4 block rounded-[10px] bg-surface px-3 py-2.5 font-mono text-[13px] break-all text-fg">{profileUrl}</code>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CopyButton value={profileUrl} label="Kopieren" size="md" />
            <a href={profileUrl} target="_blank" rel="noreferrer" className="press inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-medium text-fg shadow-xs hover:border-line-strong"><ExternalLink className="size-4" /> Ansehen</a>
          </div>
          {owner && !data?.hidden && <p className="mt-3 text-sm opacity-90">Die Checkliste „Erste Schritte“ führt dich durch den Rest.</p>}
        </div>
      )}
      {mailFailing && settings.data && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4 text-warn-fg">
          <AlertTriangle className="mt-0.5 size-[18px] shrink-0" aria-hidden />
          <div className="min-w-[220px] flex-1 text-sm">
            <p className="font-semibold">{settings.data.mail.failed} Mail{settings.data.mail.failed > 1 ? 's' : ''} konnte{settings.data.mail.failed > 1 ? 'n' : ''} nicht gesendet werden.</p>
            <p className="mt-0.5 opacity-90">{settings.data.mail.lastError}</p>
          </div>
          <Link to="/admin/einstellungen/email" className="press ml-[30px] inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-fg shadow-xs sm:ml-0">Prüfen</Link>
        </div>
      )}
      {data?.allDone && data.celebrate && !welcome && (
        <div className="enter mb-8 rounded-2xl border border-accent/30 bg-accent-soft p-5 text-accent-soft-fg sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Geschafft – deine Buchungsseite ist startklar</p>
              <p className="mt-1 text-sm opacity-90">Alle Schritte sind erledigt. Teile jetzt diesen Link oder binde ihn auf deiner Webseite ein.</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Schließen" disabled={dismissDone.isPending} onClick={() => dismissDone.mutate()} className="-mt-1 -mr-2 shrink-0 text-accent-soft-fg hover:text-accent-soft-fg"><X /></Button>
          </div>
          <code className="mt-4 block rounded-[10px] bg-surface px-3 py-2.5 font-mono text-[13px] break-all text-fg">{profileUrl}</code>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CopyButton value={profileUrl} label="Kopieren" size="md" />
            <a href={profileUrl} target="_blank" rel="noreferrer" className="press inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-medium text-fg shadow-xs hover:border-line-strong"><ExternalLink className="size-4" /> Ansehen</a>
          </div>
        </div>
      )}
      {data && !data.hidden && !data.allDone && (
        <section aria-labelledby="erste-schritte" className="enter mb-8 rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="erste-schritte" className="font-semibold">Erste Schritte</h2>
              <p className="mt-0.5 text-sm text-muted">{remaining === 1 ? 'Noch ein Schritt' : `Noch ${remaining} Schritte`}, dann können Kunden bei dir buchen.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tabular">{data.doneCount} von {data.total}</span>
              <Button size="sm" variant="ghost" disabled={hide.isPending} onClick={() => hide.mutate()}>Ausblenden</Button>
            </div>
          </div>
          <div role="progressbar" aria-label="Fortschritt Erste Schritte" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.doneCount} className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(data.doneCount / data.total) * 100}%` }} />
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.steps.map((st) => {
              const x = info[st.id]
              const body = (
                <>
                  {st.done ? <Check className="size-4 shrink-0 text-accent" aria-hidden /> : <CircleDashed className="size-4 shrink-0 text-subtle" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm font-medium', st.done && 'text-muted line-through decoration-line-strong')}>{x.label}{st.optional && <Badge className="ml-2 align-middle">optional</Badge>}</span>
                    {x.hint && !st.done && <span className="mt-0.5 block text-[13px] leading-snug font-normal text-muted">{x.hint}</span>}
                  </span>
                  {!st.done && (x.external ? <ExternalLink className="size-4 shrink-0 text-subtle" aria-hidden /> : <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />)}
                </>
              )
              const cls = 'press group flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 py-2 hover:border-line-strong hover:bg-surface-2/60'
              return (
                <li key={st.id}>
                  {st.done && !x.external ? (
                    <Link to={x.to} className={cn(cls, 'border-transparent')}>{body}</Link>
                  ) : x.external ? (
                    <a href={x.to} target="_blank" rel="noreferrer" className={cn(cls, st.done && 'border-transparent')}>{body}<span className="sr-only"> (öffnet in neuem Tab)</span></a>
                  ) : (
                    <Link to={x.to} className={cls}>{body}</Link>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </>
  )
}

/* ---------------- Liste ---------------- */

function BookingRow({ b, tz, onOpen, onAccept, onDecline, accepting }: { b: Booking; tz: string; onOpen: () => void; onAccept: () => void; onDecline: () => void; accepting?: boolean }) {
  const inactive = b.status === 'cancelled' || b.status === 'declined'
  return (
    <li className={cn('hover-lift relative flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface py-4 pr-4 pl-5 shadow-xs transition-[border-color,box-shadow] duration-150', inactive && 'opacity-60')}>
      <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: `oklch(0.7 0.11 ${b.eventColor ?? 172})` }} aria-hidden />
      <div className="w-[88px] shrink-0 tabular">
        <p className="text-[17px] font-semibold">{fmtTime(b.startsAt, tz)}</p>
        <p className="text-[13px] text-muted">bis {fmtTime(b.endsAt, tz)}</p>
      </div>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
        <p className="truncate font-semibold">{b.eventTitle}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{b.guestName}</span>
          <span className="inline-flex items-center gap-1.5"><LocationIcon kind={b.location.kind} className="size-3.5" /> {b.location.label || { video: 'Videocall', 'video-template': 'Videocall', onsite: 'Vor Ort', 'phone-host-calls': 'Telefon', 'phone-guest-calls': 'Telefon' }[b.location.kind]}</span>
        </p>
      </button>
      <div className="relative z-10 flex flex-wrap items-center gap-2">
        {b.createdVia === 'mcp' && <Badge><Bot className="size-3.5" /> über KI</Badge>}
        {b.status === 'cancelled' && <Badge tone="danger">Abgesagt</Badge>}
        {b.status === 'declined' && <Badge tone="danger">Abgelehnt</Badge>}
        {b.status === 'pending' && (
          <>
            <Button size="sm" variant="ghost" onClick={onDecline}>Ablehnen</Button>
            <Button size="sm" variant="primary" disabled={accepting} onClick={onAccept}><Check /> Bestätigen</Button>
          </>
        )}
      </div>
    </li>
  )
}

/* ---------------- Details ---------------- */

type NoteState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Notiz speichert sich selbst: kurz nach dem Tippen, beim Verlassen des Feldes und beim Schließen.
 * Der Stand wird pro Termin geführt, ein laufendes Speichern eines Termins stört nie einen anderen.
 */
function useAutosaveNote(b: Booking | null) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState({ id: '', text: '' })
  const [st, setSt] = useState<{ id: string; kind: NoteState }>({ id: '', kind: 'idle' })
  const saved = useRef(new Map<string, string>())
  const busy = useRef(new Map<string, { queued: string | null }>())
  const latest = useRef({ id: '', text: '' })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => { latest.current = draft })
  // Serverstand merken; ungespeicherte Eingaben werden dabei nie überschrieben
  useEffect(() => {
    if (!b) return
    const unsaved = draft.id === b.id && draft.text !== saved.current.get(b.id)
    if (!unsaved || !saved.current.has(b.id)) saved.current.set(b.id, b.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id, b?.note])

  const run = useCallback(async (id: string, text: string) => {
    clearTimeout(timer.current)
    if (!id || saved.current.get(id) === undefined || saved.current.get(id) === text) return
    // Läuft für diesen Termin schon eine Anfrage, folgt danach genau eine weitere mit dem neuesten Text
    const slot = busy.current.get(id)
    if (slot) { slot.queued = text; return }
    busy.current.set(id, { queued: null })
    const t0 = Date.now()
    setSt({ id, kind: 'saving' })
    try {
      await api(`/api/bookings/${id}`, { method: 'PATCH', body: { note: text } })
      saved.current.set(id, text)
      qc.setQueryData<Booking>(['booking', id], (old) => (old ? { ...old, note: text } : old))
      // „Wird gespeichert …“ bleibt kurz lesbar
      if (Date.now() - t0 < 400) await new Promise((r) => setTimeout(r, 400 - (Date.now() - t0)))
      setSt({ id, kind: latest.current.id === id && latest.current.text !== text ? 'idle' : 'saved' })
    } catch (e) {
      setSt({ id, kind: 'error' })
      toast.error(`Die Notiz konnte nicht gespeichert werden. ${errorMessage(e)}`)
    } finally {
      const next = busy.current.get(id)?.queued
      busy.current.delete(id)
      if (next != null) void run(id, next)
    }
  }, [qc])

  // Nach kurzer Pause speichern
  useEffect(() => {
    if (!draft.id || draft.text === saved.current.get(draft.id)) return
    timer.current = setTimeout(() => void run(draft.id, draft.text), 800)
    return () => clearTimeout(timer.current)
  }, [draft, run])
  // Beim Verlassen der Seite noch Offenes wegschicken
  useEffect(() => () => { const l = latest.current; void run(l.id, l.text) }, [run])

  const note = b ? (draft.id === b.id ? draft.text : (b.note ?? '')) : ''
  return {
    note,
    setNote: (text: string) => b && setDraft({ id: b.id, text }),
    state: st.id === b?.id ? st.kind : ('idle' as NoteState),
    flush: () => { const l = latest.current; return run(l.id, l.text) },
  }
}

function BookingSheet({ b, tz, onClose, onCancel, onMove, onOpenOther }: { b: Booking | null; tz: string; onClose: () => void; onCancel: (b: Booking) => void; onMove: (b: Booking) => void; onOpenOther: (id: string) => void }) {
  const { note, setNote, state, flush } = useAutosaveNote(b)
  const history = useQuery({ queryKey: ['booking-history', b?.id], queryFn: () => api<{ total: number; items: { id: string; startsAt: string; status: Booking['status']; eventTitle: string }[] }>(`/api/bookings/${b!.id}/history`), enabled: !!b })
  const active = b && (b.status === 'confirmed' || b.status === 'pending')
  const ended = !!b && Date.parse(b.endsAt) < Date.now()
  const noteHint = state === 'saving' ? 'Wird gespeichert …' : state === 'saved' ? 'Gespeichert' : state === 'error' ? <>Nicht gespeichert. <button type="button" onClick={() => void flush()} className="font-medium text-fg underline underline-offset-2">Erneut versuchen</button></> : 'Sieht nur dein Team. Wird automatisch gespeichert.'
  return (
    <Sheet
      open={!!b}
      onOpenChange={(o) => { if (!o) { void flush(); onClose() } }}
      title="Termin"
      footer={active ? (
        <>
          {!ended && <Button onClick={() => { void flush(); onMove(b!) }}><CalendarClock /> Verschieben</Button>}
          {!ended && <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => { void flush(); onCancel(b!) }}><X /> {b!.status === 'pending' ? 'Ablehnen' : 'Absagen'}</Button>}
        </>
      ) : undefined}
    >
      {b && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm text-muted capitalize">{fmtDateLong(b.startsAt, tz)}</p>
            <p className="mt-1 text-2xl font-semibold tabular">{fmtTime(b.startsAt, tz)} – {fmtTime(b.endsAt, tz)}</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <Avatar name={b.guestName} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{b.guestName}</p>
              <p className="truncate text-sm text-muted">{b.guestEmail}</p>
            </div>
            <a href={`mailto:${b.guestEmail}`} aria-label="E-Mail schreiben" className="press flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg pointer-coarse:size-11"><Mail className="size-4" /></a>
          </div>
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted">Ort</dt>
            <dd className="min-w-0 break-words">
              {b.location.kind === 'video' && safeHttpUrl(b.location.value) ? <a className="inline-flex items-center gap-1 text-accent hover:underline" href={safeHttpUrl(b.location.value)!} target="_blank" rel="noreferrer">{b.location.label || 'Videocall'} beitreten <ExternalLink className="size-3" /></a> : b.location.value || 'Telefon'}
            </dd>
            <dt className="text-muted">Status</dt>
            <dd>{{ pending: <Badge tone="warn">Wartet auf dich</Badge>, cancelled: <Badge tone="danger">Abgesagt</Badge>, declined: <Badge tone="danger">Abgelehnt</Badge>, confirmed: <Badge tone="accent">Bestätigt</Badge> }[b.status]}</dd>
            <dt className="text-muted">Zeitzone Gast</dt>
            <dd>{b.guestTimezone}</dd>
            {b.notifyGuest === false && <><dt className="text-muted">Mails</dt><dd className="text-muted">Gast wird nicht per Mail informiert</dd></>}
            <dt className="text-muted">Gebucht über</dt>
            <dd>{{ web: 'Buchungsseite', mcp: 'KI-Assistent', admin: 'Oberfläche', api: 'API' }[b.createdVia]}</dd>
            {b.cancelReason && <><dt className="text-muted">Nachricht</dt><dd>{b.cancelReason}</dd></>}
            {b.answers.map((a) => (
              <div key={a.fieldId} className="contents">
                <dt className="text-muted">{a.label}</dt>
                <dd className="whitespace-pre-line">{a.value}</dd>
              </div>
            ))}
          </dl>
          <Field label="Interne Notiz" htmlFor="booking-note" hint={<span aria-live="polite">{noteHint}</span>}>
            <Textarea id="booking-note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => void flush()} placeholder="z. B. Vorbereitung, Kontext …" />
          </Field>
          {history.data && history.data.total > 0 && (
            <section aria-labelledby="gast-historie">
              <h3 id="gast-historie" className="text-[13px] font-medium">Frühere Termine dieses Gastes ({history.data.total})</h3>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {history.data.items.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => { void flush(); onOpenOther(h.id) }} className="press flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2/60">
                      <span className="w-28 shrink-0 text-muted tabular">{fmtShortDate(h.startsAt, tz)}</span>
                      <span className="min-w-0 flex-1 truncate">{h.eventTitle}</span>
                      {(h.status === 'cancelled' || h.status === 'declined') && <Badge tone="danger">{h.status === 'cancelled' ? 'Abgesagt' : 'Abgelehnt'}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
              {history.data.total > history.data.items.length && <p className="mt-2 text-[13px] text-muted">Angezeigt werden die letzten {history.data.items.length}.</p>}
            </section>
          )}
        </div>
      )}
    </Sheet>
  )
}

function CancelDialog({ b, tz, onClose }: { b: Booking | null; tz: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const decline = b?.status === 'pending'
  const m = useMutation({
    mutationFn: () => api(`/api/bookings/${b!.id}/cancel`, { body: { reason: reason || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      toast(decline ? 'Abgelehnt, Mail ist raus' : 'Abgesagt, Mail ist raus')
      setReason('')
      onClose()
    },
  })
  return (
    <Dialog
      open={!!b}
      onOpenChange={(o) => !o && onClose()}
      title={decline ? 'Anfrage ablehnen?' : 'Termin absagen?'}
      description={b ? `${b.guestName} bekommt eine Mail mit dieser Nachricht und einem Link für einen neuen Termin.` : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>Behalten</Button><Button variant="danger" disabled={m.isPending} onClick={() => m.mutate()}>{decline ? 'Ablehnen & Mail senden' : 'Absagen & Mail senden'}</Button></>}
    >
      {b && (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl border border-line bg-surface-2/60 p-4 text-sm">
            <span className="font-medium">{b.eventTitle}</span> · {fmtDayMonth(b.startsAt, tz)}, {fmtTime(b.startsAt, tz)} Uhr
          </p>
          <Field label="Persönliche Nachricht (optional)" htmlFor="reason">
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Mir ist etwas dazwischengekommen." className="min-h-20" />
          </Field>
          <ErrorBox error={m.error} />
        </div>
      )}
    </Dialog>
  )
}
