import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, Link2, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { Badge, Button, Card, Dialog, Field, Input, SectionHeader, Segmented, Switch, toast } from '../ui'
import { ErrorBox } from './AdminShell'

export interface Connection {
  id: string
  kind: 'caldav' | 'ics'
  name: string
  url: string
  username: string | null
  calendars: { url: string; name: string; color?: string; checkBusy: boolean }[]
  writeCalendarUrl: string | null
  status: 'ok' | 'error' | 'pending'
  lastError: string | null
  lastSyncAt: string | null
}

export function useConnections() {
  return useQuery({ queryKey: ['calendars'], queryFn: () => api<Connection[]>('/api/calendars'), refetchInterval: 120_000 })
}

function since(iso: string | null) {
  if (!iso) return 'noch nie'
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.round(min / 60)
  return h < 48 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} Tagen`
}

/** Hinweis für Termine-Seite und Verfügbarkeit, wenn ein Kalender nicht erreichbar ist. */
export function CalendarProblems() {
  const q = useConnections()
  const broken = (q.data ?? []).filter((c) => c.status === 'error')
  if (broken.length === 0) return null
  return (
    <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4 text-warn-fg">
      <AlertTriangle className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="min-w-[220px] flex-1 text-sm">
        <p className="font-semibold">{broken.length === 1 ? `Dein Kalender „${broken[0].name}“ ist nicht erreichbar.` : `${broken.length} Kalender sind nicht erreichbar.`}</p>
        <p className="mt-0.5 opacity-90">Neue Termine aus diesem Kalender fehlen gerade auf deinen Buchungsseiten. {broken[0].lastError}</p>
      </div>
      <Link to="/admin/einstellungen/kalender" className="press ml-[30px] inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-fg shadow-xs sm:ml-0">Reparieren</Link>
    </div>
  )
}

export function KalenderSettings() {
  const qc = useQueryClient()
  const q = useConnections()
  const [add, setAdd] = useState(false)
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['calendars'] })
    qc.invalidateQueries({ queryKey: ['slots'] })
  }
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api(`/api/calendars/${id}`, { method: 'PATCH', body }), onSuccess: invalidate })
  const sync = useMutation({ mutationFn: (id: string) => api<Connection>(`/api/calendars/${id}/sync`, { body: {} }), onSuccess: (c) => { invalidate(); toast(c.status === 'ok' ? 'Abgeglichen' : 'Abgleich fehlgeschlagen') } })
  const del = useMutation({ mutationFn: (id: string) => api(`/api/calendars/${id}`, { method: 'DELETE' }), onSuccess: () => { invalidate(); toast('Verbindung entfernt') } })
  const [fix, setFix] = useState<Connection | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <SectionHeader title="Verbundene Kalender" description="Belegte Zeiten werden alle paar Minuten abgeglichen und auf deinen Buchungsseiten ausgespart." />
          <Button size="sm" variant="primary" onClick={() => setAdd(true)}><Plus /> Verbinden</Button>
        </div>
        {q.data?.length === 0 && (
          <div className="px-6 py-8 text-center">
            <p className="font-medium">Noch kein Kalender verbunden</p>
            <p className="mx-auto mt-1 max-w-[52ch] text-sm text-muted">Funktioniert mit Nextcloud, iCloud, mailbox.org, Fastmail, Posteo und jedem CalDAV-Server. Google, Outlook oder Proton bindest du vorerst über einen ICS-Link ein (nur lesen).</p>
          </div>
        )}
        <ul className="divide-y divide-line">
          {q.data?.map((c) => (
            <li key={c.id} className="px-6 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2">{c.kind === 'caldav' ? <CalendarDays className="size-5 text-muted" /> : <Link2 className="size-5 text-muted" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name} <span className="font-normal text-muted">· {c.kind === 'caldav' ? 'CalDAV' : 'ICS-Abo'}</span></p>
                  <p className={cn('text-sm', c.status === 'error' ? 'text-warn-fg' : 'text-muted')}>
                    {c.status === 'error' ? c.lastError : c.status === 'pending' ? 'Wird abgeglichen …' : `Abgeglichen ${since(c.lastSyncAt)}`}
                  </p>
                </div>
                {c.status === 'error' && c.kind === 'caldav' && <Button size="sm" variant="primary" onClick={() => setFix(c)}>Neu anmelden</Button>}
                <Button size="sm" variant="ghost" disabled={sync.isPending} onClick={() => sync.mutate(c.id)} aria-label="Jetzt abgleichen"><RotateCw className={cn(sync.isPending && sync.variables === c.id && 'animate-spin')} /> Abgleichen</Button>
                <Button size="icon" variant="ghost" aria-label={`${c.name} entfernen`} onClick={() => del.mutate(c.id)}><Trash2 /></Button>
              </div>
              {c.kind === 'caldav' && (
                <ul className="mt-4 flex flex-col gap-1 rounded-xl border border-line p-1.5">
                  {c.calendars.map((k) => (
                    <li key={k.url} className="flex flex-wrap items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-surface-2/50">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: k.color || 'var(--border-strong)' }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm">{k.name}</span>
                      <label className="flex items-center gap-2 text-[13px] text-muted">
                        <Switch label={`${k.name}: belegte Zeiten prüfen`} checked={k.checkBusy} onCheckedChange={(v) => patch.mutate({ id: c.id, body: { calendars: [{ url: k.url, checkBusy: v }] } })} /> Belegt prüfen
                      </label>
                      <label className="flex items-center gap-2 text-[13px] text-muted">
                        <input type="radio" name="write-calendar" checked={c.writeCalendarUrl === k.url} onChange={() => patch.mutate({ id: c.id, body: { writeCalendarUrl: k.url } })} className="size-4 accent-[var(--accent)]" /> Termine hier eintragen
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-[13px] text-muted">Tipp: Lege für termind ein eigenes App-Passwort an (bei Nextcloud unter Einstellungen → Sicherheit, bei iCloud auf appleid.apple.com). Dein Hauptpasswort brauchst du nicht.</p>
      <AddCalendar open={add} onOpenChange={setAdd} />
      <Relogin conn={fix} onClose={() => setFix(null)} />
    </div>
  )
}

function AddCalendar({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<'caldav' | 'ics'>('caldav')
  const [f, setF] = useState({ url: '', username: '', password: '', name: '' })
  const m = useMutation({
    mutationFn: () => (kind === 'caldav' ? api<Connection>('/api/calendars/caldav', { body: f }) : api<Connection>('/api/calendars/ics', { body: { url: f.url, name: f.name || undefined } })),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['calendars'] })
      qc.invalidateQueries({ queryKey: ['slots'] })
      onOpenChange(false)
      setF({ url: '', username: '', password: '', name: '' })
      toast(c.status === 'ok' ? `Verbunden: ${c.calendars.length} Kalender` : 'Verbunden, Abgleich hatte einen Fehler')
    },
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Kalender verbinden"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button><Button variant="primary" disabled={m.isPending || !f.url || (kind === 'caldav' && (!f.username || !f.password))} onClick={() => m.mutate()}>{m.isPending ? 'Verbinde …' : 'Verbinden'}</Button></>}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <Segmented value={kind} onChange={setKind} options={[{ value: 'caldav', label: 'CalDAV (lesen & schreiben)' }, { value: 'ics', label: 'ICS-Link (nur lesen)' }]} />
        {kind === 'caldav' ? (
          <>
            <Field label="Server-Adresse" htmlFor="cu" hint="Nextcloud: https://cloud.example.de/remote.php/dav · iCloud: https://caldav.icloud.com · mailbox.org: https://dav.mailbox.org">
              <Input id="cu" required type="url" value={f.url} onChange={set('url')} className="font-mono text-[13px]" />
            </Field>
            <Field label="Benutzername" htmlFor="cn"><Input id="cn" required autoComplete="off" value={f.username} onChange={set('username')} /></Field>
            <Field label="App-Passwort" htmlFor="cp" hint="Wird verschlüsselt gespeichert."><Input id="cp" required type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
          </>
        ) : (
          <Field label="ICS-Adresse" htmlFor="iu" hint="Google: Kalendereinstellungen → „Privatadresse im iCal-Format“. Outlook: Kalender veröffentlichen → ICS-Link. Proton: Kalender teilen → Link.">
            <Input id="iu" required value={f.url} onChange={set('url')} placeholder="https://… oder webcal://…" className="font-mono text-[13px]" />
          </Field>
        )}
        <Field label="Name (optional)" htmlFor="nm"><Input id="nm" value={f.name} onChange={set('name')} placeholder={kind === 'caldav' ? 'z. B. Nextcloud' : 'z. B. Google privat'} /></Field>
        <ErrorBox error={m.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function Relogin({ conn, onClose }: { conn: Connection | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const m = useMutation({
    mutationFn: () => api<Connection>(`/api/calendars/${conn!.id}`, { method: 'PATCH', body: { password } }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['calendars'] }); setPassword(''); if (c.status === 'ok') { onClose(); toast('Wieder verbunden') } },
  })
  return (
    <Dialog open={!!conn} onOpenChange={(o) => !o && onClose()} title={`${conn?.name ?? ''} neu anmelden`} description={conn ? `Benutzer: ${conn.username}` : undefined} footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button variant="primary" disabled={!password || m.isPending} onClick={() => m.mutate()}>Speichern</Button></>}>
      <Field label="Neues App-Passwort" htmlFor="rp"><Input id="rp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {m.data?.status === 'error' && <p className="mt-3 text-sm text-danger">{m.data.lastError}</p>}
      <div className="mt-3"><ErrorBox error={m.error} /></div>
    </Dialog>
  )
}

export function CalendarStatusCard() {
  const q = useConnections()
  return (
    <Card className="p-5">
      <SectionHeader title="Abgleich mit Kalendern" />
      {q.data?.length ? (
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          {q.data.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <span className={cn('size-2 rounded-full', c.status === 'ok' ? 'bg-ok' : c.status === 'error' ? 'bg-warn-line' : 'bg-line-strong')} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.status === 'error' ? <Badge tone="warn">getrennt</Badge> : <span className="text-muted">{since(c.lastSyncAt)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Noch kein Kalender verbunden. Termine aus deinem Kalender werden dann automatisch ausgespart.</p>
      )}
      <Link to="/admin/einstellungen/kalender" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">Kalender verwalten</Link>
    </Card>
  )
}
