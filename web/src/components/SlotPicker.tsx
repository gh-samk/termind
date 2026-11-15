import { useQuery } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SlotMap } from '@shared/types'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { addDays, browserTz, fmtDayMonth, fmtMonthYear, fmtTime, fmtWeekday, isoDateIn } from '../lib/format'
import { defaultH12, tzShort } from '../lib/guest'
import { useT } from '../lib/i18n'
import { Button, Segmented } from '../ui'
import { TimezonePicker } from './TimezonePicker'

/**
 * Monatskalender + Uhrzeiten. Lädt freie Zeiten monatsweise vom Server.
 * slotsUrl bekommt from/to/tz angehängt.
 */
export function SlotPicker({ slotsUrl, onPick, confirmLabel, busy, initialTz, initialDay, initialH12, current }: {
  slotsUrl: string
  onPick: (iso: string, tz: string, h12: boolean) => void
  confirmLabel?: string
  busy?: boolean
  /** Zeitzone und Tag einer früheren Auswahl (z. B. nach „Zeit vergeben“), damit der Gast nicht von vorn beginnt */
  initialTz?: string
  initialDay?: string
  initialH12?: boolean
  /** Bisherige Zeit beim Verschieben: wird als „Bisher“ beschriftet und nicht als Auswahl angeboten */
  current?: string
}) {
  const { t, locale } = useT()
  const [tz, setTz] = useState(initialTz ?? browserTz())
  const [month, setMonth] = useState(() => (initialDay ?? isoDateIn(new Date(), tz)).slice(0, 7))
  const [day, setDay] = useState<string | null>(initialDay ?? null)
  const [time, setTime] = useState<string | null>(null)
  const [h12, setH12] = useState<'24' | '12'>((initialH12 ?? defaultH12(locale, tz)) ? '12' : '24')
  const timeSection = useRef<HTMLElement>(null)
  const timeHeading = useRef<HTMLHeadingElement>(null)
  const scrollToTimes = useRef(false)

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
  const weekdays = locale === 'de' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

  // Nach der Tagwahl auf kleinen Bildschirmen (Uhrzeiten liegen unter dem Kalender) zur Liste springen
  useEffect(() => {
    if (!day || !scrollToTimes.current) return
    scrollToTimes.current = false
    if (window.matchMedia('(min-width: 1024px)').matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timeSection.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    timeHeading.current?.focus({ preventScroll: true })
  }, [day])

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
        <h2 data-step-heading tabIndex={-1} className="text-[17px] font-semibold focus:outline-none">{t.pickDay}</h2>
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-muted" id="tz-hint">{(tz === browserTz() ? t.tzOwn : t.tzOther)(tzShort(tz, day ? new Date(day + 'T12:00:00Z') : new Date(), locale))}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor="tz-select" className="text-[13px] font-medium text-fg">{t.tzChange}</label>
            <div className="w-full max-w-[320px] sm:w-[300px]">
              <TimezonePicker id="tz-select" value={tz} locale={locale} onChange={(z) => { setTz(z); setDay(null); setTime(null) }} className="h-9 text-sm pointer-coarse:h-11" />
            </div>
          </div>
        </div>
        <div className="mt-5 mb-3 flex items-center justify-between">
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
                onClick={() => { scrollToTimes.current = true; setDay(d); setTime(null) }}
                aria-pressed={sel}
                aria-label={`${fmtWeekday(d + 'T12:00:00Z', 'UTC', locale)}, ${fmtDayMonth(d + 'T12:00:00Z', 'UTC', locale)}`}
                className={cn(
                  'press relative mx-auto flex aspect-square w-full max-w-12 items-center justify-center rounded-xl text-[15px] tabular pointer-coarse:after:absolute pointer-coarse:after:-inset-[3px]',
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
        {q.isSuccess && !firstAvailable && (autoJumps >= 3 && !userNavigated ? (
          <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <p className="font-medium text-fg">{t.noSlotsAll}</p>
            <p className="mt-0.5 text-muted">{t.noSlotsAllHint}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t.noSlotsMonth}</p>
        ))}
        {q.isError && (
          <p role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-danger">
            {t.loadError}
            <Button size="sm" onClick={() => q.refetch()}>{t.retry}</Button>
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <Segmented label={t.timeFormat} size="sm" value={h12} onChange={setH12} options={[{ value: '24', label: '24 h' }, { value: '12', label: '12 h' }]} />
        </div>
      </section>

      <section ref={timeSection} aria-label={t.timeLabel} className="scroll-mt-3 border-t border-line p-5 sm:p-7 lg:border-t-0 lg:border-l">
        {day ? (
          <div key={day} className="enter">
            <h2 ref={timeHeading} tabIndex={-1} className="text-[15px] font-semibold focus:outline-none">
              <span className="capitalize">{fmtWeekday(day + 'T12:00:00Z', 'UTC', locale)}</span>, <span className="font-normal text-muted">{fmtDayMonth(day + 'T12:00:00Z', 'UTC', locale)}</span>
            </h2>
            {daySlots.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t.noSlots}</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2 pb-1 lg:max-h-[420px] lg:overflow-auto lg:pr-1">
                {daySlots.map((iso) => current && Date.parse(iso) === Date.parse(current) ? (
                  <li key={iso}>
                    <button type="button" disabled className="h-11 w-full rounded-[10px] border border-dashed border-line text-[15px] text-subtle tabular disabled:cursor-not-allowed">
                      {t.previouslyAt(fmtTime(iso, tz, locale, h12 === '12'))}
                    </button>
                  </li>
                ) : (
                  <li key={iso} className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      onClick={() => setTime(iso)}
                      aria-pressed={time === iso}
                      className={cn(
                        'press h-11 rounded-[10px] border text-[15px] font-semibold tabular',
                        time === iso ? 'border-2 border-accent bg-accent-soft font-bold text-accent-soft-fg' : 'col-span-2 border-accent/35 text-accent hover:border-accent hover:bg-accent-soft/50',
                      )}
                    >
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {time === iso && <Check className="size-4" strokeWidth={3} aria-hidden />}
                        {fmtTime(iso, tz, locale, h12 === '12')}
                      </span>
                    </button>
                    {time === iso && (
                      <Button variant="primary" className="enter h-11 px-5" autoFocus disabled={busy} onClick={() => onPick(iso, tz, h12 === '12')}>
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
