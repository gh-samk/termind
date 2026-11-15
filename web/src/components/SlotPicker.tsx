import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock, Globe, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { SlotMap } from '@shared/types'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { addDays, browserTz, fmtDayMonth, fmtMonthYear, fmtTime, fmtWeekday, isoDateIn } from '../lib/format'
import { useT } from '../lib/i18n'
import { Button, Segmented, Select } from '../ui'

const COMMON_TZ = ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Europe/Lisbon', 'Europe/Istanbul', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']

/**
 * Monatskalender + Uhrzeiten. Lädt freie Zeiten monatsweise vom Server.
 * slotsUrl bekommt from/to/tz angehängt.
 */
export function SlotPicker({ slotsUrl, onPick, confirmLabel, busy }: { slotsUrl: string; onPick: (iso: string, tz: string) => void; confirmLabel?: string; busy?: boolean }) {
  const { t, locale } = useT()
  const [tz, setTz] = useState(browserTz())
  const [month, setMonth] = useState(() => isoDateIn(new Date(), tz).slice(0, 7))
  const [day, setDay] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [h12, setH12] = useState<'24' | '12'>(locale === 'en' && tz.startsWith('America') ? '12' : '24')

  const from = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const q = useQuery({
    queryKey: ['slots', slotsUrl, month, tz],
    queryFn: () => api<{ slots: SlotMap }>(`${slotsUrl}?from=${from}&to=${to}&tz=${encodeURIComponent(tz)}`),
    staleTime: 30_000,
  })
  const slots = q.data?.slots ?? {}
  const firstAvailable = Object.keys(slots).sort()[0]

  // Beim ersten Laden ohne freie Zeiten automatisch in den nächsten Monat springen (max. 3x)
  // Nur beim ersten Laden automatisch weiterspringen, nicht nach eigener Auswahl des Gastes
  const [autoJumps, setAutoJumps] = useState(0)
  const [userNavigated, setUserNavigated] = useState(false)
  useEffect(() => {
    if (q.isSuccess && !firstAvailable && autoJumps < 3 && !day && !userNavigated) {
      setAutoJumps((n) => n + 1)
      setMonth(addDays(to, 1).slice(0, 7))
    }
  }, [q.isSuccess, firstAvailable]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = isoDateIn(new Date(), tz)
  const canPrev = month > today.slice(0, 7)
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const days = useMemo(() => Array.from({ length: Number(to.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`), [month, to])
  const daySlots = day ? (slots[day] ?? []) : []
  const tzOptions = COMMON_TZ.includes(tz) ? COMMON_TZ : [tz, ...COMMON_TZ]
  const weekdays = locale === 'de' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

  const shift = (n: number) => {
    setUserNavigated(true)
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
    setDay(null)
    setTime(null)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_260px]">
      <section aria-label={t.pickDay} className="p-5 sm:p-7">
        <h2 className="text-[17px] font-semibold">{t.pickDay}</h2>
        <div className="mt-4 mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium capitalize" aria-live="polite">
            {fmtMonthYear(new Date(Date.UTC(y, m - 1, 15)), locale)}
            {q.isFetching && <Loader2 className="size-3.5 animate-spin text-subtle" aria-hidden />}
          </p>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label={t.prevMonth} disabled={!canPrev} onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t.nextMonth} onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((d) => (
            <div key={d} className="pb-2 text-xs font-medium tracking-wide text-subtle uppercase">{d}</div>
          ))}
          {Array.from({ length: offset }).map((_, i) => <div key={'e' + i} />)}
          {days.map((d) => {
            const available = (slots[d]?.length ?? 0) > 0
            const sel = d === day
            return (
              <button
                key={d}
                disabled={!available}
                onClick={() => { setDay(d); setTime(null) }}
                aria-pressed={sel}
                aria-label={`${fmtWeekday(d + 'T12:00:00Z', 'UTC', locale)}, ${fmtDayMonth(d + 'T12:00:00Z', 'UTC', locale)}`}
                className={cn(
                  'press relative mx-auto flex aspect-square w-full max-w-12 items-center justify-center rounded-xl text-[15px] tabular pointer-coarse:after:absolute pointer-coarse:after:-inset-[2px]',
                  available ? 'bg-accent-soft font-semibold text-accent-soft-fg hover:brightness-[0.97] dark:hover:brightness-110' : 'cursor-default text-subtle/70',
                  sel && 'bg-accent text-accent-fg hover:brightness-100',
                  q.isLoading && 'animate-pulse',
                )}
              >
                {Number(d.slice(8))}
                {d === today && <span className={cn('absolute bottom-1.5 size-1 rounded-full', sel ? 'bg-accent-fg' : 'bg-fg/60')} />}
              </button>
            )
          })}
        </div>
        {q.isSuccess && !firstAvailable && <p className="mt-4 text-sm text-muted">{t.noSlotsMonth}</p>}
        {q.isError && (
          <p role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-danger">
            {t.loadError}
            <Button size="sm" onClick={() => q.refetch()}>{t.retry}</Button>
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <Globe className="size-4" aria-hidden />
            <span className="sr-only">{t.timezone}</span>
            <Select value={tz} onChange={(e) => { setTz(e.target.value); setDay(null); setTime(null) }} className="h-9 w-[210px] border-transparent bg-transparent px-1 text-sm text-muted shadow-none hover:border-line">
              {tzOptions.map((z) => <option key={z} value={z}>{z.replace('_', ' ').replace('/', ' / ')}</option>)}
            </Select>
          </label>
          <Segmented label="Zeitformat" size="sm" value={h12} onChange={setH12} options={[{ value: '24', label: '24 h' }, { value: '12', label: '12 h' }]} />
        </div>
      </section>

      <section aria-label="Uhrzeit" className="border-t border-line p-5 sm:p-7 lg:border-t-0 lg:border-l">
        {day ? (
          <div key={day} className="enter">
            <h2 className="text-[15px] font-semibold">
              <span className="capitalize">{fmtWeekday(day + 'T12:00:00Z', 'UTC', locale)}</span>, <span className="font-normal text-muted">{fmtDayMonth(day + 'T12:00:00Z', 'UTC', locale)}</span>
            </h2>
            {daySlots.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t.noSlots}</p>
            ) : (
              <ul className="mt-4 flex max-h-[420px] flex-col gap-2 overflow-auto pr-1 pb-1">
                {daySlots.map((iso) => (
                  <li key={iso} className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      onClick={() => setTime(iso)}
                      aria-pressed={time === iso}
                      className={cn(
                        'press h-11 rounded-[10px] border text-[15px] font-semibold tabular',
                        time === iso ? 'border-fg/80 bg-fg/[0.03] text-fg' : 'col-span-2 border-accent/35 text-accent hover:border-accent hover:bg-accent-soft/50',
                      )}
                    >
                      {fmtTime(iso, tz, locale, h12 === '12')}
                    </button>
                    {time === iso && (
                      <Button variant="primary" className="enter h-11 px-5" autoFocus disabled={busy} onClick={() => onPick(iso, tz)}>
                        {confirmLabel ?? t.next}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
            <Clock className="size-5 text-subtle" aria-hidden />
            <p className="max-w-[20ch] text-sm text-muted">{t.pickDayHint}</p>
          </div>
        )}
      </section>
    </div>
  )
}
