import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError, errorMessage } from '../lib/api'
import { Button, Field, Textarea } from '../ui'

/*
 * Landeseite der Direkt-Knöpfe aus der Anfrage-Mail („Bestätigen“ / „Ablehnen“).
 * Das Öffnen der Seite ändert nichts (Mail-Scanner und Link-Vorschauen rufen Links ab).
 * Erst der Knopf auf dieser Seite sendet ein POST.
 */

type View =
  | { state: 'open'; action: 'confirm' | 'decline'; eventTitle: string; startsAt: string; endsAt: string; guestName: string; timezone: string; locale: 'de' | 'en' }
  | { state: 'handled'; locale: 'de' | 'en' }
  | { state: 'past'; locale: 'de' | 'en' }
  | { state: 'gone'; locale: 'de' | 'en' }

const TEXT = {
  de: {
    loading: 'Einen Moment …',
    goneTitle: 'Link nicht mehr gültig',
    gone: 'Dieser Link ist abgelaufen oder ungültig. Du kannst die Anfrage auch im Bereich „Termine“ bearbeiten.',
    handledTitle: 'Schon erledigt',
    handled: 'Diese Anfrage wurde schon bearbeitet. Der Link lässt sich nur einmal verwenden.',
    pastTitle: 'Termin vorbei',
    past: 'Dieser Termin liegt in der Vergangenheit und kann nicht mehr bearbeitet werden.',
    errorTitle: 'Das hat nicht geklappt',
    confirmTitle: 'Termin bestätigen?',
    confirmLead: (n: string) => `${n} bekommt danach eine Bestätigung mit Kalendereintrag.`,
    declineTitle: 'Anfrage ablehnen?',
    declineLead: (n: string) => `${n} bekommt eine Absage per E-Mail.`,
    confirmBtn: 'Termin bestätigen',
    declineBtn: 'Anfrage ablehnen',
    message: 'Nachricht an den Gast (optional)',
    messageHint: 'Wird in der Absage-Mail angezeigt.',
    doneConfirmTitle: 'Termin bestätigt',
    doneConfirm: (n: string) => `${n} wurde per E-Mail benachrichtigt. Du kannst dieses Fenster schließen.`,
    doneDeclineTitle: 'Anfrage abgelehnt',
    doneDecline: (n: string) => `${n} wurde per E-Mail benachrichtigt. Du kannst dieses Fenster schließen.`,
    guest: 'Gast',
    when: 'Wann',
    clock: 'Uhr',
  },
  en: {
    loading: 'One moment …',
    goneTitle: 'Link no longer valid',
    gone: 'This link has expired or is invalid. You can also handle the request under “Appointments”.',
    handledTitle: 'Already done',
    handled: 'This request has already been handled. The link can only be used once.',
    pastTitle: 'Meeting is over',
    past: 'This meeting is in the past and can no longer be changed.',
    errorTitle: 'That did not work',
    confirmTitle: 'Confirm this meeting?',
    confirmLead: (n: string) => `${n} will receive a confirmation with a calendar invite.`,
    declineTitle: 'Decline this request?',
    declineLead: (n: string) => `${n} will receive a decline by email.`,
    confirmBtn: 'Confirm meeting',
    declineBtn: 'Decline request',
    message: 'Message to the guest (optional)',
    messageHint: 'Shown in the decline email.',
    doneConfirmTitle: 'Meeting confirmed',
    doneConfirm: (n: string) => `${n} has been notified by email. You can close this window.`,
    doneDeclineTitle: 'Request declined',
    doneDecline: (n: string) => `${n} has been notified by email. You can close this window.`,
    guest: 'Guest',
    when: 'When',
    clock: '',
  },
} as const

