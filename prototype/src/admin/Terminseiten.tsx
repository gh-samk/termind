import * as DM from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, Clock, Code2, Copy, ExternalLink, GripVertical, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LocationIcon } from '../components/LocationIcon'
import { eventTypes as initial, fmtDuration, host, type EventType, type LocationKind } from '../data/mock'
import { cn } from '../lib/cn'
import { Badge, Button, Card, CopyButton, Field, Input, Select, SectionHeader, Switch, Textarea, toast } from '../ui'
import { PageHeader } from './AdminShell'

export function Terminseiten() {
  const [list, setList] = useState(initial)
  const nav = useNavigate()
  return (
    <>
      <PageHeader
        title="Terminseiten"
        description={
          <>
            Deine Seite: <a href={`/${host.handle}`} target="_blank" className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">{host.domain}/{host.handle}</a>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => nav('/admin/terminseiten/neu')}>
            <Plus /> Neue Terminseite
          </Button>
        }
      />
      <ul className="enter-stagger flex flex-col gap-2">
        {list.map((e) => (
          <li key={e.id} className={cn('hover-lift relative flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface py-4 pr-3 pl-5 shadow-xs transition-[border-color,box-shadow,opacity] duration-150', !e.active && 'bg-surface/60')}>
            <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: `oklch(0.7 0.11 ${e.color})`, opacity: e.active ? 1 : 0.35 }} aria-hidden />
            <Link to={`/admin/terminseiten/${e.id}`} className="min-w-0 flex-1 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
              <p className={cn('truncate font-semibold', !e.active && 'text-muted')}>{e.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden /> {fmtDuration(e.duration)}</span>
                <span className="inline-flex items-center gap-1.5"><LocationIcon kind={e.location.kind} className="size-3.5" /> {e.location.label}</span>
                {e.requiresConfirmation && <span>mit Bestätigung</span>}
              </p>
            </Link>
            <div className="relative z-10 flex items-center gap-1.5">
              {!e.active && <Badge>Pausiert</Badge>}
              <CopyButton value={`https://${host.domain}/${host.handle}/${e.slug}`} />
              <Button variant="ghost" size="icon" aria-label="Seite öffnen" onClick={() => window.open(`/${host.handle}/${e.slug}`, '_blank')}>
                <ExternalLink />
              </Button>
              <DM.Root>
                <DM.Trigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Weitere Aktionen">
                    <MoreHorizontal />
                  </Button>
                </DM.Trigger>
                <DM.Portal>
                  <DM.Content align="end" sideOffset={6} className="pop z-50 min-w-52 rounded-xl border border-line bg-surface p-1 shadow-pop">
                    <MenuItem onSelect={() => setList((l) => l.map((x) => (x.id === e.id ? { ...x, active: !x.active } : x)))}>
                      <span className="flex-1">{e.active ? 'Pausieren' : 'Aktivieren'}</span>
                    </MenuItem>
                    <MenuItem onSelect={() => toast('Kopie angelegt')}><Copy /> Duplizieren</MenuItem>
                    <MenuItem onSelect={() => nav(`/admin/terminseiten/${e.id}#einbetten`)}><Code2 /> Auf Webseite einbetten</MenuItem>
                    <DM.Separator className="my-1 h-px bg-line" />
                    <MenuItem danger onSelect={() => toast('In den Papierkorb verschoben')}><Trash2 /> Löschen</MenuItem>
                  </DM.Content>
                </DM.Portal>
              </DM.Root>
            </div>
          </li>
        ))}
      </ul>
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

const locationOptions: { kind: LocationKind; title: string; hint: string }[] = [
  { kind: 'video-template', title: 'Eigener Raum pro Termin', hint: 'z. B. Jitsi oder kMeet, Link wird automatisch erzeugt' },
  { kind: 'video', title: 'Fester Video-Link', hint: 'Dein Zoom-, Teams- oder kMeet-Raum' },
  { kind: 'onsite', title: 'Vor Ort', hint: 'Adresse erscheint in der Bestätigung' },
  { kind: 'phone', title: 'Telefon', hint: 'Du rufst an oder der Gast ruft an' },
]

const durations = [15, 30, 45, 60, 90]

export function TerminseiteEditor() {
  const { id } = useParams()
  const base = initial.find((e) => e.id === id)
  const [ev, setEv] = useState<EventType>(
    base ?? { ...initial[0], id: 'neu', title: '', slug: '', description: '', fields: [], requiresConfirmation: false },
  )
  const set = <K extends keyof EventType>(k: K, v: EventType[K]) => setEv((e) => ({ ...e, [k]: v }))
  const isNew = !base

  return (
    <>
      <Link to="/admin/terminseiten" className="press -ml-2 mb-4 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
        <ArrowLeft className="size-4" /> Terminseiten
      </Link>
      <PageHeader
        title={isNew ? 'Neue Terminseite' : ev.title}
        actions={
          <>
            {!isNew && <CopyButton value={`https://${host.domain}/${host.handle}/${ev.slug}`} size="md" />}
            <Button variant="primary" onClick={() => toast('Gespeichert')}>Speichern</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <SectionHeader title="Grundlagen" />
            <div className="mt-5 grid gap-5">
              <Field label="Titel" htmlFor="title">
                <Input id="title" value={ev.title} placeholder="z. B. Kostenloses Erstgespräch" onChange={(e) => { set('title', e.target.value); if (isNew) set('slug', slugify(e.target.value)) }} />
              </Field>
              <Field label="Link" htmlFor="slug">
                <div className="flex items-center rounded-[10px] border border-line bg-sunken text-[15px] shadow-xs focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
                  <span className="hidden pl-3 text-muted sm:inline">{host.domain}/{host.handle}/</span>
                  <input id="slug" value={ev.slug} onChange={(e) => set('slug', slugify(e.target.value))} className="h-10 min-w-0 flex-1 rounded-r-[10px] bg-surface px-3 outline-none sm:rounded-l-none" />
                </div>
              </Field>
              <Field label="Dauer">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dauer">
                  {durations.map((d) => (
                    <button key={d} role="radio" aria-checked={ev.duration === d} onClick={() => set('duration', d)} className={cn('press h-9 rounded-lg border px-3.5 text-sm font-medium tabular', ev.duration === d ? 'border-accent bg-accent-soft text-accent-soft-fg' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')}>
                      {fmtDuration(d)}
                    </button>
                  ))}
                  <button className="press h-9 rounded-lg border border-dashed border-line-strong px-3.5 text-sm text-muted hover:text-fg">Andere …</button>
                </div>
              </Field>
              <Field label="Beschreibung" htmlFor="desc" hint="Steht auf der Buchungsseite. Kurz und konkret wirkt am besten.">
                <Textarea id="desc" value={ev.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Ort" description="Wo findet der Termin statt?" />
            <div className="mt-5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ort">
              {locationOptions.map((o) => (
                <button key={o.kind} role="radio" aria-checked={ev.location.kind === o.kind} onClick={() => set('location', { ...ev.location, kind: o.kind })} className={cn('press flex items-start gap-3 rounded-xl border p-4 text-left', ev.location.kind === o.kind ? 'border-accent bg-accent-soft/50 ring-1 ring-accent' : 'border-line hover:border-line-strong')}>
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', ev.location.kind === o.kind ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}>
                    <LocationIcon kind={o.kind} className="size-[18px]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{o.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{o.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4">
              {ev.location.kind === 'video-template' && (
                <Field label="Link-Vorlage" htmlFor="tpl" hint={<>Aus <code className="rounded bg-surface-2 px-1">{'{id}'}</code> wird pro Buchung ein eigener Raumname.</>}>
                  <Input id="tpl" defaultValue="https://kmeet.infomaniak.com/termind-{id}" className="font-mono text-[13px]" />
                </Field>
              )}
              {ev.location.kind === 'video' && (
                <Field label="Video-Link" htmlFor="vl"><Input id="vl" defaultValue={ev.location.detail} className="font-mono text-[13px]" /></Field>
              )}
              {ev.location.kind === 'onsite' && (
                <Field label="Adresse" htmlFor="addr"><Input id="addr" defaultValue="Musterstraße 12, 12345 Musterstadt" /></Field>
              )}
              {ev.location.kind === 'phone' && (
                <Field label="Wer ruft an?" htmlFor="ph">
                  <Select id="ph"><option>Ich rufe den Gast an (Telefonnummer wird abgefragt)</option><option>Der Gast ruft mich an</option></Select>
                </Field>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Zeiten & Regeln" description={<>Basiert auf deinem Plan <Link to="/admin/verfuegbarkeit" className="text-fg underline decoration-line-strong underline-offset-2">Standardzeiten</Link>.</>} />
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Mindestvorlauf" htmlFor="notice" hint="So kurzfristig kann frühestens gebucht werden.">
                <Select id="notice" value={ev.minNotice} onChange={(e) => set('minNotice', +e.target.value)}>
                  {[2, 4, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h < 24 ? `${h} Stunden` : `${h / 24} ${h === 24 ? 'Tag' : 'Tage'}`}</option>)}
                </Select>
              </Field>
              <Field label="Buchbar bis" htmlFor="win" hint="So weit im Voraus ist der Kalender offen.">
                <Select id="win" value={ev.windowDays} onChange={(e) => set('windowDays', +e.target.value)}>
                  {[14, 30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} Tage im Voraus</option>)}
                </Select>
              </Field>
              <Field label="Puffer davor" htmlFor="bb">
                <Select id="bb" value={ev.bufferBefore} onChange={(e) => set('bufferBefore', +e.target.value)}>
                  {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m ? `${m} Min.` : 'Kein Puffer'}</option>)}
                </Select>
              </Field>
              <Field label="Puffer danach" htmlFor="ba">
                <Select id="ba" value={ev.bufferAfter} onChange={(e) => set('bufferAfter', +e.target.value)}>
                  {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m ? `${m} Min.` : 'Kein Puffer'}</option>)}
                </Select>
              </Field>
              <Field label="Startzeiten im Raster von" htmlFor="step" className="sm:col-span-2">
                <Select id="step" value={ev.slotStep} onChange={(e) => set('slotStep', +e.target.value)}>
                  {[15, 30, 60].map((m) => <option key={m} value={m}>{m} Minuten (z. B. 9:00, 9:{m === 15 ? '15' : '30'} …)</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Buchungsformular" description="Name und E-Mail fragen wir immer ab." action={<Button size="sm"><Plus /> Feld</Button>} />
            <ul className="mt-5 flex flex-col gap-2">
              {[{ id: 'n', label: 'Name', type: 'text', required: true, fixed: true }, { id: 'm', label: 'E-Mail', type: 'text', required: true, fixed: true }, ...ev.fields.map((f) => ({ ...f, fixed: false }))].map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                  <GripVertical className={cn('size-4 text-subtle', f.fixed && 'opacity-30')} aria-hidden />
                  <span className="flex-1 text-sm font-medium">{f.label}</span>
                  <span className="text-[13px] text-muted">{({ text: 'Text', textarea: 'Langer Text', phone: 'Telefon', select: 'Auswahl', checkbox: 'Häkchen' } as Record<string, string>)[f.type]}</span>
                  <Badge tone={f.required ? 'accent' : 'neutral'}>{f.required ? 'Pflicht' : 'Optional'}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Bestätigung & Erinnerungen" />
            <div className="mt-5 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-6">
                <label htmlFor="conf" className="text-sm">
                  <span className="block font-medium">Buchungen erst nach meiner Bestätigung</span>
                  <span className="mt-0.5 block text-muted">Der Gast schickt eine Anfrage, du bestätigst oder lehnst mit einem Klick ab.</span>
                </label>
                <Switch id="conf" label="Bestätigung nötig" checked={ev.requiresConfirmation} onCheckedChange={(v) => set('requiresConfirmation', v)} />
              </div>
              <div className="h-px bg-line" />
              <div>
                <p className="text-sm font-medium">Erinnerung an den Gast</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[{ v: 10080, l: '1 Woche' }, { v: 1440, l: '24 Std.' }, { v: 120, l: '2 Std.' }, { v: 60, l: '1 Std.' }].map((r) => {
                    const on = ev.reminders.includes(r.v)
                    return (
                      <button key={r.v} aria-pressed={on} onClick={() => set('reminders', on ? ev.reminders.filter((x) => x !== r.v) : [...ev.reminders, r.v])} className={cn('press h-9 rounded-lg border px-3.5 text-sm font-medium', on ? 'border-accent bg-accent-soft text-accent-soft-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg')}>
                        {r.l} vorher
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6" >
            <div id="einbetten" className="scroll-mt-6" />
            <SectionHeader title="Auf deiner Webseite einbetten" description="Eine Zeile einfügen, fertig. Funktioniert mit WordPress, Webflow, Wix und jeder anderen Seite." />
            <pre className="mt-5 overflow-x-auto rounded-xl bg-sunken p-4 font-mono text-[12.5px] leading-relaxed text-fg ring-1 ring-line ring-inset">{`<script src="https://${host.domain}/embed.js" defer></script>
<div data-termind="${host.handle}/${ev.slug || 'link'}" data-mode="inline"></div>`}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton value="snippet" label="Code kopieren" />
              <Link to="/embed-demo" target="_blank" className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg">Vorschau ansehen <ExternalLink className="size-3.5" /></Link>
            </div>
          </Card>
        </div>

        {/* Vorschau */}
        <aside className="hidden xl:block">
          <div className="sticky top-10">
            <p className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">Vorschau</p>
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <span className="block h-1 w-10 rounded-full" style={{ background: `oklch(0.7 0.11 ${ev.color})` }} />
              <p className="mt-4 font-display text-[20px] leading-snug text-balance">{ev.title || 'Titel deiner Terminseite'}</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                <li className="flex items-center gap-2"><Clock className="size-4" /> {fmtDuration(ev.duration)}</li>
                <li className="flex items-center gap-2"><LocationIcon kind={ev.location.kind} className="size-4" /> {locationOptions.find((l) => l.kind === ev.location.kind)?.title}</li>
              </ul>
              <p className="mt-4 line-clamp-4 text-sm text-muted">{ev.description || 'Beschreibung …'}</p>
              <div className="mt-5 grid grid-cols-7 gap-1">
                {Array.from({ length: 21 }).map((_, i) => (
                  <span key={i} className={cn('aspect-square rounded-md', [1, 2, 3, 4, 8, 9, 10, 11, 15, 16, 17, 18].includes(i) ? 'bg-accent-soft' : 'bg-surface-2')} />
                ))}
              </div>
              <div className="mt-4 h-10 rounded-[10px] bg-accent" />
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
