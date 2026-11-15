import * as DM from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Copy, ExternalLink, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { FieldType, FormField, LocationKind } from '@shared/types'
import { LocationIcon } from '../components/LocationIcon'
import { useAuth } from '../auth/useAuth'
import { api, errorMessage } from '../lib/api'
import { cn } from '../lib/cn'
import { ACCENT_HUES } from '../lib/colors'
import { fmtDuration } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, CopyButton, Dialog, Field, Input, SectionHeader, Select, Switch, Textarea, toast, useRovingRadio } from '../ui'
import { EmbedCard } from '../components/EmbedCard'
import { ErrorBox, PageHeader } from './AdminShell'
import type { EventType } from './types'

const origin = () => location.origin

export function Terminseiten() {
  const me = useAuth().data!.user!
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['event-types'], queryFn: () => api<EventType[]>('/api/event-types') })
  const [del, setDel] = useState<EventType | null>(null)
  const toggle = useMutation({
    mutationFn: (e: EventType) => api(`/api/event-types/${e.id}`, { method: 'PATCH', body: { active: !e.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-types'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const duplicate = useMutation({
    mutationFn: (e: EventType) => {
      const { id: _id, slug: _slug, ...rest } = e
      return api('/api/event-types', { body: { ...rest, title: `${e.title} (Kopie)`, scheduleId: e.scheduleId ?? undefined } })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['event-types'] }); toast('Kopie angelegt') },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (e: EventType) => api<{ archived: boolean }>(`/api/event-types/${e.id}`, { method: 'DELETE' }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['event-types'] }); setDel(null); toast(r.archived ? 'Archiviert (es gibt Buchungen dazu)' : 'Gelöscht') },
    onError: (e) => { setDel(null); toast.error(errorMessage(e)) },
  })

  return (
    <>
      <PageHeader
        title="Terminseiten"
        description={<>Deine Seite: <a href={`/${me.handle}`} target="_blank" rel="noreferrer" className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">{location.host}/{me.handle}</a></>}
        actions={<Button variant="primary" onClick={() => nav('/admin/terminseiten/neu')}><Plus /> Neue Terminseite</Button>}
      />
      <ErrorBox error={q.error} />
      {q.data?.length === 0 && (
        <div className="enter flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="font-medium">Noch keine Terminseite</p>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">Eine Terminseite ist ein buchbarer Termintyp, z. B. „Erstgespräch, 30 Minuten, Videocall“.</p>
          <Button variant="primary" className="mt-5" onClick={() => nav('/admin/terminseiten/neu')}><Plus /> Erste Terminseite anlegen</Button>
        </div>
      )}
      <ul className="enter-stagger flex flex-col gap-2">
        {q.data?.map((e) => (
          <li key={e.id} className={cn('hover-lift relative flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface py-4 pr-3 pl-5 shadow-xs transition-[border-color,box-shadow] duration-150', !e.active && 'bg-surface/60')}>
            <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: `oklch(0.7 0.11 ${e.color})`, opacity: e.active ? 1 : 0.35 }} aria-hidden />
            <Link to={`/admin/terminseiten/${e.id}`} className="min-w-0 flex-1 rounded-2xl after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
              <p className={cn('truncate font-semibold', !e.active && 'text-muted')}>{e.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden /> {fmtDuration(e.duration)}</span>
                <span className="inline-flex items-center gap-1.5"><LocationIcon kind={e.location.kind} className="size-3.5" /> {locationOptions.find((l) => l.kind === e.location.kind)?.short}</span>
                {e.requiresConfirmation && <span>mit Bestätigung</span>}
              </p>
            </Link>
            <div className="relative z-10 flex items-center gap-1.5">
              {!e.active && <Badge>Pausiert</Badge>}
              <CopyButton value={`${origin()}/${me.handle}/${e.slug}`} />
              <a href={`/${me.handle}/${e.slug}`} target="_blank" rel="noreferrer" aria-label="Seite öffnen" className="press flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><ExternalLink className="size-4" /></a>
              <DM.Root>
                <DM.Trigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Weitere Aktionen"><MoreHorizontal /></Button>
                </DM.Trigger>
                <DM.Portal>
                  <DM.Content align="end" sideOffset={6} className="pop z-50 min-w-52 rounded-xl border border-line bg-surface p-1 shadow-pop">
                    <MenuItem onSelect={() => toggle.mutate(e)}>{e.active ? 'Pausieren' : 'Aktivieren'}</MenuItem>
                    <MenuItem onSelect={() => duplicate.mutate(e)}><Copy /> Duplizieren</MenuItem>
                    <DM.Separator className="my-1 h-px bg-line" />
                    <MenuItem danger onSelect={() => setDel(e)}><Trash2 /> Löschen</MenuItem>
                  </DM.Content>
                </DM.Portal>
              </DM.Root>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Terminseite löschen?"
        description={del ? `„${del.title}“ ist danach nicht mehr buchbar. Gibt es schon Buchungen, wird sie archiviert statt gelöscht.` : undefined}
        cancelLabel="Behalten"
        pending={remove.isPending}
        onConfirm={() => del && remove.mutate(del)}
      />
    </>
  )
}

function MenuItem({ children, onSelect, danger }: { children: React.ReactNode; onSelect?: () => void; danger?: boolean }) {
  return (
    <DM.Item onSelect={onSelect} className={cn('flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none select-none data-highlighted:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted', danger && 'text-danger data-highlighted:bg-danger-soft [&_svg]:text-danger')}>
      {children}
    </DM.Item>
  )
}

/* ================= Editor ================= */

const locationOptions: { kind: LocationKind; title: string; short: string; hint: string }[] = [
  { kind: 'video-template', title: 'Eigener Raum pro Termin', short: 'Videocall', hint: 'z. B. Jitsi oder kMeet, Link wird automatisch erzeugt' },
  { kind: 'video', title: 'Fester Video-Link', short: 'Videocall', hint: 'Dein Zoom-, Teams- oder kMeet-Raum' },
  { kind: 'onsite', title: 'Vor Ort', short: 'Vor Ort', hint: 'Adresse erscheint auf der Seite und in der Mail' },
  { kind: 'phone-host-calls', title: 'Ich rufe an', short: 'Telefon', hint: 'Telefonnummer wird bei der Buchung abgefragt' },
  { kind: 'phone-guest-calls', title: 'Gast ruft an', short: 'Telefon', hint: 'Deine Nummer steht in der Bestätigung' },
]

const durations = [15, 30, 45, 60, 90, 120]

const blank: Omit<EventType, 'id' | 'slug'> & { slug?: string } = {
  title: '',
  description: '',
  duration: 30,
  location: { kind: 'video-template', value: 'https://meet.jit.si/termind-{id}', label: '' },
  color: 172,
  active: true,
  requiresConfirmation: false,
  minNoticeMinutes: 720,
  windowDays: 60,
  bufferBefore: 0,
  bufferAfter: 10,
  slotStep: 30,
  fields: [],
  reminders: [1440, 60],
  scheduleId: null,
}

/** Beim Tippen Bindestriche am Ende erlauben, sonst wie slugify */
function slugTyping(s: string) {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '').slice(0, 60)
}

function slugify(s: string) {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function TerminseiteEditor() {
  const { id = 'neu' } = useParams()
  const isNew = id === 'neu'
  const me = useAuth().data!.user!
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['event-type', id], queryFn: () => api<EventType>(`/api/event-types/${id}`), enabled: !isNew })
  const [ev, setEv] = useState<typeof blank>(blank)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [online, setOnline] = useState<EventType | null>(null)
  // Nur einmal aus den Serverdaten übernehmen, damit ein Neuladen im Hintergrund keine Eingaben überschreibt
  const loadedId = useRef<string | null>(null)
  useEffect(() => {
    if (q.data && loadedId.current !== q.data.id) {
      loadedId.current = q.data.id
      setEv(q.data)
    }
  }, [q.data])
  const durationRoving = useRovingRadio(durations, ev.duration, (d) => set('duration', d))
  const hueRoving = useRovingRadio(ACCENT_HUES.map((x) => x.h), ev.color, (h) => set('color', h))
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setEv((e) => ({ ...e, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      const { scheduleId, ...rest } = ev as EventType
      const body = { ...rest, scheduleId: scheduleId ?? undefined, slug: slugify(ev.slug ?? '') || undefined }
      if (!isNew) return { saved: await api<EventType>(`/api/event-types/${id}`, { method: 'PATCH', body }), first: false }
      // Ist das die allererste Terminseite? Dann gibt es danach einen Dialog statt nur einer Meldung.
      const had = (await api<EventType[]>('/api/event-types')).length
      return { saved: await api<EventType>('/api/event-types', { body }), first: had === 0 }
    },
    onSuccess: ({ saved, first }) => {
      qc.invalidateQueries({ queryKey: ['event-types'] })
      qc.invalidateQueries({ queryKey: ['onboarding'] })
      qc.setQueryData(['event-type', saved.id], saved)
      if (first) setOnline(saved)
      else toast('Gespeichert')
      if (isNew) nav(`/admin/terminseiten/${saved.id}`, { replace: true })
    },
  })

  // Ohne geladene Daten nie das leere Formular zeigen (Speichern würde sonst Standardwerte schreiben)
  if (!isNew && !q.data) return q.isError ? <ErrorBox error={q.error} /> : null
  const loc = ev.location
  const link = `${origin()}/${me.handle}/${ev.slug || slugify(ev.title) || '…'}`

  return (
    <>
    <form onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <Link to="/admin/terminseiten" className="press -ml-2 mb-4 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /> Terminseiten</Link>
      <PageHeader
        title={isNew ? 'Neue Terminseite' : ev.title || 'Terminseite'}
        actions={<>
          {!isNew && <CopyButton value={link} size="md" />}
          <Button type="submit" variant="primary" disabled={save.isPending}>{isNew ? 'Anlegen' : 'Speichern'}</Button>
        </>}
      />
      <div className="mb-6"><ErrorBox error={save.error} /></div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-6">
            <SectionHeader title="Grundlagen" />
            <div className="mt-5 grid gap-5">
              <Field label="Titel" htmlFor="title">
                <Input id="title" required value={ev.title} placeholder="z. B. Kostenloses Erstgespräch" onChange={(e) => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)) }} />
              </Field>
              <Field label="Link" htmlFor="slug">
                <div className="flex items-center rounded-[10px] border border-line bg-sunken text-[15px] shadow-xs focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
                  <span className="hidden pl-3 text-muted sm:inline">{location.host}/{me.handle}/</span>
                  <input id="slug" value={ev.slug ?? ''} onChange={(e) => { setSlugTouched(true); set('slug', slugTyping(e.target.value)) }} onBlur={() => set('slug', slugify(ev.slug ?? ''))} className="h-10 min-w-0 flex-1 rounded-r-[10px] rounded-l-[10px] bg-surface px-3 outline-none sm:rounded-l-none" />
                </div>
              </Field>
              <Field label="Dauer">
                <div ref={durationRoving.ref} onKeyDown={durationRoving.onKeyDown} className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Dauer">
                  {durations.map((d) => (
                    <button type="button" key={d} role="radio" aria-checked={ev.duration === d} tabIndex={durationRoving.tabIndex(d)} onClick={() => set('duration', d)} className={cn('press h-9 rounded-lg pointer-coarse:h-11 border px-3.5 text-sm font-medium tabular', ev.duration === d ? 'border-accent bg-accent-soft text-accent-soft-fg' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')}>
                      {fmtDuration(d)}
                    </button>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <Input type="number" min={5} max={480} step={5} aria-label="Dauer in Minuten" value={ev.duration} onChange={(e) => set('duration', Number(e.target.value))} className="h-9 w-20 tabular" /> Min.
                  </label>
                </div>
              </Field>
              <Field label="Beschreibung" htmlFor="desc" hint="Steht auf der Buchungsseite. Kurz und konkret wirkt am besten.">
                <Textarea id="desc" value={ev.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
              <Field label="Farbe">
                <div ref={hueRoving.ref} onKeyDown={hueRoving.onKeyDown} className="flex gap-2" role="radiogroup" aria-label="Farbe">
                  {ACCENT_HUES.map(({ h, n }) => (
                    <button type="button" key={h} role="radio" aria-checked={ev.color === h} tabIndex={hueRoving.tabIndex(h)} aria-label={n} title={n} onClick={() => set('color', h)} className={cn('press relative size-7 rounded-full ring-offset-2 ring-offset-surface pointer-coarse:after:absolute pointer-coarse:after:-inset-2', ev.color === h && 'ring-2 ring-fg')} style={{ background: `oklch(0.7 0.11 ${h})` }} />
                  ))}
                </div>
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Ort" description="Wo findet der Termin statt?" />
            <div className="mt-5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ort">
              {locationOptions.map((o) => (
                <button type="button" key={o.kind} role="radio" aria-checked={loc.kind === o.kind}
                  onClick={() => set('location', { ...loc, kind: o.kind, value: o.kind === 'video-template' && !loc.value.includes('{id}') ? 'https://meet.jit.si/termind-{id}' : o.kind === loc.kind ? loc.value : o.kind.startsWith('video') && loc.kind.startsWith('video') ? loc.value : '' })}
                  className={cn('press flex items-start gap-3 rounded-xl border p-4 text-left', loc.kind === o.kind ? 'border-accent bg-accent-soft/50 ring-1 ring-accent' : 'border-line hover:border-line-strong')}>
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', loc.kind === o.kind ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}><LocationIcon kind={o.kind} className="size-[18px]" /></span>
                  <span>
                    <span className="block text-sm font-semibold">{o.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{o.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
              {loc.kind === 'video-template' && <Field label="Link-Vorlage" htmlFor="lv" help={<>Eine Vorlage für die Adresse deines Videoraums. Das Platzhalter-Stück <code className="rounded bg-surface-2 px-1">{'{id}'}</code> ersetzt termind bei jeder Buchung durch eine eigene Nummer, so hat jeder Termin seinen eigenen Raum.</>} hint={<>Aus <code className="rounded bg-surface-2 px-1">{'{id}'}</code> wird pro Buchung ein eigener Raumname. Für kMeet z. B. https://kmeet.infomaniak.com/termind-{'{id}'}</>}><Input id="lv" required value={loc.value} onChange={(e) => set('location', { ...loc, value: e.target.value })} className="font-mono text-[13px]" /></Field>}
              {loc.kind === 'video' && <Field label="Video-Link" htmlFor="lv"><Input id="lv" type="url" required placeholder="https://zoom.us/j/…" value={loc.value} onChange={(e) => set('location', { ...loc, value: e.target.value })} className="font-mono text-[13px]" /></Field>}
              {loc.kind === 'onsite' && <Field label="Adresse" htmlFor="lv"><Input id="lv" required value={loc.value} onChange={(e) => set('location', { ...loc, value: e.target.value })} /></Field>}
              {loc.kind === 'phone-guest-calls' && <Field label="Deine Telefonnummer" htmlFor="lv"><Input id="lv" type="tel" required value={loc.value} onChange={(e) => set('location', { ...loc, value: e.target.value })} /></Field>}
              {loc.kind.startsWith('video') && <Field label="Anzeigename (optional)" htmlFor="ll"><Input id="ll" placeholder="z. B. Zoom" value={loc.label ?? ''} onChange={(e) => set('location', { ...loc, label: e.target.value })} /></Field>}
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Zeiten & Regeln" description={<>Freie Zeiten kommen aus deiner <Link to="/admin/verfuegbarkeit" className="text-fg underline decoration-line-strong underline-offset-2">Verfügbarkeit</Link>.</>} />
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Mindestvorlauf" htmlFor="notice" hint="So kurzfristig kann frühestens gebucht werden.">
                <Select id="notice" value={ev.minNoticeMinutes} onChange={(e) => set('minNoticeMinutes', +e.target.value)}>
                  {[0, 60, 120, 240, 720, 1440, 2880, 4320, 10080].map((m) => <option key={m} value={m}>{m === 0 ? 'Kein Vorlauf' : m < 1440 ? `${m / 60} Stunde${m === 60 ? '' : 'n'}` : `${m / 1440} ${m === 1440 ? 'Tag' : 'Tage'}`}</option>)}
                </Select>
              </Field>
              <Field label="Buchbar bis" htmlFor="win" hint="So weit im Voraus ist der Kalender offen.">
                <Select id="win" value={ev.windowDays} onChange={(e) => set('windowDays', +e.target.value)}>
                  {[14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} Tage im Voraus</option>)}
                </Select>
              </Field>
              <Field label="Puffer davor" htmlFor="bb">
                <Select id="bb" value={ev.bufferBefore} onChange={(e) => set('bufferBefore', +e.target.value)}>{[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m ? `${m} Min.` : 'Kein Puffer'}</option>)}</Select>
              </Field>
              <Field label="Puffer danach" htmlFor="ba">
                <Select id="ba" value={ev.bufferAfter} onChange={(e) => set('bufferAfter', +e.target.value)}>{[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m ? `${m} Min.` : 'Kein Puffer'}</option>)}</Select>
              </Field>
              <Field label="Startzeiten im Raster von" htmlFor="step" className="sm:col-span-2">
                <Select id="step" value={ev.slotStep} onChange={(e) => set('slotStep', +e.target.value)}>{[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} Minuten</option>)}</Select>
              </Field>
            </div>
          </Card>

          <FieldsEditor fields={ev.fields} onChange={(f) => set('fields', f)} />

          <Card className="p-6">
            <SectionHeader title="Bestätigung & Erinnerungen" />
            <div className="mt-5 flex items-start justify-between gap-6">
              <label htmlFor="conf" className="text-sm">
                <span className="block font-medium">Buchungen erst nach meiner Bestätigung</span>
                <span className="mt-0.5 block text-muted">Der Gast schickt eine Anfrage, du bestätigst oder lehnst mit einem Klick ab. Die Zeit bleibt so lange reserviert.</span>
              </label>
              <Switch id="conf" label="Bestätigung nötig" checked={ev.requiresConfirmation} onCheckedChange={(v) => set('requiresConfirmation', v)} />
            </div>
            <div className="mt-5 flex items-start justify-between gap-6 border-t border-line pt-5">
              <label htmlFor="act" className="text-sm">
                <span className="block font-medium">Seite ist aktiv</span>
                <span className="mt-0.5 block text-muted">Pausierte Seiten sind nicht buchbar und erscheinen nicht auf deiner Profilseite.</span>
              </label>
              <Switch id="act" label="Aktiv" checked={ev.active} onCheckedChange={(v) => set('active', v)} />
            </div>
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-sm font-medium">Erinnerung an den Gast</p>
              <p className="mt-0.5 text-sm text-muted">Per Mail, mit Link zum Videocall und zum Verschieben.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[{ v: 10080, l: '1 Woche' }, { v: 2880, l: '2 Tage' }, { v: 1440, l: '24 Std.' }, { v: 120, l: '2 Std.' }, { v: 60, l: '1 Std.' }, { v: 15, l: '15 Min.' }].map((r) => {
                  const on = ev.reminders.includes(r.v)
                  return (
                    <button type="button" key={r.v} aria-pressed={on} onClick={() => set('reminders', on ? ev.reminders.filter((x) => x !== r.v) : [...ev.reminders, r.v].slice(-5))} className={cn('press h-9 rounded-lg border px-3.5 text-sm font-medium', on ? 'border-accent bg-accent-soft text-accent-soft-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg')}>
                      {r.l} vorher
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>

          {!isNew && <EmbedCard path={`${me.handle}/${ev.slug}`} />}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-10">
            <p className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">Vorschau</p>
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <span className="block h-1 w-10 rounded-full" style={{ background: `oklch(0.7 0.11 ${ev.color})` }} />
              <p className="mt-4 font-display text-[20px] leading-snug text-balance">{ev.title || 'Titel deiner Terminseite'}</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                <li className="flex items-center gap-2"><Clock className="size-4" /> {fmtDuration(ev.duration)}</li>
                <li className="flex items-center gap-2"><LocationIcon kind={loc.kind} className="size-4" /> {loc.label || locationOptions.find((l) => l.kind === loc.kind)?.short}</li>
              </ul>
              <p className="mt-4 line-clamp-4 text-sm whitespace-pre-line text-muted">{ev.description || 'Beschreibung …'}</p>
              {!isNew && <a href={`/${me.handle}/${ev.slug}`} target="_blank" rel="noreferrer" className="press mt-5 flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent text-sm font-medium text-accent-fg">Seite öffnen <ExternalLink className="size-4" /></a>}
            </div>
          </div>
        </aside>
      </div>
    </form>
    <OnlineDialog ev={online} handle={me.handle} onClose={() => setOnline(null)} />
    </>
  )
}

const typeLabels: Record<FieldType, string> = { text: 'Kurzer Text', textarea: 'Langer Text', phone: 'Telefon', select: 'Auswahl', checkbox: 'Häkchen' }

function FieldsEditor({ fields, onChange }: { fields: FormField[]; onChange: (f: FormField[]) => void }) {
  const upd = (i: number, patch: Partial<FormField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <Card className="p-6">
      <SectionHeader
        title="Buchungsformular"
        description="Name und E-Mail fragen wir immer ab."
        action={<Button type="button" size="sm" onClick={() => onChange([...fields, { id: `f${Date.now().toString(36)}`, label: '', type: 'text', required: false }])}><Plus /> Feld</Button>}
      />
      {fields.length > 0 && (
        <ul className="mt-5 flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={f.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto_auto] sm:items-center">
                <Input aria-label="Frage" required placeholder="Frage, z. B. Worum geht es dir?" value={f.label} onChange={(e) => upd(i, { label: e.target.value })} />
                <Select aria-label="Feldtyp" value={f.type} onChange={(e) => upd(i, { type: e.target.value as FieldType, options: e.target.value === 'select' ? (f.options ?? ['']) : undefined })}>
                  {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <label className="flex items-center gap-2 px-1 text-sm text-muted"><Switch label="Pflichtfeld" checked={f.required} onCheckedChange={(v) => upd(i, { required: v })} /> Pflicht</label>
                <Button type="button" variant="ghost" size="icon" aria-label="Feld entfernen" onClick={() => onChange(fields.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
              {f.type === 'select' && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {(f.options ?? []).map((o, k) => (
                    <span key={k} className="flex items-center gap-1">
                      <Input aria-label={`Option ${k + 1}`} required value={o} className="h-8 w-36 text-sm" onChange={(e) => upd(i, { options: f.options!.map((x, m) => (m === k ? e.target.value : x)) })} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Option entfernen" onClick={() => upd(i, { options: f.options!.filter((_, m) => m !== k) })}><X /></Button>
                    </span>
                  ))}
                  <Button type="button" size="sm" variant="ghost" onClick={() => upd(i, { options: [...(f.options ?? []), ''] })}><Plus /> Option</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Nach der allerersten Terminseite: Link, Kopieren, Ansehen und der Anstoß zur Testbuchung. */
function OnlineDialog({ ev, handle, onClose }: { ev: EventType | null; handle: string; onClose: () => void }) {
  const url = ev ? `${origin()}/${handle}/${ev.slug}` : ''
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: () => api<{ steps: { id: string; done: boolean }[] }>('/api/onboarding'), enabled: !!ev })
  const mailMissing = onboarding.data?.steps.find((s) => s.id === 'mail')?.done === false
  return (
    <Dialog
      open={!!ev}
      onOpenChange={(o) => !o && onClose()}
      title="Deine Terminseite ist online"
      description="Ab jetzt können Kunden über diesen Link bei dir buchen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Schließen</Button>
          <a href={url} target="_blank" rel="noreferrer" className="press inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-fg shadow-xs hover:bg-accent-hover"><ExternalLink className="size-4" /> Testbuchung machen</a>
        </>
      }
    >
      <code className="block rounded-[10px] border border-line bg-sunken px-3 py-2.5 font-mono text-[13px] break-all">{url}</code>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton value={url} label="Kopieren" size="md" />
        <a href={url} target="_blank" rel="noreferrer" aria-label="Seite ansehen" className="press flex size-10 items-center justify-center rounded-[10px] border border-line bg-surface text-muted shadow-xs hover:border-line-strong hover:text-fg"><ExternalLink className="size-4" /></a>
      </div>
      <p className="mt-4 text-sm text-muted">Mach am besten gleich eine Testbuchung, mit einer zweiten E-Mail-Adresse von dir. So siehst du die Seite und die Mails mit den Augen deiner Kunden. Den Termin kannst du danach unter „Termine“ absagen.</p>
      {mailMissing && <p className="mt-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn-fg">Der E-Mail-Versand ist noch nicht eingerichtet, Bestätigungen kommen so nicht an. <Link to="/admin/einstellungen/email" onClick={onClose} className="font-medium underline underline-offset-2">Jetzt einrichten</Link></p>}
      <p className="mt-3 text-sm text-muted">Den Code zum Einbetten auf deiner Webseite findest du unten auf dieser Seite.</p>
    </Dialog>
  )
}
