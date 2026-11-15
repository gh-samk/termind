import { startRegistration } from '@simplewebauthn/browser'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bot, CalendarDays, Check, Download, Fingerprint, KeyRound, Mail, Palette, Plug, Plus, RotateCw, Send, ShieldCheck, Webhook } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useAuth, useRefreshAuth } from '../auth/useAuth'
import { portAfterSecurityChange, providerForHost, SMTP_PROVIDERS, type SmtpSecurity } from '@shared/smtpProviders'
import { EmbedCard } from '../components/EmbedCard'
import { TimezonePicker } from '../components/TimezonePicker'
import { api, errorMessage } from '../lib/api'
import { ACCENT_HUES } from '../lib/colors'
import { cn } from '../lib/cn'
import { setAccentHue } from '../lib/theme'
import { Avatar, Badge, Button, Card, ConfirmDialog, CopyButton, Dialog, Field, Hint, Input, SaveBar, SectionHeader, Select, Switch, toast, useFieldProps } from '../ui'
import { ErrorBox, PageHeader } from './AdminShell'
import { KalenderSettings } from './Kalender'
import { MailTexte } from './MailTexte'
import { PrivacyTools, WebhooksSettings } from './WebhooksPrivacy'
import type { SettingsData } from './types'
import { useUnsavedGuard } from './unsaved'

const sections = [
  { id: 'profil', label: 'Profil & Marke', icon: Palette },
  { id: 'email', label: 'E-Mail', icon: Mail },
  { id: 'kalender', label: 'Kalender', icon: CalendarDays },
  { id: 'datenschutz', label: 'Datenschutz', icon: ShieldCheck },
  { id: 'sicherheit', label: 'Anmeldung & Sicherheit', icon: KeyRound },
]
/* Für die meisten nicht nötig: eigene Gruppe am Ende */
const advanced = [
  { id: 'ki', label: 'KI & MCP', icon: Bot },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
]
const allSections = [...sections, ...advanced]

export function Einstellungen() {
  const { tab = 'profil' } = useParams()
  const nav = useNavigate()
  if (!allSections.some((s) => s.id === tab)) return <Navigate to="/admin/einstellungen/profil" replace />
  const link = (s: (typeof sections)[number]) => (
    <NavLink key={s.id} to={`/admin/einstellungen/${s.id}`} className={cn('press flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted hover:bg-surface-2 hover:text-fg', tab === s.id && 'bg-surface-2 text-fg')}>
      <s.icon className="size-4 shrink-0" aria-hidden /> {s.label}
    </NavLink>
  )
  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="grid gap-8 xl:grid-cols-[200px_minmax(0,1fr)]">
        <div className="sm:hidden">
          <Select aria-label="Bereich der Einstellungen" value={tab} onChange={(e) => nav(`/admin/einstellungen/${e.target.value}`)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            <optgroup label="Erweitert">
              {advanced.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
          </Select>
        </div>
        <nav aria-label="Einstellungen" className="hidden flex-wrap items-center gap-1 sm:flex xl:flex-col xl:items-stretch xl:flex-nowrap">
          {sections.map(link)}
          <div role="group" aria-labelledby="adv-label" className="flex flex-wrap items-center gap-1 sm:ml-3 sm:border-l sm:border-line sm:pl-3 xl:ml-0 xl:mt-4 xl:flex-col xl:items-stretch xl:border-t xl:border-l-0 xl:pt-4 xl:pl-0">
            <span id="adv-label" className="px-3 text-xs font-medium tracking-wide text-subtle uppercase xl:pb-1">Erweitert</span>
            {advanced.map(link)}
          </div>
        </nav>
        <div key={tab} className="enter min-w-0">
          {tab === 'profil' && <Profil />}
          {tab === 'kalender' && <KalenderSettings />}
          {tab === 'email' && <EMail />}
          {tab === 'ki' && <KI />}
          {tab === 'webhooks' && <WebhooksSettings />}
          {tab === 'datenschutz' && <Datenschutz />}
          {tab === 'sicherheit' && <Sicherheit />}
        </div>
      </div>
    </>
  )
}

function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsData>('/api/settings') })
}

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="max-w-[46ch]">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/* ---------------- Profil & Marke ---------------- */

/** Eingabe für den eigenen Link-Namen, verknüpft Hinweis und Pflichtmarkierung des umgebenden Field. */
function HandleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const a11y = useFieldProps('ph', {})
  return <input id="ph" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} className="h-10 min-w-0 flex-1 rounded-[10px] bg-surface px-3 outline-none sm:rounded-l-none" {...a11y} />
}

