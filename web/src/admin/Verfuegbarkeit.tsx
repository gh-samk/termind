import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarOff, Copy, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DAY_KEYS, type DayKey, type WeeklyHours } from '@shared/types'
import { TimezonePicker } from '../components/TimezonePicker'
import { useAuth, useRefreshAuth } from '../auth/useAuth'
import { api, errorMessage } from '../lib/api'
import { isoDateIn } from '../lib/format'
import { cn } from '../lib/cn'
import { Badge, Button, Card, Dialog, Field, Input, SectionHeader, Segmented, Select, Switch, toast } from '../ui'
import { ErrorBox, PageHeader } from './AdminShell'
import { CalendarStatusCard } from './Kalender'
import type { Schedule } from './types'

const dayNames: Record<DayKey, string> = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' }
const times = [...Array.from({ length: 4 * 24 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`), '24:00']
export function Verfuegbarkeit() {
  const qc = useQueryClient()
  const me = useAuth().data!.user!
  const refreshAuth = useRefreshAuth()
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: () => api<{ steps: { id: string; done: boolean }[] }>('/api/onboarding'), enabled: me.role === 'owner' })
  // Solange die Zeiten noch nie gespeichert wurden, darf man sie auch unverändert bestätigen („Erste Schritte“)
  const needsConfirm = !!onboarding.data && !onboarding.data.steps.find((x) => x.id === 'availability')?.done
  const q = useQuery({ queryKey: ['schedule'], queryFn: () => api<Schedule>('/api/schedule') })
  const [week, setWeek] = useState<WeeklyHours | null>(null)
  const [tz, setTz] = useState('')
  const [add, setAdd] = useState(false)
  useEffect(() => {
    if (q.data) {
      setWeek(q.data.weekly)
      setTz(q.data.timezone)
    }
  }, [q.data])

  const dirty = q.data && week && (JSON.stringify(week) !== JSON.stringify(q.data.weekly) || tz !== q.data.timezone)
  const save = useMutation({
    mutationFn: () => api<Schedule>('/api/schedule', { method: 'PATCH', body: { weekly: week, timezone: tz } }),
    onSuccess: (s) => {
      qc.setQueryData(['schedule'], s)
      qc.invalidateQueries({ queryKey: ['slots'] })
      qc.invalidateQueries({ queryKey: ['onboarding'] })
      // Die Zeitzone gilt für alles: das Profil zieht mit
      if (s.timezone !== me.timezone) refreshAuth()
      toast('Gespeichert')
    },
  })
  const restoreEx = useMutation({
    mutationFn: (x: Schedule['exceptions'][number]) => api('/api/schedule/exceptions', { body: { title: x.title, fromDate: x.fromDate, toDate: x.toDate, kind: x.kind, hours: x.kind === 'hours' ? (x.hours ?? undefined) : undefined } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); qc.invalidateQueries({ queryKey: ['slots'] }) },
    onError: (e) => toast.error(`Wiederherstellen hat nicht geklappt: ${errorMessage(e)}`),
  })
  const delEx = useMutation({
    mutationFn: (x: Schedule['exceptions'][number]) => api(`/api/schedule/exceptions/${x.id}`, { method: 'DELETE' }),
    onSuccess: (_r, x) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['slots'] })
      toast(`Ausnahme „${x.title}“ gelöscht`, { action: { label: 'Rückgängig', onClick: () => restoreEx.mutate(x) } })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (!week || !q.data) return <ErrorBox error={q.error} />
  const badDays = DAY_KEYS.filter((d) => week[d].some(([a, b]) => b <= a))
  const update = (d: DayKey, ranges: [string, string][]) => setWeek((w) => ({ ...w!, [d]: ranges }))

  return (
    <>
      <PageHeader
        title="Verfügbarkeit"
        description="Wann du grundsätzlich buchbar bist. Bestehende Termine werden automatisch ausgespart."
        actions={<Button variant="primary" disabled={(!dirty && !needsConfirm) || save.isPending || badDays.length > 0} onClick={() => save.mutate()}>{dirty ? 'Speichern' : needsConfirm ? 'Zeiten übernehmen' : 'Gespeichert'}</Button>}
      />
      <div className="mb-6 flex flex-col gap-3">
        <ErrorBox error={save.error} />
        {badDays.length > 0 && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">Bei {badDays.map((d) => dayNames[d]).join(', ')} liegt das Ende nicht nach dem Beginn. Bitte korrigiere die markierten Zeiten, dann kannst du speichern.</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
            <SectionHeader title="Wochenzeiten" />
            <TimezonePicker value={tz} onChange={setTz} aria-label="Zeitzone" className="h-8 w-[260px] max-w-full text-[13px]" />
          </div>
          <p className="border-b border-line px-4 py-2.5 text-[13px] text-muted sm:px-6">Diese Zeiten gelten in der gewählten Zeitzone. Sie ist zugleich deine Zeitzone im Profil und für die Terminliste.</p>
          <ul className="divide-y divide-line">
            {DAY_KEYS.map((d) => {
              const ranges = week[d]
              const on = ranges.length > 0
              return (
                <li key={d} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-6">
                  <div className="flex h-10 w-40 shrink-0 items-center gap-3">
                    <Switch label={dayNames[d]} checked={on} onCheckedChange={(v) => update(d, v ? [['09:00', '17:00']] : [])} />
                    <span className={cn('text-sm font-medium', !on && 'text-muted')}>{dayNames[d]}</span>
                  </div>
                  {on ? (
                    <div className="flex flex-1 flex-col gap-2">
                      {ranges.map(([a, b], i) => (
                        <div key={i} className="flex items-center gap-1.5 sm:gap-2">
                          <TimeSelect value={a} invalid={b <= a} onChange={(v) => update(d, ranges.map((r, j) => (j === i ? [v, r[1]] : r)))} label={`${dayNames[d]} von`} />
                          <span className="text-subtle" aria-hidden>–</span>
                          <TimeSelect value={b} invalid={b <= a} onChange={(v) => update(d, ranges.map((r, j) => (j === i ? [r[0], v] : r)))} label={`${dayNames[d]} bis`} />
                          {i === 0 ? (
                            <>
                              <Button variant="ghost" size="icon" aria-label="Weiteren Zeitraum hinzufügen" onClick={() => {
                                const last = ranges[ranges.length - 1][1]
                                const start = last < '22:00' ? last : '18:00'
                                const end = times[Math.min(times.indexOf(start) + 8, times.length - 1)]
                                update(d, [...ranges, [start, end]])
                              }}><Plus /></Button>
                              <Button variant="ghost" size="icon" aria-label="Auf alle aktiven Tage übertragen" onClick={() => { setWeek((w) => Object.fromEntries(DAY_KEYS.map((k) => [k, w![k].length ? ranges : []])) as WeeklyHours); toast('Auf alle aktiven Tage übertragen') }}><Copy /></Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="icon" aria-label="Zeitraum entfernen" onClick={() => update(d, ranges.filter((_, j) => j !== i))}><Trash2 /></Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="flex h-10 items-center text-sm text-subtle">Nicht buchbar</p>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <SectionHeader title="Ausnahmen" description="Urlaub, Feiertage, andere Zeiten" />
              <Button size="sm" onClick={() => setAdd(true)}><Plus /> Neu</Button>
            </div>
            {q.data.exceptions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Keine Ausnahmen. Lege z. B. deinen nächsten Urlaub an.</p>
            ) : (
              <ul className="divide-y divide-line">
                {q.data.exceptions.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', x.kind === 'off' ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent-soft-fg')}><CalendarOff className="size-4" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{x.title}</p>
                      <p className="text-[13px] text-muted tabular">{fmtRange(x.fromDate, x.toDate)}</p>
                    </div>
                    {x.kind === 'off' ? <Badge>Frei</Badge> : <Badge tone="accent">{x.hours?.map((h) => h.join('–')).join(', ')}</Badge>}
                    <Button variant="ghost" size="icon" aria-label={`Ausnahme ${x.title} löschen`} onClick={() => delEx.mutate(x)} className="-mr-2"><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <CalendarStatusCard />
        </div>
      </div>
      <AddException open={add} onOpenChange={setAdd} />
    </>
  )
}

function TimeSelect({ value, onChange, label, invalid }: { value: string; onChange: (v: string) => void; label: string; invalid?: boolean }) {
  return (
    <Select aria-label={label} aria-invalid={invalid || undefined} value={value} onChange={(e) => onChange(e.target.value)} className={cn('h-10 w-[92px] pr-7 pl-2.5 tabular sm:w-[104px] sm:pr-8 sm:pl-3', invalid && 'border-danger ring-2 ring-danger/20')}>
      {times.map((t) => <option key={t}>{t}</option>)}
    </Select>
  )
}

function fmtRange(a: string, b: string) {
  const f = (s: string) => new Date(s + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
  return a === b ? f(a) : `${f(a)} – ${f(b)}`
}

function AddException({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const today = isoDateIn(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [kind, setKind] = useState<'off' | 'hours'>('off')
  const [title, setTitle] = useState('Urlaub')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [hours, setHours] = useState<[string, string]>(['10:00', '14:00'])
  const m = useMutation({
    mutationFn: () => api('/api/schedule/exceptions', { body: { title, fromDate: from, toDate: to < from ? from : to, kind, hours: kind === 'hours' ? [hours] : undefined } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); onOpenChange(false); toast('Ausnahme angelegt') },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Ausnahme hinzufügen" footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button><Button variant="primary" disabled={m.isPending || (kind === 'hours' && hours[1] <= hours[0])} onClick={() => m.mutate()}>Hinzufügen</Button></>}>
      <div className="flex flex-col gap-4">
        <Segmented label="Art der Ausnahme" value={kind} onChange={(k) => { setKind(k); if (k === 'hours' && title === 'Urlaub') setTitle('Andere Zeiten') }} options={[{ value: 'off', label: 'Nicht verfügbar' }, { value: 'hours', label: 'Andere Zeiten' }]} />
        <Field label="Bezeichnung" htmlFor="xt"><Input id="xt" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Von" htmlFor="xf"><Input id="xf" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} /></Field>
          <Field label="Bis" htmlFor="xto"><Input id="xto" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {kind === 'hours' && (
          <div className="flex items-center gap-2">
            <TimeSelect value={hours[0]} invalid={hours[1] <= hours[0]} onChange={(v) => setHours([v, hours[1]])} label="von" /> <span className="text-subtle">–</span> <TimeSelect value={hours[1]} invalid={hours[1] <= hours[0]} onChange={(v) => setHours([hours[0], v])} label="bis" />
          </div>
        )}
        {kind === 'hours' && hours[1] <= hours[0] && <p role="alert" className="text-[13px] text-danger">Das Ende muss nach dem Beginn liegen.</p>}
        <ErrorBox error={m.error} />
      </div>
    </Dialog>
  )
}