function Frame({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="enter w-full max-w-[440px] rounded-2xl border border-line bg-surface p-6 shadow-xs sm:p-8">
        <h1 className="font-display text-[26px] leading-tight">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function range(v: Extract<View, { state: 'open' }>) {
  const loc = v.locale === 'de' ? 'de-DE' : 'en-US'
  const opt = { timeZone: v.timezone }
  const s = new Date(v.startsAt)
  const e = new Date(v.endsAt)
  const date = new Intl.DateTimeFormat(loc, { ...opt, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(s)
  const time = new Intl.DateTimeFormat(loc, v.locale === 'de' ? { ...opt, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { ...opt, hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date}, ${time.format(s)} – ${time.format(e)}${v.locale === 'de' ? ' Uhr' : ''}`
}

export function AktionPage() {
  const { token = '' } = useParams()
  const [message, setMessage] = useState('')
  useEffect(() => {
    // Die Seite gehört nicht in Suchmaschinen
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    document.title = 'termind'
    return () => meta.remove()
  }, [])
  const q = useQuery({ queryKey: ['aktion', token], queryFn: () => api<View>(`/api/public/aktion/${encodeURIComponent(token)}`), retry: false, refetchOnWindowFocus: false, staleTime: Infinity })
  const run = useMutation({ mutationFn: (body: { message?: string }) => api<{ ok: true; action: 'confirm' | 'decline' }>(`/api/public/aktion/${encodeURIComponent(token)}`, { body }) })

  const guess = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'de'
  if (q.isLoading) return <Frame title={TEXT[guess].loading} />
  if (q.error || !q.data) return <Frame title={TEXT[guess].errorTitle}><p className="mt-3 text-[15px] text-muted">{errorMessage(q.error)}</p></Frame>
  const v = q.data
  const L = TEXT[v.locale]
  if (v.state === 'gone') return <Frame title={L.goneTitle}><p className="mt-3 text-[15px] text-muted">{L.gone}</p></Frame>
  if (v.state === 'handled') return <Frame title={L.handledTitle}><p className="mt-3 text-[15px] text-muted">{L.handled}</p></Frame>
  if (v.state === 'past') return <Frame title={L.pastTitle}><p className="mt-3 text-[15px] text-muted">{L.past}</p></Frame>

  const t = TEXT[v.locale]
  const confirm = v.action === 'confirm'
  if (run.isSuccess) {
    return (
      <Frame title={confirm ? t.doneConfirmTitle : t.doneDeclineTitle}>
        <p className="mt-3 flex items-start gap-2 text-[15px] text-muted"><Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />{confirm ? t.doneConfirm(v.guestName) : t.doneDecline(v.guestName)}</p>
      </Frame>
    )
  }
  const errCode = run.error instanceof ApiError ? run.error.code : ''
  const handledNow = errCode === 'handled' || errCode === 'expired'
  return (
    <Frame title={confirm ? t.confirmTitle : t.declineTitle}>
      <p className="mt-2 text-[15px] text-muted">{confirm ? t.confirmLead(v.guestName) : t.declineLead(v.guestName)}</p>
      <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface-2/50 text-[15px]">
        <div className="px-4 py-3"><dt className="text-[13px] text-muted">{v.eventTitle}</dt><dd className="mt-0.5 font-medium">{range(v)}</dd></div>
        <div className="px-4 py-3"><dt className="text-[13px] text-muted">{t.guest}</dt><dd className="mt-0.5 font-medium">{v.guestName}</dd></div>
      </dl>
      {!confirm && (
        <div className="mt-5">
          <Field label={t.message} htmlFor="aktion-msg" hint={t.messageHint}>
            <Textarea id="aktion-msg" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} className="min-h-24 text-sm" />
          </Field>
        </div>
      )}
      {run.isError && <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">{errCode === 'handled' ? t.handled : errCode === 'expired' ? t.gone : errorMessage(run.error)}</p>}
      <Button className="mt-6 w-full" variant={confirm ? 'primary' : 'danger'} size="lg" disabled={run.isPending || handledNow} onClick={() => run.mutate(confirm ? {} : { message: message.trim() || undefined })}>
        {confirm ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
        {confirm ? t.confirmBtn : t.declineBtn}
      </Button>
    </Frame>
  )
}
