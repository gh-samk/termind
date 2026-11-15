import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SlotPicker } from '../components/SlotPicker'
import { useAuth } from '../auth/useAuth'
import { api, ApiError, errorMessage } from '../lib/api'
import { fmtDateLong, fmtDuration, fmtTime, isoDateIn } from '../lib/format'
import { Button, Dialog, Field, Input, Select, Switch, Textarea, toast } from '../ui'
import { ErrorBox } from './AdminShell'
import type { Booking, EventType } from './types'
import { localTimeExists, zonedToIso } from './zeit'

const fmtWhen = (iso: string, tz: string) => `${fmtDateLong(iso, tz)}, ${fmtTime(iso, tz)} Uhr`

/** Zeit wählen: freie Zeiten wie für Gäste, oder „Andere Zeit eingeben“ (auch außerhalb der Verfügbarkeit). */
function TimeChoice({ slotsUrl, tz, current, busy, confirmLabel, onPick }: { slotsUrl: string; tz: string; current?: string; busy?: boolean; confirmLabel: string; onPick: (iso: string, anyTime: boolean) => void }) {
  const [free, setFree] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const today = isoDateIn(new Date(), tz)
  const iso = date && time ? zonedToIso(date, time, tz) : ''
  const inPast = !!iso && Date.parse(iso) < Date.now()
  const missing = !!iso && !localTimeExists(date, time, tz)
  const timeError = inPast ? 'Diese Zeit liegt in der Vergangenheit.' : missing ? `Diese Uhrzeit gibt es am ${fmtDateLong(`${date}T12:00:00Z`, 'UTC')} wegen der Zeitumstellung nicht.` : undefined
  return (
    <div>
      {free ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (iso && !inPast && !missing) onPick(iso, true)
          }}
        >
          <p className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm text-muted">Hier kannst du jede Zeit wählen, auch außerhalb deiner Verfügbarkeit. Nur mit anderen Terminen darf sie sich nicht überschneiden. Alle Zeiten gelten in {tz}.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum" htmlFor="free-date" required><Input id="free-date" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Uhrzeit" htmlFor="free-time" required error={timeError}><Input id="free-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setFree(false)}><ArrowLeft /> Freie Zeiten anzeigen</Button>
            <Button type="submit" variant="primary" disabled={!iso || inPast || missing || busy}>{confirmLabel}</Button>
          </div>
        </form>
      ) : (
        <>
          <div className="-mx-6 -mt-2 overflow-hidden rounded-xl border-y border-line sm:mx-0 sm:border">
            <SlotPicker slotsUrl={slotsUrl} initialTz={tz} current={current} busy={busy} confirmLabel={confirmLabel} onPick={(i) => onPick(i, false)} />
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setFree(true)}>Andere Zeit eingeben</Button>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- Verschieben ---------------- */

export function RescheduleDialog({ b, onClose }: { b: Booking; onClose: () => void }) {
  const me = useAuth().data!.user!
  const tz = me.timezone
  const qc = useQueryClient()
  const [pick, setPick] = useState<{ iso: string; anyTime: boolean } | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pickerKey, setPickerKey] = useState(0)
  const first = b.guestName.split(' ')[0]
  const move = useMutation({
    mutationFn: () => api(`/api/bookings/${b.id}/reschedule`, { body: { start: pick!.iso, reason: message.trim() || undefined, anyTime: pick!.anyTime || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['booking', b.id] })
      qc.invalidateQueries({ queryKey: ['slots'] })
      toast(`Verschoben, Mail an ${first} ist raus`)
      onClose()
    },
    onError: (e) => {
      // Zwischenzeitlich vergeben: zurück zur Auswahl, mit verständlicher Erklärung
      if (e instanceof ApiError && e.code === 'slot_taken') {
        setNotice('Diese Zeit ist inzwischen belegt. Bitte wähle eine andere.')
        setPick(null)
        setPickerKey((k) => k + 1)
        qc.invalidateQueries({ queryKey: ['slots'] })
      } else toast.error(errorMessage(e))
    },
  })
  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={pick ? 'Termin verschieben?' : 'Termin verschieben'}
      description={pick ? undefined : `${b.guestName} · bisher ${fmtWhen(b.startsAt, tz)}`}
      footer={
        pick ? (
          <>
            <Button variant="ghost" onClick={() => setPick(null)} disabled={move.isPending}>Zurück</Button>
            <Button variant="primary" disabled={move.isPending} onClick={() => move.mutate()}>{move.isPending ? 'Verschiebt …' : 'Verschieben & Mail senden'}</Button>
          </>
        ) : undefined
      }
    >
      {pick ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface-2/60 p-4 text-sm">
            <p>Von <span className="font-medium tabular">{fmtWhen(b.startsAt, tz)}</span></p>
            <p className="mt-1">auf <span className="font-medium tabular">{fmtWhen(pick.iso, tz)}</span> verschieben?</p>
            {pick.anyTime && <p className="mt-2 text-[13px] text-muted">Eigene Zeit, unabhängig von deiner Verfügbarkeit.</p>}
          </div>
          <Field label="Nachricht an den Gast (optional)" htmlFor="resched-msg" hint={`${first} bekommt eine Mail mit der neuen Zeit und einem aktualisierten Kalendereintrag. Deine Nachricht steht darin.`}>
            <Textarea id="resched-msg" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="z. B. Mir ist etwas dazwischengekommen, ich hoffe, die neue Zeit passt." className="min-h-20" />
          </Field>
          <ErrorBox error={move.error && !(move.error instanceof ApiError && move.error.code === 'slot_taken') ? move.error : null} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {notice && <p role="alert" className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn-fg">{notice}</p>}
          <TimeChoice key={pickerKey} slotsUrl={`/api/bookings/${b.id}/slots`} tz={tz} current={b.startsAt} confirmLabel="Weiter" onPick={(iso, anyTime) => { setNotice(null); setPick({ iso, anyTime }) }} />
        </div>
      )}
    </Dialog>
  )
}

