import { CalendarOff, Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { dayNames, dayOrder, exceptions as initialEx, weekly as initial, type DayKey } from '../data/mock'
import { cn } from '../lib/cn'
import { Badge, Button, Card, Dialog, Field, Input, SectionHeader, Select, Segmented, Switch, toast } from '../ui'
import { PageHeader } from './AdminShell'

const times = Array.from({ length: 4 * 24 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

export function Verfuegbarkeit() {
  const [week, setWeek] = useState(initial)
  const [ex, setEx] = useState(initialEx)
  const [add, setAdd] = useState(false)

  const update = (d: DayKey, ranges: [string, string][]) => setWeek((w) => ({ ...w, [d]: ranges }))

  return (
    <>
      <PageHeader
        title="Verfügbarkeit"
        description="Wann du grundsätzlich buchbar bist. Termine aus deinem Kalender werden automatisch ausgespart."
        actions={<Button variant="primary" onClick={() => toast('Gespeichert')}>Speichern</Button>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select defaultValue="std" className="h-10 w-56 font-medium">
          <option value="std">Standardzeiten</option>
          <option value="ws">Workshop-Tage</option>
        </Select>
        <span className="text-sm text-muted">genutzt von 4 Terminseiten</span>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
            <SectionHeader title="Wochenzeiten" />
            <div className="flex items-center gap-2">
              <Select defaultValue="Europe/Berlin" aria-label="Zeitzone" className="h-8 w-[180px] text-[13px]">
                <option value="Europe/Berlin">Europe/Berlin</option>
                <option>Europe/Zurich</option>
                <option>Europe/Vienna</option>
              </Select>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {dayOrder.map((d) => {
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
                          <TimeSelect value={a} onChange={(v) => update(d, ranges.map((r, j) => (j === i ? [v, r[1]] : r)))} label={`${dayNames[d]} von`} />
                          <span className="text-subtle" aria-hidden>–</span>
                          <TimeSelect value={b} onChange={(v) => update(d, ranges.map((r, j) => (j === i ? [r[0], v] : r)))} label={`${dayNames[d]} bis`} />
                          {i === 0 ? (
                            <>
                              <Button variant="ghost" size="icon" aria-label="Weiteren Zeitraum hinzufügen" onClick={() => update(d, [...ranges, ['14:00', '17:00']])}><Plus /></Button>
                              <Button variant="ghost" size="icon" aria-label="Auf alle Werktage kopieren" onClick={() => { setWeek((w) => ({ ...w, ...Object.fromEntries((['mo', 'di', 'mi', 'do', 'fr'] as DayKey[]).map((k) => [k, ranges])) })); toast('Auf Mo–Fr übertragen') }}><Copy /></Button>
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
            <ul className="divide-y divide-line">
              {ex.map((x) => (
                <li key={x.id} className="group flex items-center gap-3 px-5 py-3.5">
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', x.kind === 'off' ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent-soft-fg')}>
                    <CalendarOff className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{x.title}</p>
                    <p className="text-[13px] text-muted tabular">{fmtRange(x.from, x.to)}</p>
                  </div>
                  {x.kind === 'off' ? <Badge>Frei</Badge> : <Badge tone="accent">{'hours' in x ? x.hours : ''}</Badge>}
                  <Button variant="ghost" size="icon" aria-label="Ausnahme löschen" onClick={() => setEx((l) => l.filter((y) => y.id !== x.id))} className="-mr-2"><Trash2 /></Button>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3.5">
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => toast('Feiertage Baden-Württemberg 2027 übernommen')}>
                Gesetzliche Feiertage übernehmen …
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Abgleich mit Kalendern" />
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              <li className="flex items-center gap-2.5"><span className="size-2 rounded-full bg-warn-line" aria-hidden /> <span className="flex-1">Nextcloud (CalDAV)</span><span className="text-warn-fg">getrennt</span></li>
              <li className="flex items-center gap-2.5"><span className="size-2 rounded-full bg-ok" aria-hidden /> <span className="flex-1">Proton (ICS-Abo)</span><span className="text-muted">vor 4 Min.</span></li>
            </ul>
          </Card>
        </div>
      </div>

      <AddException open={add} onOpenChange={setAdd} onAdd={(x) => { setEx((l) => [...l, x]); setAdd(false); toast('Ausnahme angelegt') }} />
    </>
  )
}

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-[92px] pr-7 pl-2.5 tabular sm:w-[104px] sm:pr-8 sm:pl-3">
      {times.map((t) => <option key={t}>{t}</option>)}
    </Select>
  )
}

function fmtRange(a: string, b: string) {
  const f = (s: string) => new Date(s + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return a === b ? f(a) : `${f(a)} – ${f(b)}`
}

function AddException({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (x: (typeof initialEx)[number]) => void }) {
  const [kind, setKind] = useState<'off' | 'hours'>('off')
  const [title, setTitle] = useState('Urlaub')
  const [from, setFrom] = useState('2027-02-15')
  const [to, setTo] = useState('2027-02-19')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ausnahme hinzufügen"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button variant="primary" onClick={() => onAdd({ id: String(Date.now()), title, from, to, kind: 'off' })}>Hinzufügen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'off', label: 'Nicht verfügbar' }, { value: 'hours', label: 'Andere Zeiten' }]} />
        <Field label="Bezeichnung" htmlFor="xt"><Input id="xt" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Von" htmlFor="xf"><Input id="xf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Bis" htmlFor="xto"><Input id="xto" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {kind === 'hours' && (
          <div className="flex items-center gap-2">
            <TimeSelect value="10:00" onChange={() => {}} label="von" /> <span className="text-subtle">–</span> <TimeSelect value="14:00" onChange={() => {}} label="bis" />
          </div>
        )}
      </div>
    </Dialog>
  )
}
