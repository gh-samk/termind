import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, Plus, Send, Trash2, Webhook, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { Badge, Button, Card, CopyButton, Dialog, Field, Input, SectionHeader, Select, Switch, toast } from '../ui'
import { ErrorBox } from './AdminShell'

const EVENTS = [
  { id: 'booking.created', label: 'Gebucht' },
  { id: 'booking.requested', label: 'Angefragt' },
  { id: 'booking.confirmed', label: 'Anfrage bestätigt' },
  { id: 'booking.rescheduled', label: 'Verschoben' },
  { id: 'booking.cancelled', label: 'Abgesagt' },
  { id: 'booking.declined', label: 'Abgelehnt' },
]

interface Hook {
  id: string
  url: string
  events: string[]
  active: boolean
  deliveries: { id: string; event: string; ok: boolean; statusCode: number | null; error: string | null; createdAt: string }[]
}

export function WebhooksSettings() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['webhooks'], queryFn: () => api<Hook[]>('/api/webhooks') })
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState<Hook | null>(null)
  const inv = () => qc.invalidateQueries({ queryKey: ['webhooks'] })
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api(`/api/webhooks/${id}`, { method: 'PATCH', body }), onSuccess: inv })
  const del = useMutation({ mutationFn: (id: string) => api(`/api/webhooks/${id}`, { method: 'DELETE' }), onSuccess: () => { inv(); toast('Webhook gelöscht') } })
  const test = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean; statusCode?: number; error?: string }>(`/api/webhooks/${id}/test`, { body: {} }),
    onSuccess: (r) => { inv(); toast(r.ok ? `Test zugestellt (HTTP ${r.statusCode})` : `Test fehlgeschlagen: ${r.error}`) },
  })
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <SectionHeader title="Webhooks" description="Bei jedem Ereignis eine signierte Nachricht an deine Automatisierung (n8n, Make, Zapier, eigene Server)." />
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus /> Webhook</Button>
        </div>
        {q.data?.length === 0 && <p className="px-6 py-6 text-sm text-muted">Noch kein Webhook angelegt.</p>}
        <ul className="divide-y divide-line">
          {q.data?.map((w) => {
            const last = w.deliveries[0]
            const failed = w.deliveries.filter((d) => !d.ok).length
            return (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2"><Webhook className="size-4 text-muted" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px]">{w.url}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{w.events.map((e) => <Badge key={e}>{EVENTS.find((x) => x.id === e)?.label ?? e}</Badge>)}</div>
                </div>
                <button onClick={() => setLog(w)} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
                  <span className={cn('size-2 rounded-full', !last ? 'bg-line-strong' : last.ok ? 'bg-ok' : 'bg-danger')} />
                  {!last ? 'noch nichts gesendet' : `${w.deliveries.length - failed} ok, ${failed} Fehler`}
                </button>
                <Switch label="Aktiv" checked={w.active} onCheckedChange={(v) => patch.mutate({ id: w.id, body: { active: v } })} />
                <Button size="sm" variant="ghost" disabled={test.isPending} onClick={() => test.mutate(w.id)}><Send /> Testen</Button>
                <Button size="icon" variant="ghost" aria-label="Webhook löschen" onClick={() => del.mutate(w.id)}><Trash2 /></Button>
              </li>
            )
          })}
        </ul>
      </Card>
      <Card className="p-6">
        <SectionHeader title="Signatur prüfen" description="Jede Nachricht enthält die Header X-Termind-Timestamp und X-Termind-Signature. So prüfst du sie (Node.js):" />
        <pre className="mt-4 overflow-x-auto rounded-xl bg-sunken p-4 font-mono text-[12px] leading-relaxed ring-1 ring-line ring-inset">{`const expected = 'sha256=' + crypto.createHmac('sha256', SECRET)
  .update(req.headers['x-termind-timestamp'] + '.' + rawBody).digest('hex')
const sig = Buffer.from(String(req.headers['x-termind-signature'] ?? ''))
const ok = sig.length === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(expected), sig)`}</pre>
      </Card>
      <AddWebhook open={open} onOpenChange={setOpen} />
      <Dialog open={!!log} onOpenChange={(o) => !o && setLog(null)} title="Letzte Zustellungen" wide>
        <ul className="flex flex-col divide-y divide-line text-sm">
          {log?.deliveries.length === 0 && <li className="py-3 text-muted">Noch keine Zustellungen.</li>}
          {log?.deliveries.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              {d.ok ? <Check className="size-4 text-ok" /> : <X className="size-4 text-danger" />}
              <span className="w-40 shrink-0 font-mono text-[12px]">{d.event}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{d.ok ? `HTTP ${d.statusCode}` : d.error}</span>
              <time className="text-[12px] text-subtle tabular">{new Date(d.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</time>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}

function AddWebhook({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(EVENTS.map((e) => e.id))
  const [secret, setSecret] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: () => api<{ secret: string }>('/api/webhooks', { body: { url, events } }),
    onSuccess: (r) => { setSecret(r.secret); qc.invalidateQueries({ queryKey: ['webhooks'] }) },
  })
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) { setSecret(null); setUrl('') }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={secret ? 'Webhook angelegt' : 'Neuer Webhook'}
      description={secret ? 'Das Geheimnis zum Prüfen der Signatur wird nur jetzt angezeigt.' : undefined}
      footer={secret ? <Button variant="primary" onClick={() => close(false)}>Fertig</Button> : <><Button variant="ghost" onClick={() => close(false)}>Abbrechen</Button><Button variant="primary" disabled={!url || events.length === 0 || m.isPending} onClick={() => m.mutate()}>Anlegen</Button></>}
    >
      {secret ? (
        <div className="flex flex-col gap-3">
          <code className="block rounded-xl border border-line bg-sunken p-3 font-mono text-[13px] break-all">{secret}</code>
          <CopyButton value={secret} label="Geheimnis kopieren" size="md" variant="primary" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Ziel-Adresse" htmlFor="wu" hint="Muss mit https:// beginnen."><Input id="wu" type="url" placeholder="https://n8n.example.de/webhook/termind" value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono text-[13px]" /></Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Ereignisse</legend>
            <div className="grid grid-cols-2 gap-2">
              {EVENTS.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={events.includes(e.id)} onChange={(x) => setEvents(x.target.checked ? [...events, e.id] : events.filter((y) => y !== e.id))} /> {e.label}
                </label>
              ))}
            </div>
          </fieldset>
          <ErrorBox error={m.error} />
        </div>
      )}
    </Dialog>
  )
}