function Profil() {
  const me = useAuth().data!.user!
  const refresh = useRefreshAuth()
  const qc = useQueryClient()
  const s = useSettings()
  const [p, setP] = useState({ name: me.name, subtitle: me.subtitle, handle: me.handle, timezone: me.timezone })
  // Stand des zuletzt gespeicherten Profils, damit „ungespeichert“ sofort nach dem Speichern verschwindet
  const [saved, setSaved] = useState(p)
  const dirty = JSON.stringify(p) !== JSON.stringify(saved)
  const [instanceName, setInstanceName] = useState('')
  const brandLoaded = useRef(false)
  const instanceDirty = !!s.data && brandLoaded.current && instanceName !== s.data.branding.instanceName
  const guard = useUnsavedGuard(dirty || instanceDirty)
  useEffect(() => {
    if (s.data && !brandLoaded.current) {
      brandLoaded.current = true
      setInstanceName(s.data.branding.instanceName)
    }
  }, [s.data])

  const saveProfile = useMutation({
    mutationFn: () => api('/api/me', { method: 'PATCH', body: p }),
    onSuccess: () => { setSaved(p); refresh(); qc.invalidateQueries({ queryKey: ['schedule'] }); qc.invalidateQueries({ queryKey: ['slots'] }); toast('Profil gespeichert') },
  })
  const saveBrand = useMutation({
    mutationFn: (b: { accentHue?: number; instanceName?: string }) => api('/api/settings/branding', { method: 'PUT', body: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['instance'] }) },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <SectionHeader title="Profil" description="So erscheinst du auf deinen Buchungsseiten." />
        <form id="profil-form" className="mt-5" onSubmit={(e) => { e.preventDefault(); saveProfile.mutate() }}>
          <div className="flex items-center gap-4"><Avatar name={p.name || '?'} size={56} /></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="pn" required><Input id="pn" required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
            <Field label="Untertitel" htmlFor="ps"><Input id="ps" placeholder="z. B. Beratung für Sichtbarkeit" value={p.subtitle} onChange={(e) => setP({ ...p, subtitle: e.target.value })} /></Field>
            <Field label="Zeitzone" htmlFor="ptz" required className="sm:col-span-2" hint="Danach richten sich alle Uhrzeiten im Admin-Bereich und deine Verfügbarkeit. Hast du nur einen Verfügbarkeitsplan, wird er mit umgestellt: Deine Zeiten (z. B. 9–17 Uhr) gelten dann in der neuen Zeitzone."><TimezonePicker id="ptz" value={p.timezone} onChange={(timezone) => setP({ ...p, timezone })} /></Field>
            <Field label="Dein Link" htmlFor="ph" required className="sm:col-span-2" hint="Achtung: Alte Links funktionieren nach einer Änderung nicht mehr.">
              <div className="flex items-center rounded-[10px] border border-line bg-sunken text-[15px] shadow-xs focus-within:border-accent">
                <span className="hidden pl-3 text-muted sm:inline">{location.host}/</span>
                <HandleInput value={p.handle} onChange={(v) => setP({ ...p, handle: v })} />
              </div>
            </Field>
          </div>
          <div className="mt-5"><ErrorBox error={saveProfile.error} /></div>
          <Button type="submit" variant="primary" className="mt-2" disabled={saveProfile.isPending}>Speichern</Button>
        </form>
      </Card>
      {me.role === 'owner' && <ChecklistRow />}
      <EmbedCard path={me.handle} title="Deine Profilseite einbetten" description="Zeigt alle deine Terminseiten auf deiner Webseite, zur Auswahl für deine Kundschaft. Für eine einzelne Terminseite gibt es den Code in ihren Einstellungen." />
      {me.role === 'owner' && s.data && (
        <Card className="p-6">
          <SectionHeader title="Marke" description="Akzentfarbe für Buttons, freie Tage und Mails. Wird sofort übernommen." />
          <div className="mt-5 flex flex-wrap gap-3" role="radiogroup" aria-label="Akzentfarbe">
            {ACCENT_HUES.map((c) => {
              const sel = s.data!.branding.accentHue === c.h
              return (
                <button key={c.h} role="radio" aria-checked={sel} aria-label={c.n} onClick={() => { setAccentHue(c.h); saveBrand.mutate({ accentHue: c.h }) }} className={cn('press flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-surface', sel && 'ring-2 ring-fg')} style={{ background: `oklch(0.52 0.1 ${c.h})` }}>
                  {sel && <Check className="size-5 text-white" />}
                </button>
              )
            })}
          </div>
          <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); saveBrand.mutate({ instanceName }, { onSuccess: () => toast('Gespeichert') }) }}>
            <Field label="Firmen- oder Anzeigename" htmlFor="in" required hint="Erscheint als Absender in deinen Mails und bei der Passkey-Anmeldung." className="min-w-[240px] flex-1"><Input id="in" required value={instanceName} onChange={(e) => setInstanceName(e.target.value)} /></Field>
            <Button type="submit">Speichern</Button>
          </form>
        </Card>
      )}
      <SaveBar show={dirty} pending={saveProfile.isPending} formId="profil-form" />
      {guard.dialog}
    </div>
  )
}

/* ---------------- E-Mail ---------------- */

