import { AlertTriangle, Bot, Check, ExternalLink, Mail, RotateCcw, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LocationIcon } from '../components/LocationIcon'
import { bookings as initial, endTime, eventTypes, fmt, TODAY, type Booking } from '../data/mock'
import { cn } from '../lib/cn'
import { Avatar, Badge, Button, Dialog, Field, Input, Segmented, Sheet, Textarea, toast } from '../ui'
import { PageHeader } from './AdminShell'

type Tab = 'upcoming' | 'requests' | 'past'

export function Termine() {
  const [list, setList] = useState<Booking[]>(initial)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Booking | null>(null)
  const [cancel, setCancel] = useState<Booking | null>(null)

  const requests = list.filter((b) => b.status === 'pending')
  const filtered = useMemo(() => {
    const now = TODAY.toISOString().slice(0, 16)
    return list
      .filter((b) => (tab === 'requests' ? b.status === 'pending' : tab === 'upcoming' ? b.start >= now && b.status !== 'cancelled' : b.start < now))
      .filter((b) => !q || (b.name + b.email).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (tab === 'past' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)))
  }, [list, tab, q])

  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>()
    filtered.forEach((b) => m.set(b.start.slice(0, 10), [...(m.get(b.start.slice(0, 10)) ?? []), b]))
    return [...m.entries()]
  }, [filtered])

  const setStatus = (id: string, status: Booking['status']) => setList((l) => l.map((b) => (b.id === id ? { ...b, status } : b)))

  return (
    <>
      <PageHeader title="Termine" description="Alles, was ansteht, und alles, was auf deine Antwort wartet." />

      <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4 text-warn-fg">
        <AlertTriangle className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        <div className="min-w-[220px] flex-1 text-sm">
          <p className="font-semibold">Dein Kalender „Nextcloud“ ist seit 2 Stunden nicht erreichbar.</p>
          <p className="mt-0.5 opacity-90">Belegte Zeiten aus diesem Kalender fehlen gerade auf deinen Buchungsseiten. Meist hilft ein neues App-Passwort.</p>
        </div>
        <Button size="sm" variant="secondary" className="ml-[30px] sm:ml-0" onClick={() => toast("Verbindung wird geprüft …")}>
          Jetzt reparieren
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: 'Bevorstehend' },
            { value: 'requests', label: <>Anfragen {requests.length > 0 && <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-accent-fg tabular">{requests.length}</span>}</> },
            { value: 'past', label: 'Vergangen' },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label="Termine durchsuchen" placeholder="Name oder E-Mail" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="enter flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <Check className="size-6 text-accent" aria-hidden />
          <p className="mt-3 font-medium">{tab === 'requests' ? 'Keine offenen Anfragen' : 'Hier ist nichts'}</p>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">{tab === 'requests' ? 'Alle Anfragen sind beantwortet. Neue landen hier und per Mail bei dir.' : 'Teile deinen Buchungslink, dann füllt sich die Liste.'}</p>
        </div>
      ) : (
        <div key={tab} className="enter-stagger flex flex-col gap-8">
          {groups.map(([day, items]) => {
            const d = new Date(day + 'T12:00')
            return (
              <section key={day}>
                <h2 className="mb-3 flex items-baseline gap-2 text-sm">
                  <span className="font-semibold capitalize">{fmt.weekdayLong.format(d)}, {fmt.dayMonth.format(d)}</span>
                  <span className="text-subtle">{relative(d)}</span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {items.map((b) => (
                    <BookingRow key={b.id} b={b} onOpen={() => setOpen(b)} onAccept={() => { setStatus(b.id, 'confirmed'); toast(`Bestätigt, Mail an ${b.name.split(' ')[0]} ist raus`) }} onDecline={() => setCancel(b)} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <BookingSheet b={open} onClose={() => setOpen(null)} onCancel={(b) => { setOpen(null); setCancel(b) }} />
      <CancelDialog b={cancel} onClose={() => setCancel(null)} onConfirm={(b) => { setStatus(b.id, 'cancelled'); setCancel(null); toast('Abgesagt, Mail ist raus') }} />
    </>
  )
}

function relative(d: Date) {
  const days = Math.round((d.getTime() - TODAY.getTime()) / 864e5)
  if (days === 0) return 'heute'
  if (days === 1) return 'morgen'
  if (days > 1) return `in ${days} Tagen`
  if (days === -1) return 'gestern'
  return `vor ${-days} Tagen`
}

function BookingRow({ b, onOpen, onAccept, onDecline }: { b: Booking; onOpen: () => void; onAccept: () => void; onDecline: () => void }) {
  const ev = eventTypes.find((e) => e.id === b.eventId)!
  const time = b.start.slice(11)
  return (
    <li className={cn('hover-lift group relative flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface py-4 pr-4 pl-5 shadow-xs transition-[border-color,box-shadow] duration-150', b.status === 'cancelled' && 'opacity-60')}>
      <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: `oklch(0.7 0.11 ${ev.color})` }} aria-hidden />
      <div className="w-[88px] shrink-0 tabular">
        <p className="text-[17px] font-semibold">{time}</p>
        <p className="text-[13px] text-muted">bis {endTime(time, ev.duration)}</p>
      </div>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
        <p className="truncate font-semibold">{ev.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{b.name}</span>
          <span className="inline-flex items-center gap-1.5">
            <LocationIcon kind={ev.location.kind} className="size-3.5" /> {ev.location.label}
          </span>
        </p>
      </button>
      <div className="relative z-10 flex flex-wrap items-center gap-2">
        {b.createdVia === 'ki' && (
          <Badge tone="neutral">
            <Bot className="size-3.5" /> über KI
          </Badge>
        )}
        {b.status === 'cancelled' && <Badge tone="danger">Abgesagt</Badge>}
        {b.status === 'pending' ? (
          <>
            <Button size="sm" variant="ghost" onClick={onDecline}>
              Ablehnen
            </Button>
            <Button size="sm" variant="primary" onClick={onAccept}>
              <Check /> Bestätigen
            </Button>
          </>
        ) : null}
      </div>
    </li>
  )
}

function BookingSheet({ b, onClose, onCancel }: { b: Booking | null; onClose: () => void; onCancel: (b: Booking) => void }) {
  const ev = b && eventTypes.find((e) => e.id === b.eventId)
  return (
    <Sheet
      open={!!b}
      onOpenChange={(o) => !o && onClose()}
      title="Termin"
      footer={
        b && b.status !== 'cancelled' ? (
          <>
            <Button onClick={() => toast('Verschiebe-Link an Gast gesendet')}>
              <RotateCcw /> Verschieben
            </Button>
            <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onCancel(b)}>
              <X /> Absagen
            </Button>
          </>
        ) : undefined
      }
    >
      {b && ev && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm text-muted capitalize">{fmt.full.format(new Date(b.start))}</p>
            <p className="mt-1 text-2xl font-semibold tabular">
              {b.start.slice(11)} – {endTime(b.start.slice(11), ev.duration)}
            </p>
            <p className="mt-1 font-medium">{ev.title}</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <Avatar name={b.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{b.name}</p>
              <a href={`mailto:${b.email}`} className="truncate text-sm text-muted hover:text-fg">
                {b.email}
              </a>
            </div>
            <Button variant="ghost" size="icon" aria-label="E-Mail schreiben">
              <Mail />
            </Button>
          </div>
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted">Ort</dt>
            <dd className="flex items-center gap-1.5">
              <LocationIcon kind={ev.location.kind} className="size-3.5" /> {ev.location.label}
              {ev.location.kind !== 'onsite' && ev.location.kind !== 'phone' && (
                <a className="ml-1 inline-flex items-center gap-1 text-accent hover:underline" href="#">
                  beitreten <ExternalLink className="size-3" />
                </a>
              )}
            </dd>
            <dt className="text-muted">Status</dt>
            <dd>{b.status === 'pending' ? <Badge tone="warn">Wartet auf dich</Badge> : b.status === 'cancelled' ? <Badge tone="danger">Abgesagt</Badge> : <Badge tone="accent">Bestätigt</Badge>}</dd>
            <dt className="text-muted">Gebucht über</dt>
            <dd>{b.createdVia === 'ki' ? 'KI-Assistent' : 'Buchungsseite'}</dd>
            {b.answers.map((a) => (
              <div key={a.label} className="contents">
                <dt className="text-muted">{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
          <Field label="Interne Notiz" hint="Sieht nur ihr im Team.">
            <Textarea placeholder="z. B. Vorbereitung, Kontext …" />
          </Field>
        </div>
      )}
    </Sheet>
  )
}

function CancelDialog({ b, onClose, onConfirm }: { b: Booking | null; onClose: () => void; onConfirm: (b: Booking) => void }) {
  const [reason, setReason] = useState('')
  const ev = b && eventTypes.find((e) => e.id === b.eventId)
  const decline = b?.status === 'pending'
  return (
    <Dialog
      open={!!b}
      onOpenChange={(o) => !o && onClose()}
      title={decline ? 'Anfrage ablehnen?' : 'Termin absagen?'}
      description={b ? `${b.name} bekommt diese Mail:` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Behalten
          </Button>
          <Button variant="danger" onClick={() => b && onConfirm(b)}>
            {decline ? 'Ablehnen & Mail senden' : 'Absagen & Mail senden'}
          </Button>
        </>
      }
    >
      {b && ev && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface-2/60 p-4 text-sm leading-relaxed">
            <p className="text-xs text-muted">Betreff: {decline ? 'Deine Anfrage' : 'Abgesagt'}: {ev.title}</p>
            <p className="mt-3">Hallo {b.name.split(' ')[0]},</p>
            <p className="mt-2">
              leider muss ich unseren Termin am <span className="font-medium">{fmt.dayMonth.format(new Date(b.start))} um {b.start.slice(11)} Uhr</span> absagen.
              {reason && <> {reason}</>}
            </p>
            <p className="mt-2">Über diesen Link kannst du direkt einen neuen Termin wählen.</p>
          </div>
          <Field label="Persönliche Nachricht (optional)" htmlFor="reason">
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Mir ist etwas dazwischengekommen." className="min-h-20" />
          </Field>
          <p className="text-[13px] text-muted">
            Den Text dieser Mail kannst du unter{' '}
            <Link to="/admin/einstellungen/email" className="text-fg underline decoration-line-strong underline-offset-2">
              Einstellungen → E-Mail
            </Link>{' '}
            anpassen.
          </p>
        </div>
      )}
    </Dialog>
  )
}
