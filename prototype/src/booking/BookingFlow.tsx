import { ArrowLeft, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Globe, Mail, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LocationIcon } from '../components/LocationIcon'
import { endTime, fmt, fmtDuration, host, iso, slotsFor, TODAY, type EventType } from '../data/mock'
import { cn } from '../lib/cn'
import { Avatar, Button, Field, Input, Segmented, Select, Textarea } from '../ui'

type Step = 'pick' | 'form' | 'done'

export function BookingFlow({ ev, embedded = false }: { ev: EventType; embedded?: boolean }) {
  const [step, setStep] = useState<Step>('pick')
  const [month, setMonth] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
  const [day, setDay] = useState<Date | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [hour12, setHour12] = useState<'24' | '12'>('24')
  const [form, setForm] = useState({ name: '', email: '' })

  const slots = useMemo(() => (day ? slotsFor(day, ev) : []), [day, ev])

  return (
    <div
      className={cn(
        'mx-auto w-full overflow-hidden bg-surface',
        embedded ? 'rounded-xl' : 'max-w-[1080px] rounded-3xl border border-line shadow-card',
      )}
    >
      <div className={cn('grid', step === 'pick' ? 'lg:grid-cols-[300px_1fr_260px]' : 'lg:grid-cols-[300px_1fr]')}>
        <EventInfo ev={ev} day={step !== 'pick' ? day : null} time={step !== 'pick' ? time : null} onBack={step === 'form' ? () => setStep('pick') : undefined} done={step === 'done'} />

        {step === 'pick' && (
          <>
            <section aria-label="Datum wählen" className="border-line p-5 sm:p-7 lg:border-l">
              <h2 className="text-[17px] font-semibold">Wähle einen Tag</h2>
              <Calendar month={month} setMonth={setMonth} selected={day} ev={ev} onSelect={(d) => { setDay(d); setTime(null) }} />
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-muted">
                  <Globe className="size-4" aria-hidden />
                  <span className="sr-only">Zeitzone</span>
                  <Select defaultValue="Europe/Berlin" className="h-9 w-[170px] border-transparent bg-transparent px-1 text-sm text-muted shadow-none hover:border-line">
                    <option value="Europe/Berlin">Berlin (MEZ)</option>
                    <option value="Europe/London">London (GMT)</option>
                    <option value="America/New_York">New York (ET)</option>
                  </Select>
                </label>
                <Segmented size="sm" value={hour12} onChange={setHour12} options={[{ value: '24', label: '24 h' }, { value: '12', label: '12 h' }]} />
              </div>
            </section>

            <section aria-label="Uhrzeit wählen" className="border-t border-line p-5 sm:p-7 lg:border-t-0 lg:border-l">
              {day ? (
                <div key={iso(day)} className="enter">
                  <h2 className="text-[15px] font-semibold">
                    {fmt.weekdayLong.format(day)}, <span className="font-normal text-muted">{fmt.dayMonth.format(day)}</span>
                  </h2>
                  {slots.length === 0 ? (
                    <p className="mt-4 text-sm text-muted">An diesem Tag ist leider nichts mehr frei.</p>
                  ) : (
                    <ul className="mt-4 flex max-h-[400px] flex-col gap-2 overflow-auto pr-1 pb-1">
                      {slots.map((s) => (
                        <li key={s}>
                          <SlotButton
                            label={hour12 === '12' ? to12(s) : s}
                            selected={time === s}
                            onSelect={() => setTime(s)}
                            onConfirm={() => setStep('form')}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
                  <Clock className="size-5 text-subtle" aria-hidden />
                  <p className="max-w-[18ch] text-sm text-muted">Wähle links einen Tag, dann siehst du die freien Zeiten.</p>
                </div>
              )}
            </section>
          </>
        )}

        {step === 'form' && day && time && (
          <section className="enter border-t border-line p-5 sm:p-7 lg:border-t-0 lg:border-l">
            <h2 className="text-[17px] font-semibold">Deine Angaben</h2>
            <form
              className="mt-5 flex max-w-[460px] flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                setStep('done')
              }}
            >
              <Field label="Name" htmlFor="name">
                <Input id="name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="E-Mail" htmlFor="email" hint="Hierhin schicken wir die Bestätigung mit Kalendereintrag.">
                <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              {ev.fields.map((f) => (
                <Field key={f.id} label={f.label + (f.required ? '' : ' (optional)')} htmlFor={f.id}>
                  {f.type === 'textarea' ? (
                    <Textarea id={f.id} required={f.required} />
                  ) : f.type === 'select' ? (
                    <Select id={f.id} required={f.required} defaultValue="">
                      <option value="" disabled>
                        Bitte wählen
                      </option>
                      {f.options?.map((o) => <option key={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input id={f.id} type={f.type === 'phone' ? 'tel' : 'text'} required={f.required} />
                  )}
                </Field>
              ))}
              <label className="mt-1 flex items-start gap-3 text-sm text-muted">
                <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
                <span>
                  Ich habe die <a className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg" href="#datenschutz">Datenschutzhinweise</a> gelesen und bin mit der Verarbeitung meiner Angaben zur Terminvereinbarung einverstanden.
                </span>
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" size="lg">
                  {ev.requiresConfirmation ? 'Anfrage senden' : 'Termin buchen'}
                </Button>
                {ev.requiresConfirmation && <p className="text-[13px] text-muted">Lena bestätigt deine Anfrage per Mail.</p>}
              </div>
            </form>
          </section>
        )}

        {step === 'done' && day && time && (
          <Confirmation ev={ev} day={day} time={time} email={form.email || 'deine@mail.de'} name={form.name} onRestart={() => { setStep('pick'); setTime(null) }} />
        )}
      </div>
    </div>
  )
}

function to12(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/* -------- linke Spalte -------- */
function EventInfo({ ev, day, time, onBack, done }: { ev: EventType; day: Date | null; time: string | null; onBack?: () => void; done?: boolean }) {
  return (
    <aside className="flex flex-col gap-5 p-5 sm:p-7">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 self-start">
          <ArrowLeft /> Zurück
        </Button>
      )}
      <div className="flex items-center gap-3">
        <Avatar name={host.name} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{host.name}</p>
          <p className="truncate text-[13px] text-muted">{host.role}</p>
        </div>
      </div>
      <div>
        <h1 className="font-display text-[24px] leading-[1.2] text-balance">{ev.title}</h1>
      </div>
      <ul className="flex flex-col gap-2.5 text-sm text-muted">
        <li className="flex items-center gap-2.5">
          <Clock className="size-4 shrink-0" aria-hidden /> {fmtDuration(ev.duration)}
        </li>
        <li className="flex items-center gap-2.5">
          <LocationIcon kind={ev.location.kind} className="size-4 shrink-0" />
          {ev.location.kind === 'onsite' ? ev.location.detail : ev.location.kind === 'phone' ? ev.location.detail : `${ev.location.label}, Link kommt per Mail`}
        </li>
        {day && time && (
          <li className="enter flex items-start gap-2.5 font-medium text-fg">
            <CalendarPlus className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              {fmt.full.format(day)}
              <br />
              <span className="tabular">
                {time} – {endTime(time, ev.duration)} Uhr
              </span>
            </span>
          </li>
        )}
      </ul>
      {!done && <p className="text-sm leading-relaxed text-muted">{ev.description}</p>}
    </aside>
  )
}

/* -------- Kalender -------- */
function Calendar({ month, setMonth, selected, onSelect, ev }: { month: Date; setMonth: (d: Date) => void; selected: Date | null; onSelect: (d: Date) => void; ev: EventType }) {
  const first = new Date(month)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  const canPrev = month > new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium capitalize" aria-live="polite">
          {fmt.monthYear.format(month)}
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Vorheriger Monat" disabled={!canPrev} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Nächster Monat" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <div key={d} className="pb-2 text-xs font-medium tracking-wide text-subtle uppercase">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={'e' + i} />
          const available = slotsFor(d, ev).length > 0
          const isSel = selected && iso(selected) === iso(d)
          const isToday = iso(d) === iso(TODAY)
          return (
            <button
              key={iso(d)}
              disabled={!available}
              onClick={() => onSelect(d)}
              aria-pressed={!!isSel}
              aria-label={`${fmt.full.format(d)}${available ? '' : ', nicht verfügbar'}`}
              className={cn(
                'press relative mx-auto flex aspect-square w-full max-w-12 items-center justify-center rounded-xl text-[15px] tabular',
                available ? 'bg-accent-soft font-semibold text-accent-soft-fg hover:brightness-[0.97] dark:hover:brightness-110' : 'text-subtle/70 cursor-default',
                isSel && 'bg-accent text-accent-fg hover:brightness-100',
              )}
            >
              {d.getDate()}
              {isToday && <span className={cn('absolute bottom-1.5 size-1 rounded-full', isSel ? 'bg-accent-fg' : 'bg-fg/60')} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -------- Slot: Klick wählt, zweiter Button bestätigt -------- */
function SlotButton({ label, selected, onSelect, onConfirm }: { label: string; selected: boolean; onSelect: () => void; onConfirm: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <button
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'press h-11 rounded-[10px] border text-[15px] font-semibold tabular',
          selected ? 'col-span-1 border-fg/80 bg-fg/[0.03] text-fg' : 'col-span-2 border-accent/35 text-accent hover:border-accent hover:bg-accent-soft/50',
        )}
      >
        {label}
      </button>
      {selected && (
        <Button variant="primary" onClick={onConfirm} className="enter h-11 px-5" autoFocus>
          Weiter
        </Button>
      )}
    </div>
  )
}

/* -------- Bestätigung -------- */
function Confirmation({ ev, day, time, email, name, onRestart }: { ev: EventType; day: Date; time: string; email: string; name: string; onRestart: () => void }) {
  const pending = ev.requiresConfirmation
  return (
    <section className="border-t border-line p-6 sm:p-10 lg:border-t-0 lg:border-l">
      <div className="enter mx-auto flex max-w-[440px] flex-col items-center text-center">
        <span className="check-pop flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          {pending ? <Mail className="size-6" /> : <Check className="size-7" strokeWidth={2.5} />}
        </span>
        <h2 className="mt-5 font-display text-[28px] leading-tight">{pending ? 'Anfrage ist raus' : 'Termin steht'}</h2>
        <p className="mt-2 text-[15px] text-muted text-pretty">
          {pending ? (
            <>Lena prüft deine Anfrage und bestätigt sie per Mail an <span className="font-medium text-fg">{email}</span>.</>
          ) : (
            <>{name ? `Danke, ${name.split(' ')[0]}! ` : ''}Die Bestätigung mit Kalendereintrag ist unterwegs an <span className="font-medium text-fg">{email}</span>.</>
          )}
        </p>

        <div className="mt-7 w-full rounded-2xl border border-line bg-surface-2/50 p-5 text-left">
          <p className="font-medium">{ev.title}</p>
          <p className="mt-1 text-sm text-muted tabular">
            {fmt.full.format(day)}, {time} – {endTime(time, ev.duration)} Uhr
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <LocationIcon kind={ev.location.kind} className="size-3.5" /> {ev.location.label}
          </p>
        </div>

        {!pending && (
          <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
            <Button size="sm"><CalendarPlus /> Apple / Outlook (.ics)</Button>
            <Button size="sm">Google Kalender</Button>
          </div>
        )}

        <div className="mt-8 flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" onClick={onRestart}><RotateCcw /> Verschieben</Button>
          <span className="text-line-strong" aria-hidden>·</span>
          <Button variant="ghost" size="sm"><X /> Absagen</Button>
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-subtle">
          <ShieldCheck className="size-3.5" /> Keine Tracker, keine Cookies, Daten bleiben auf Lenas Server.
        </p>
      </div>
    </section>
  )
}