function EMail() {
  const me = useAuth().data!.user!
  const qc = useQueryClient()
  const s = useSettings()
  const [f, setF] = useState({ host: '', port: 587, security: 'starttls' as SmtpSecurity, user: me.email, password: '', fromName: me.name, fromEmail: me.email, replyTo: '' })
  const [provider, setProvider] = useState('')
  const smtpLoaded = useRef(false)
  useEffect(() => {
    // Nur einmal übernehmen, Hintergrund-Aktualisierungen (Mail-Zähler) überschreiben keine Eingaben
    if (s.data?.smtp && !smtpLoaded.current) {
      smtpLoaded.current = true
      setF((x) => ({ ...x, ...s.data!.smtp!, password: '' }))
      setProvider(providerForHost(s.data.smtp.host)?.id ?? 'other')
    }
  }, [s.data])
  const afterSave = () => { qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['onboarding'] }) }
  const save = useMutation({
    mutationFn: () => api('/api/settings/smtp', { method: 'PUT', body: { ...f, host: f.host.trim(), port: Number(f.port), password: f.password || undefined } }),
    onSuccess: () => { afterSave(); setF((x) => ({ ...x, password: '' })); toast('Gespeichert') },
  })
  const check = useMutation({
    mutationFn: () => api('/api/settings/smtp/check', { body: { host: f.host.trim(), port: Number(f.port), security: f.security, user: f.user, password: f.password || undefined } }),
  })
  const test = useMutation({ mutationFn: () => api('/api/settings/smtp/test', { body: { to: me.email } }), onSuccess: () => { afterSave(); toast(`Testmail an ${me.email} gesendet`) } })
  const retry = useMutation({ mutationFn: () => api('/api/settings/mail/retry', { body: {} }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast('Mails werden erneut gesendet') }, onError: (e) => toast.error(errorMessage(e)) })
  /** Jede Änderung macht das Ergebnis des letzten Tests ungültig */
  const patch = (p: Partial<typeof f>) => { check.reset(); test.reset(); setF((x) => ({ ...x, ...p })) }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => patch({ [k]: e.target.value })
  const pickProvider = (id: string) => {
    setProvider(id)
    const p = SMTP_PROVIDERS.find((x) => x.id === id)
    if (!p) return
    // Server nur ersetzen, wenn der Anbieter einen kennt oder der bisherige Eintrag von einem anderen Anbieter stammt
    const host = p.host || (providerForHost(f.host) ? '' : f.host)
    patch({ host, port: p.port, security: p.security, user: f.user || me.email, fromEmail: f.fromEmail || me.email })
  }
  if (me.role !== 'owner') return <p className="text-sm text-muted">Nur die Inhaberin oder der Inhaber von termind kann den Mail-Versand einrichten.</p>
  const mail = s.data?.mail
  const chosen = SMTP_PROVIDERS.find((p) => p.id === provider)
  const lastOk = s.data?.lastSmtpOk

  return (
    <div className="flex flex-col gap-6">
      {mail && (mail.failed > 0 || (mail.queued > 0 && mail.lastError)) && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4 text-warn-fg">
          <AlertTriangle className="mt-0.5 size-[18px] shrink-0" />
          <div className="min-w-[220px] flex-1 text-sm">
            <p className="font-semibold">{mail.failed + mail.queued} Mail(s) warten auf Versand.</p>
            <p className="mt-0.5 opacity-90">Letzter Fehler: {mail.lastError}</p>
          </div>
          <Button size="sm" onClick={() => retry.mutate()}><RotateCw /> Jetzt erneut senden</Button>
        </div>
      )}
      <Card className="p-6">
        <SectionHeader title="Mail-Versand über dein Postfach (SMTP)" description={<>termind verschickt alle Mails über dein eigenes Postfach, deine Adresse bleibt der Absender. <Hint label="SMTP">SMTP ist die Technik, mit der E-Mails verschickt werden. Die Angaben dazu findest du bei deinem Mail-Anbieter, meist unter „Postausgangsserver“ oder „SMTP“.</Hint></>} action={s.data?.smtp ? <Badge tone="ok"><Check className="size-3.5" /> Eingerichtet</Badge> : <Badge tone="warn">Fehlt noch</Badge>} />
        <form className="mt-5" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <Field label="Mein Anbieter" htmlFor="sprov" hint={chosen?.note ?? 'Wähle deinen Anbieter, dann tragen wir Server, Port und Verschlüsselung für dich ein.'}>
            <Select id="sprov" value={provider} onChange={(e) => pickProvider(e.target.value)}>
              <option value="">Bitte wählen …</option>
              {SMTP_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Postausgangsserver" htmlFor="sh" required><Input id="sh" required placeholder="z. B. smtp.mailbox.org" value={f.host} onChange={set('host')} /></Field>
            <Field label="Port" htmlFor="sp" required><Input id="sp" required type="number" value={f.port} onChange={set('port')} className="tabular" /></Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Benutzername" htmlFor="su" hint="Meist deine volle E-Mail-Adresse."><Input id="su" autoComplete="off" value={f.user} onChange={set('user')} /></Field>
            <Field label="Verschlüsselung" htmlFor="ss" help="Fast alle Anbieter nutzen „Sicher verbinden (STARTTLS)“ mit Port 587 oder „Von Anfang an verschlüsselt (SSL/TLS)“ mit Port 465. Welche Variante passt, steht bei deinem Anbieter. „Unverschlüsselt“ solltest du nicht wählen. Beim Wechsel passt termind den Port an, wenn du keinen eigenen eingetragen hast.">
              <Select id="ss" value={f.security} onChange={(e) => { const security = e.target.value as SmtpSecurity; patch({ security, port: portAfterSecurityChange(Number(f.port), security) }) }}><option value="starttls">Sicher verbinden (STARTTLS, meist Port 587)</option><option value="tls">Von Anfang an verschlüsselt (SSL/TLS, meist Port 465)</option><option value="none">Unverschlüsselt (nicht empfohlen)</option></Select>
            </Field>
            {f.security === 'none' && (
              <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn-fg sm:col-span-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Ohne Verschlüsselung wird dein Passwort im Klartext übertragen und kann mitgelesen werden. Wähle das nur für einen eigenen Server im lokalen Netz.</p>
            )}
            <Field label="Passwort" htmlFor="spw" className="sm:col-span-2" hint={s.data?.smtp?.hasPassword ? 'Gespeichert. Leer lassen = gespeichertes behalten, nur bei gleichem Server, Port und Benutzer. Ändert sich eines davon, gib das Passwort neu ein.' : 'Wird verschlüsselt gespeichert.'}>
              <Input id="spw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} placeholder={s.data?.smtp?.hasPassword ? '••••••••••••' : ''} />
            </Field>
            <Field label="Absendername" htmlFor="sn" required><Input id="sn" required value={f.fromName} onChange={set('fromName')} /></Field>
            <Field label="Absender-Adresse" htmlFor="sf" required><Input id="sf" required type="email" placeholder="termine@deine-domain.de" value={f.fromEmail} onChange={set('fromEmail')} /></Field>
            <Field label="Antworten an (optional)" htmlFor="sr" className="sm:col-span-2"><Input id="sr" type="email" value={f.replyTo} onChange={set('replyTo')} /></Field>
          </div>
          <div className="mt-5 flex flex-col gap-3" aria-live="polite">
            <ErrorBox error={save.error ?? test.error ?? check.error} />
            {check.isSuccess && <p role="status" className="flex items-start gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-fg"><Check className="mt-0.5 size-4 shrink-0" aria-hidden /> Verbindung und Anmeldung klappen. Speichere die Angaben und sende dir danach eine Testmail.</p>}
            {test.isSuccess && <p role="status" className="flex items-start gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-fg"><Check className="mt-0.5 size-4 shrink-0" aria-hidden /> Testmail an {me.email} gesendet. Schau in dein Postfach (und den Spam-Ordner).</p>}
            {!test.isSuccess && lastOk && s.data?.smtp && <p className="text-[13px] text-muted">Letzte erfolgreiche Testmail: {new Date(lastOk).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
            <Button type="button" disabled={!f.host.trim() || check.isPending} onClick={() => check.mutate()}><Plug /> {check.isPending ? 'Prüfe …' : 'Verbindung testen'}</Button>
            <Button type="button" disabled={!s.data?.smtp || test.isPending} onClick={() => test.mutate()}><Send /> Testmail an mich</Button>
          </div>
          <p className="mt-3 text-[13px] text-muted">„Verbindung testen“ prüft Server, Port und Anmeldung mit den Werten oben, noch ohne zu speichern. Die Testmail geht an die gespeicherten Werte.</p>
        </form>
      </Card>
      <MailTexte />
    </div>
  )
}

/* ---------------- KI & MCP ---------------- */

interface Token { id: string; name: string; scope: 'read' | 'write'; prefix: string; lastUsedAt: string | null; createdAt: string }
interface AuditRow { id: string; at: string; actorType: string; client: string | null; action: string; detail: string; kind: 'read' | 'write' | 'confirm' }

function KI() {
  const me = useAuth().data!.user!
  const qc = useQueryClient()
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: () => api<Token[]>('/api/tokens') })
  const log = useQuery({ queryKey: ['audit'], queryFn: () => api<AuditRow[]>('/api/audit'), enabled: me.role === 'owner' })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'read' | 'write'>('write')
  const [created, setCreated] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: () => api<{ token: string }>('/api/tokens', { body: { name, scope } }),
    onSuccess: (r) => { setCreated(r.token); qc.invalidateQueries({ queryKey: ['tokens'] }) },
  })
  const [revokeTok, setRevokeTok] = useState<Token | null>(null)
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tokens'] }); setRevokeTok(null); toast('Zugang entzogen') },
    onError: (e) => { setRevokeTok(null); toast.error(errorMessage(e)) },
  })
  const mcpUrl = `${location.origin}/mcp`
  const aiLog = (log.data ?? []).filter((l) => l.actorType === 'token')

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="p-6">
          <SectionHeader title="Mit einem KI-Assistenten verbinden" description={<>Füge diese Adresse in deinem KI-Assistenten als eigenen Connector hinzu. Die Anmeldung bestätigst du einmal hier im Browser. <Hint label="Connector, OAuth und MCP">Ein Connector ist eine Verbindung, über die ein KI-Assistent auf termind zugreifen darf. „MCP“ ist der Standard dafür, „OAuth“ die sichere Anmeldung dabei: Du gibst kein Passwort weiter und kannst den Zugang jederzeit entziehen.</Hint></>} />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <code className="flex h-10 min-w-0 flex-1 items-center truncate rounded-[10px] border border-line bg-sunken px-3 font-mono text-[13px]">{mcpUrl}</code>
            <CopyButton value={mcpUrl} label="Kopieren" size="md" />
          </div>
          <p className="mt-3 text-[13px] text-muted">Im Assistenten: Einstellungen → Connectors → Eigenen Connector hinzufügen → Adresse einfügen → Verbinden.</p>
        </div>
        <div className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
          {[
            { t: 'Lesen', d: 'Termine, freie Zeiten, Terminseiten, Verfügbarkeit' },
            { t: 'Verwalten', d: 'Terminseiten, Wochenzeiten, Ausnahmen, Notizen' },
            { t: 'Mit Rückfrage', d: 'Buchen, Absagen, Verschieben, Löschen. Erst Vorschau, dann deine Zustimmung' },
          ].map((x) => (
            <div key={x.t} className="bg-surface p-4">
              <p className="text-sm font-medium">{x.t}</p>
              <p className="mt-1 text-[13px] text-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </Card>

      <Grants />

      <Card>
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <SectionHeader title="API-Schlüssel" description={<>Zugang für eigene Skripte und Automatisierungen. <Hint label="API-Schlüssel">Ein API-Schlüssel ist wie ein Passwort für ein Programm. Wer ihn kennt, darf damit auf termind zugreifen, gib ihn deshalb nicht weiter.</Hint></>} />
          <Button size="sm" variant="primary" onClick={() => { setName(''); setCreated(null); setOpen(true) }}><Plus /> Neuer Schlüssel</Button>
        </div>
        {tokens.data?.length === 0 && <p className="px-6 py-6 text-sm text-muted">Für eigene Skripte. KI-Assistenten verbindest du oben ohne Schlüssel.</p>}
        <ul className="divide-y divide-line">
          {tokens.data?.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2"><Bot className="size-4 text-muted" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-[13px] text-muted"><code className="font-mono">{t.prefix}…</code> · {t.lastUsedAt ? `zuletzt aktiv ${new Date(t.lastUsedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : 'noch nie benutzt'}</p>
              </div>
              <Badge tone={t.scope === 'read' ? 'neutral' : 'accent'}>{t.scope === 'read' ? 'Nur lesen' : 'Verwalten'}</Badge>
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setRevokeTok(t)}>Entziehen</Button>
            </li>
          ))}
        </ul>
      </Card>

      {me.role === 'owner' && (
        <Card>
          <div className="border-b border-line px-6 py-4">
            <SectionHeader title="Protokoll der Assistenten" description="Alles, was ein KI-Assistent in deinem Namen gelesen oder getan hat." />
          </div>
          {aiLog.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted">Noch keine Aktivität eines Assistenten.</p>
          ) : (
            <ol className="px-6 py-2">
              {aiLog.slice(0, 50).map((l) => (
                <li key={l.id} className="relative flex gap-4 py-3 pl-6 before:absolute before:top-0 before:bottom-0 before:left-[5px] before:w-px before:bg-line first:before:top-5 last:before:bottom-auto last:before:h-5">
                  <span className={cn('absolute top-[18px] left-0 size-[11px] rounded-full border-2 border-surface', l.kind === 'read' ? 'bg-line-strong' : l.kind === 'confirm' ? 'bg-warn-line' : 'bg-accent')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><span className="font-medium">{l.action}</span> <span className="text-muted">· {l.client}</span></p>
                    {l.detail && <p className="mt-0.5 truncate text-[13px] text-muted">{l.detail}</p>}
                  </div>
                  <time className="shrink-0 text-[13px] text-subtle tabular">{new Date(l.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={!!revokeTok}
        onOpenChange={(o) => !o && setRevokeTok(null)}
        title="API-Schlüssel entziehen?"
        description={revokeTok ? `Programme, die den Schlüssel „${revokeTok.name}“ nutzen, haben danach keinen Zugriff mehr auf termind. Das lässt sich nicht rückgängig machen, du kannst aber einen neuen Schlüssel anlegen.` : undefined}
        confirmLabel="Entziehen"
        cancelLabel="Behalten"
        pending={revoke.isPending}
        onConfirm={() => revokeTok && revoke.mutate(revokeTok.id)}
      />

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={created ? 'Dein neuer Schlüssel' : 'Neuer API-Schlüssel'}
        description={created ? 'Kopiere ihn jetzt. Er wird nur dieses eine Mal angezeigt.' : undefined}
        footer={created ? <Button variant="primary" onClick={() => setOpen(false)}>Fertig</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button><Button variant="primary" disabled={!name || create.isPending} onClick={() => create.mutate()}>Erstellen</Button></>}
      >
        {created ? (
          <div className="flex flex-col gap-3">
            <code className="block rounded-xl border border-line bg-sunken p-3 font-mono text-[13px] break-all">{created}</code>
            <CopyButton value={created} label="Schlüssel kopieren" size="md" variant="primary" />
            <details className="text-sm text-muted">
              <summary className="cursor-pointer font-medium text-fg">So trägst du ihn in einem Desktop-Client ein</summary>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-sunken p-3 font-mono text-[12px] leading-relaxed text-fg">{JSON.stringify({ mcpServers: { termind: { command: 'npx', args: ['-y', 'mcp-remote', mcpUrl, '--header', `Authorization: Bearer ${created}`] } } }, null, 2)}</pre>
            </details>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Name" htmlFor="tn" required hint="Damit du später weißt, wofür er ist."><Input id="tn" autoFocus placeholder="z. B. Desktop-Client" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Rechte" htmlFor="tr">
              <Select id="tr" value={scope} onChange={(e) => setScope(e.target.value as 'read' | 'write')}>
                <option value="write">Verwalten (Gast-Mails und Löschen nur mit Rückfrage)</option>
                <option value="read">Nur lesen</option>
              </Select>
            </Field>
            <ErrorBox error={create.error} />
          </div>
        )}
      </Dialog>
    </div>
  )
}

function Grants() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['grants'], queryFn: () => api<{ id: string; clientName: string; scope: 'read' | 'write'; lastUsedAt: string | null; createdAt: string }[]>('/api/oauth/grants') })
  const [target, setTarget] = useState<{ id: string; clientName: string } | null>(null)
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/oauth/grants/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grants'] }); setTarget(null); toast('Zugang entzogen') },
    onError: (e) => { setTarget(null); toast.error(errorMessage(e)) },
  })
  if (!q.data?.length) return null
  return (
    <Card>
      <div className="border-b border-line px-6 py-4"><SectionHeader title="Verbundene Assistenten" description="Diese KI-Assistenten hast du per Anmeldung (OAuth) verbunden. Der Zugang bleibt bestehen, bis du ihn entziehst." /></div>
      <ul className="divide-y divide-line">
        {q.data.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2"><Bot className="size-4 text-muted" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{g.clientName}</p>
              <p className="text-[13px] text-muted">{g.lastUsedAt ? `zuletzt aktiv ${new Date(g.lastUsedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : `verbunden ${new Date(g.createdAt).toLocaleDateString('de-DE')}`}</p>
            </div>
            <Badge tone={g.scope === 'read' ? 'neutral' : 'accent'}>{g.scope === 'read' ? 'Nur lesen' : 'Verwalten'}</Badge>
            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setTarget(g)}>Entziehen</Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Assistenten entziehen?"
        description={target ? `„${target.clientName}“ kann danach nichts mehr in termind lesen oder ändern. Du kannst den Assistenten später wieder neu verbinden.` : undefined}
        confirmLabel="Entziehen"
        cancelLabel="Behalten"
        pending={revoke.isPending}
        onConfirm={() => target && revoke.mutate(target.id)}
      />
    </Card>
  )
}

/* ---------------- Datenschutz ---------------- */

function Datenschutz() {
  const qc = useQueryClient()
  const s = useSettings()
  const [imprintUrl, setImprint] = useState('')
  const [privacyUrl, setPrivacy] = useState('')
  const linksLoaded = useRef(false)
  useEffect(() => {
    if (s.data && !linksLoaded.current) {
      linksLoaded.current = true
      setImprint(s.data.branding.imprintUrl)
      setPrivacy(s.data.branding.privacyUrl)
    }
  }, [s.data])
  const save = useMutation({
    mutationFn: (b: object) => api('/api/settings/branding', { method: 'PUT', body: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['instance'] }); toast('Gespeichert') },
  })
  if (!s.data) return <ErrorBox error={s.error} />
  return (
    <div className="flex flex-col gap-6">
      <Card className="divide-y divide-line px-6 py-5">
        <Row title="Einwilligung auf der Buchungsseite" hint="Häkchen mit Link zu deiner Datenschutzerklärung. Ohne Häkchen ist keine Buchung möglich.">
          <Switch label="Einwilligung abfragen" checked={s.data.branding.consentRequired} onCheckedChange={(v) => save.mutate({ consentRequired: v })} />
        </Row>
        <Row title="Impressum & Datenschutz" hint="Erscheinen unten auf jeder Buchungsseite.">
          <form className="flex w-72 max-w-full flex-col gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate({ imprintUrl, privacyUrl }) }}>
            <Input aria-label="Link zum Impressum" type="url" placeholder="https://…/impressum" value={imprintUrl} onChange={(e) => setImprint(e.target.value)} />
            <Input aria-label="Link zur Datenschutzerklärung" type="url" placeholder="https://…/datenschutz" value={privacyUrl} onChange={(e) => setPrivacy(e.target.value)} />
            <Button type="submit" size="sm" className="self-start">Speichern</Button>
          </form>
        </Row>
      </Card>
      <ErrorBox error={save.error} />
      <PrivacyTools />
      <p className="text-[13px] text-muted">termind setzt auf Buchungsseiten keine Cookies und lädt nichts von fremden Servern. Schriften und Code kommen von deinem eigenen Server.</p>
    </div>
  )
}

/* ---------------- Sicherheit ---------------- */

interface Passkey { id: string; name: string; createdAt: string; lastUsedAt: string | null }

function Sicherheit() {
  const me = useAuth().data!.user!
  const refresh = useRefreshAuth()
  const qc = useQueryClient()
  const keys = useQuery({ queryKey: ['passkeys'], queryFn: () => api<Passkey[]>('/api/passkeys') })
  const addKey = useMutation({
    mutationFn: async () => {
      const { options, challengeId } = await api<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; challengeId: string }>('/api/passkeys/options', { body: {} })
      const response = await startRegistration({ optionsJSON: options })
      return api('/api/passkeys', { body: { challengeId, response } })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['passkeys'] }); toast('Passkey hinzugefügt') },
  })
  const [removeKey, setRemoveKey] = useState<Passkey | null>(null)
  const delKey = useMutation({
    mutationFn: (id: string) => api(`/api/passkeys/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['passkeys'] }); setRemoveKey(null); toast('Passkey entfernt') },
    onError: (e) => { setRemoveKey(null); toast.error(errorMessage(e)) },
  })
  const logoutOthers = useMutation({
    mutationFn: () => api('/api/security/logout-others', { body: {} }),
    onSuccess: () => toast('Andere Sitzungen beendet'),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const [pwOpen, setPwOpen] = useState(false)
  const [totpOpen, setTotpOpen] = useState(false)
  const [offOpen, setOffOpen] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [renewOpen, setRenewOpen] = useState(false)
  const backup = useQuery({ queryKey: ['backup-codes'], queryFn: () => api<{ remaining: number }>('/api/security/backup-codes'), enabled: me.totpEnabled })
  const renew = useMutation({
    mutationFn: () => api<{ backupCodes: string[] }>('/api/security/backup-codes', { body: { password: renewPw } }),
    onSuccess: (r) => { setRenewOpen(false); setRenewPw(''); setCodes(r.backupCodes); qc.invalidateQueries({ queryKey: ['backup-codes'] }) },
  })
  const [renewPw, setRenewPw] = useState('')

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <SectionHeader title="Passkeys" description="Anmelden mit Face ID, Touch ID oder Windows Hello. Ohne Passwort." />
          <Button size="sm" variant="primary" disabled={addKey.isPending} onClick={() => addKey.mutate()}><Fingerprint /> Hinzufügen</Button>
        </div>
        {addKey.isError && !/NotAllowed|abort/i.test(String(addKey.error)) && <div className="px-6 pt-4"><ErrorBox error={addKey.error} /></div>}
        {keys.data?.length === 0 && <p className="px-6 py-6 text-sm text-muted">Noch kein Passkey. Damit meldest du dich schneller und sicherer an.</p>}
        <ul className="divide-y divide-line">
          {keys.data?.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-6 py-3.5">
              <Fingerprint className="size-4 text-subtle" aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-[13px] text-muted">{p.lastUsedAt ? `zuletzt benutzt ${new Date(p.lastUsedAt).toLocaleDateString('de-DE')}` : `angelegt ${new Date(p.createdAt).toLocaleDateString('de-DE')}`}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRemoveKey(p)}>Entfernen</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="divide-y divide-line px-6 py-5">
        <Row title="Passwort" hint="Beim Ändern werden alle anderen Sitzungen beendet."><Button size="sm" onClick={() => setPwOpen(true)}>Ändern</Button></Row>
        <Row title="Andere Geräte abmelden" hint="Beendet alle Sitzungen außer dieser, z. B. nach Verlust eines Geräts.">
          <Button size="sm" disabled={logoutOthers.isPending} onClick={() => logoutOthers.mutate()}>Abmelden</Button>
        </Row>
        <Row title="Zwei-Faktor-Anmeldung" hint="Code aus einer Authenticator-App zusätzlich zum Passwort.">
          {me.totpEnabled ? (
            <div className="flex items-center gap-2"><Badge tone="ok"><Check className="size-3.5" /> Aktiv</Badge><Button size="sm" variant="ghost" onClick={() => setOffOpen(true)}>Ausschalten</Button></div>
          ) : (
            <Button size="sm" onClick={() => setTotpOpen(true)}>Einrichten</Button>
          )}
        </Row>
        {me.totpEnabled && (
          <Row title="Ersatzcodes" hint="Für den Fall, dass dein Handy weg ist: Mit einem dieser Codes meldest du dich einmalig ohne die App an. Bewahre sie getrennt vom Handy auf, z. B. im Passwortmanager oder ausgedruckt.">
            <div className="flex flex-wrap items-center gap-2">
              {backup.data && <Badge tone={backup.data.remaining <= 2 ? 'warn' : 'neutral'}>{backup.data.remaining === 0 ? 'Keine mehr übrig' : backup.data.remaining === 1 ? 'Noch 1 Code übrig' : `Noch ${backup.data.remaining} Codes übrig`}</Badge>}
              <Button size="sm" onClick={() => setRenewOpen(true)}>Neue Codes erzeugen</Button>
            </div>
          </Row>
        )}
      </Card>
      <ConfirmDialog
        open={!!removeKey}
        onOpenChange={(o) => !o && setRemoveKey(null)}
        title="Passkey entfernen?"
        description={removeKey ? `Mit „${removeKey.name}“ kannst du dich danach nicht mehr anmelden. Dein Passwort und andere Passkeys bleiben gültig.` : undefined}
        confirmLabel="Entfernen"
        cancelLabel="Behalten"
        pending={delKey.isPending}
        onConfirm={() => removeKey && delKey.mutate(removeKey.id)}
      />
      <PasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      <TotpDialog open={totpOpen} onOpenChange={setTotpOpen} onDone={refresh} onCodes={(c) => { setCodes(c); qc.invalidateQueries({ queryKey: ['backup-codes'] }) }} />
      <BackupCodesDialog codes={codes} email={me.email} onClose={() => setCodes(null)} />
      <Dialog
        open={renewOpen}
        onOpenChange={(o) => { setRenewOpen(o); if (!o) { setRenewPw(''); renew.reset() } }}
        title="Neue Ersatzcodes erzeugen?"
        description="Deine bisherigen Ersatzcodes funktionieren danach nicht mehr. Die neuen siehst du einmal, speichere sie gleich."
        footer={<><Button variant="ghost" onClick={() => setRenewOpen(false)}>Abbrechen</Button><Button variant="primary" disabled={renew.isPending || !renewPw} onClick={() => renew.mutate()}>Neue Codes erzeugen</Button></>}
      >
        <form onSubmit={(e) => { e.preventDefault(); if (renewPw) renew.mutate() }}>
          <Field label="Zur Bestätigung dein Passwort" htmlFor="rpw"><Input id="rpw" type="password" autoFocus autoComplete="current-password" value={renewPw} onChange={(e) => setRenewPw(e.target.value)} /></Field>
          <div className="mt-3"><ErrorBox error={renew.error} /></div>
        </form>
      </Dialog>
      <TotpOffDialog open={offOpen} onOpenChange={setOffOpen} onDone={refresh} />
    </div>
  )
}

function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const m = useMutation({ mutationFn: () => api('/api/security/password', { body: { current, next } }), onSuccess: () => { onOpenChange(false); setCurrent(''); setNext(''); toast('Passwort geändert') } })
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Passwort ändern" footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button><Button variant="primary" disabled={m.isPending || next.length < 10 || !current} onClick={() => m.mutate()}>Ändern</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Aktuelles Passwort" htmlFor="cur"><Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="Neues Passwort" htmlFor="nx" hint="Mindestens 10 Zeichen."><Input id="nx" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <ErrorBox error={m.error} />
      </div>
    </Dialog>
  )
}

function TotpDialog({ open, onOpenChange, onDone, onCodes }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; onCodes: (codes: string[]) => void }) {
  const [code, setCode] = useState('')
  const start = useMutation({ mutationFn: () => api<{ qr: string; secret: string }>('/api/security/totp/start', { body: {} }) })
  const confirm = useMutation({ mutationFn: () => api<{ backupCodes: string[] }>('/api/security/totp/confirm', { body: { code } }), onSuccess: (r) => { onOpenChange(false); onDone(); onCodes(r.backupCodes); toast('Zwei-Faktor-Anmeldung ist aktiv') } })
  useEffect(() => {
    if (open) { setCode(''); start.mutate() }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Zwei-Faktor-Anmeldung einrichten" description="Scanne den Code mit einer Authenticator-App (z. B. 1Password, Aegis, Google Authenticator) und gib den angezeigten Code ein." footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button><Button variant="primary" disabled={code.length < 6 || confirm.isPending} onClick={() => confirm.mutate()}>Aktivieren</Button></>}>
      <div className="flex flex-col items-center gap-4">
        {start.data ? <img src={start.data.qr} alt="QR-Code für die Authenticator-App" className="size-[200px] rounded-xl bg-white p-2" /> : <div className="size-[200px] animate-pulse rounded-xl bg-surface-2" />}
        {start.data && <p className="text-center text-[13px] text-muted">Oder manuell: <code className="font-mono break-all text-fg">{start.data.secret}</code></p>}
        <Input aria-label="Code aus der App" autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 w-48 text-center text-xl tracking-[0.3em] tabular" />
        <ErrorBox error={confirm.error ?? start.error} />
      </div>
    </Dialog>
  )
}

function TotpOffDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const m = useMutation({ mutationFn: () => api('/api/security/totp/disable', { body: { password } }), onSuccess: () => { onOpenChange(false); onDone(); toast('Zwei-Faktor-Anmeldung ausgeschaltet') } })
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Zwei-Faktor-Anmeldung ausschalten?" footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button><Button variant="danger" disabled={m.isPending || !password} onClick={() => m.mutate()}>Ausschalten</Button></>}>
      <Field label="Zur Bestätigung dein Passwort" htmlFor="opw"><Input id="opw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <div className="mt-3"><ErrorBox error={m.error} /></div>
    </Dialog>
  )
}

/** Einmalige Anzeige der Ersatzcodes. Schließen erst nach der Bestätigung, dass sie gesichert sind. */
function BackupCodesDialog({ codes, email, onClose }: { codes: string[] | null; email: string; onClose: () => void }) {
  const [saved, setSaved] = useState(false)
  const [nudge, setNudge] = useState(false)
  const copyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setSaved(false); setNudge(false) }, [codes])
  const text = codes ? codes.join('\n') : ''
  const download = () => {
    const body = `termind Ersatzcodes für ${email}\nErzeugt am ${new Date().toLocaleDateString('de-DE')}\nJeder Code funktioniert genau einmal. Bewahre die Datei getrennt von deinem Handy auf.\n\n${text}\n`
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'termind-ersatzcodes.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <Dialog
      open={!!codes}
      onOpenChange={(o) => { if (!o && saved) onClose(); else if (!o) setNudge(true) }}
      onOpenAutoFocus={(e) => { e.preventDefault(); copyRef.current?.querySelector('button')?.focus() }}
      title="Deine Ersatzcodes"
      description="Mit jedem dieser Codes kannst du dich einmal ohne Authenticator-App anmelden, zum Beispiel wenn dein Handy verloren geht. Du siehst sie nur jetzt."
      footer={<Button variant="primary" disabled={!saved} onClick={onClose}>Fertig</Button>}
    >
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-sunken p-4 font-mono text-[15px] tracking-wider ring-1 ring-line ring-inset" aria-label="Ersatzcodes">
        {codes?.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div ref={copyRef} className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={text} label="Kopieren" />
        <Button size="sm" onClick={download}><Download /> Herunterladen (.txt)</Button>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
        <span>Ich habe die Codes gespeichert.</span>
      </label>
      {nudge && !saved && <p role="alert" className="mt-3 text-sm text-danger">Bitte bestätige erst, dass du die Codes gespeichert hast.</p>}
    </Dialog>
  )
}

/** Ausgeblendete Checkliste „Erste Schritte“ wieder einblenden. */
function ChecklistRow() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['onboarding'], queryFn: () => api<{ hidden: boolean; allDone: boolean }>('/api/onboarding') })
  const show = useMutation({
    mutationFn: () => api('/api/onboarding', { method: 'PUT', body: { hidden: false } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['onboarding'] }); toast('Die Checkliste steht wieder auf der Seite „Termine“') },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (!q.data?.hidden || q.data.allDone) return null
  return (
    <Card className="px-6 py-5">
      <Row title="Erste Schritte" hint="Die Checkliste auf der Seite „Termine“ ist ausgeblendet."><Button size="sm" disabled={show.isPending} onClick={() => show.mutate()}>Wieder einblenden</Button></Row>
    </Card>
  )
}