/* ---------------- Datenschutz: Frist, Auskunft, Löschung ---------------- */

export function PrivacyTools() {
  const qc = useQueryClient()
  const s = useQuery({ queryKey: ['privacy'], queryFn: () => api<{ retentionMonths: number }>('/api/privacy') })
  const setRet = useMutation({ mutationFn: (m: number) => api('/api/privacy', { method: 'PUT', body: { retentionMonths: m } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['privacy'] }); toast('Gespeichert') } })
  const [email, setEmail] = useState('')
  const [confirm, setConfirm] = useState(false)
  const exp = useMutation({
    mutationFn: () => api<{ bookings: unknown[] }>('/api/privacy/export', { body: { email } }),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `auskunft-${email.replace(/[^a-z0-9.@-]/gi, '_')}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`${data.bookings.length} Termin(e) exportiert`)
    },
  })
  const erase = useMutation({
    mutationFn: () => api<{ anonymized: number; cancelled: number }>('/api/privacy/erase', { body: { email } }),
    onSuccess: (r) => { setConfirm(false); setEmail(''); qc.invalidateQueries({ queryKey: ['bookings'] }); toast(`${r.anonymized} Termin(e) anonymisiert`) },
  })
  return (
    <>
      <Card className="divide-y divide-line px-6 py-5">
        <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="max-w-[46ch]">
            <p className="text-sm font-medium">Vergangene Termine anonymisieren nach</p>
            <p className="mt-0.5 text-sm text-muted">Name, E-Mail und Angaben der Gäste werden entfernt, ältere Protokolleinträge gelöscht. Läuft einmal täglich.</p>
          </div>
          <Select aria-label="Aufbewahrungsfrist" className="w-44" value={s.data?.retentionMonths ?? 12} onChange={(e) => setRet.mutate(Number(e.target.value))}>
            {[3, 6, 12, 24, 36].map((m) => <option key={m} value={m}>{m} Monaten</option>)}
            <option value={0}>Nie (nicht empfohlen)</option>
          </Select>
        </div>
        <div className="pt-5">
          <p className="text-sm font-medium">Auskunft & Löschung</p>
          <p className="mt-0.5 text-sm text-muted">Für Anfragen nach Art. 15 und 17 DSGVO: alle Daten zu einer E-Mail-Adresse exportieren oder löschen.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input aria-label="E-Mail-Adresse der Person" type="email" placeholder="name@beispiel.de" value={email} onChange={(e) => setEmail(e.target.value)} className="w-72 max-w-full" />
            <Button disabled={!email || exp.isPending} onClick={() => exp.mutate()}><Download /> Exportieren</Button>
            <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" disabled={!email} onClick={() => setConfirm(true)}><Trash2 /> Löschen</Button>
          </div>
          <div className="mt-3"><ErrorBox error={exp.error} /></div>
        </div>
      </Card>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Daten unwiderruflich löschen?"
        description={`Alle Termine von ${email} werden anonymisiert. Künftige Termine werden ohne Mail abgesagt und aus deinem Kalender entfernt.`}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Abbrechen</Button><Button variant="danger" disabled={erase.isPending} onClick={() => erase.mutate()}>Endgültig löschen</Button></>}
      >
        <ErrorBox error={erase.error} />
      </Dialog>
    </>
  )
}