/* ---------------- Termin eintragen ---------------- */

export function AddBookingDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const me = useAuth().data!.user!
  const tz = me.timezone
  const qc = useQueryClient()
  const events = useQuery({ queryKey: ['event-types'], queryFn: () => api<EventType[]>('/api/event-types') })
  const list = events.data ?? []
  const [eventId, setEventId] = useState('')
  const [pick, setPick] = useState<{ iso: string; anyTime: boolean } | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [notify, setNotify] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const nameError = tried && !name.trim() ? 'Bitte gib den Namen des Gasts ein.' : undefined
  const emailError = tried && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.' : undefined
  const ev = list.find((e) => e.id === (eventId || list[0]?.id))
  const create = useMutation({
    mutationFn: () =>
      api<Booking>('/api/bookings', {
        body: { eventTypeId: ev!.id, start: pick!.iso, timezone: tz, name: name.trim(), email: email.trim(), note: note.trim() || undefined, notifyGuest: notify, anyTime: pick!.anyTime || undefined },
      }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['slots'] })
      toast(notify ? `Eingetragen, Mail an ${name.trim().split(' ')[0]} ist raus` : 'Eingetragen, der Gast bekommt keine Mail')
      onCreated(b.id)
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'slot_taken') {
        setNotice('Diese Zeit ist inzwischen belegt. Bitte wähle eine andere.')
        setPick(null)
        qc.invalidateQueries({ queryKey: ['slots'] })
      } else toast.error(errorMessage(e))
    },
  })

  let body: ReactNode
  if (events.isLoading) body = <p className="text-sm text-muted">Lädt …</p>
  else if (!ev) {
    body = (
      <p className="text-sm text-muted">
        Du hast noch keine Terminseite. <Link to="/admin/terminseiten/neu" onClick={onClose} className="font-medium text-fg underline underline-offset-2">Lege zuerst eine an</Link>, dann kannst du hier Termine eintragen.
      </p>
    )
  } else if (!pick) {
    body = (
      <div className="flex flex-col gap-4">
        <Field label="Terminseite" htmlFor="add-event" required hint="Bestimmt Dauer und Ort des Termins.">
          <Select id="add-event" value={ev.id} onChange={(e) => { setEventId(e.target.value); setNotice(null) }}>
            {list.map((e) => <option key={e.id} value={e.id}>{e.title} ({fmtDuration(e.duration)}){e.active ? '' : ' – pausiert'}</option>)}
          </Select>
        </Field>
        {notice && <p role="alert" className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn-fg">{notice}</p>}
        <TimeChoice key={ev.id} slotsUrl={`/api/event-types/${ev.id}/slots`} tz={tz} confirmLabel="Weiter" onPick={(iso, anyTime) => { setNotice(null); setPick({ iso, anyTime }) }} />
      </div>
    )
  } else {
    body = (
      <form
        id="add-booking-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (!name.trim()) return document.getElementById('add-name')?.focus()
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return document.getElementById('add-email')?.focus()
          create.mutate()
        }}
      >
        <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2/60 p-4 text-sm">
          <div>
            <p className="font-medium">{ev.title} · {fmtDuration(ev.duration)}</p>
            <p className="mt-0.5 text-muted tabular">{fmtWhen(pick.iso, tz)}</p>
            {pick.anyTime && <p className="mt-1 text-[13px] text-muted">Eigene Zeit, unabhängig von deiner Verfügbarkeit.</p>}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPick(null)}>Ändern</Button>
        </div>
        <Field label="Name des Gasts" htmlFor="add-name" required error={nameError}><Input id="add-name" maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-Mail des Gasts" htmlFor="add-email" required error={emailError} hint="Für Bestätigung, Erinnerungen und den Link zum Verschieben."><Input id="add-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Interne Notiz (optional)" htmlFor="add-note" hint="Sieht nur dein Team."><Textarea id="add-note" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" /></Field>
        <div className="flex items-start justify-between gap-6 border-t border-line pt-4">
          <label htmlFor="add-notify" className="text-sm">
            <span className="block font-medium">Gast per Mail benachrichtigen</span>
            <span className="mt-0.5 block text-muted">{notify ? 'Der Gast bekommt eine Bestätigung mit Kalendereintrag und später Erinnerungen.' : 'Der Gast erfährt nichts von dem Termin, auch keine Erinnerungen.'}</span>
          </label>
          <Switch id="add-notify" label="Gast per Mail benachrichtigen" checked={notify} onCheckedChange={setNotify} />
        </div>
        <ErrorBox error={create.error && !(create.error instanceof ApiError && create.error.code === 'slot_taken') ? create.error : null} />
      </form>
    )
  }

  return (
    <Dialog
      open
      wide={!pick}
      onOpenChange={(o) => !o && onClose()}
      title="Termin eintragen"
      description={pick ? undefined : 'Für Termine, die du selbst vereinbart hast, z. B. am Telefon.'}
      footer={pick && ev ? <><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button type="submit" form="add-booking-form" variant="primary" disabled={create.isPending}>{create.isPending ? 'Trägt ein …' : notify ? 'Eintragen & Mail senden' : 'Eintragen'}</Button></> : undefined}
    >
      {body}
    </Dialog>
  )
}
