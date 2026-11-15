import { Bot, CalendarDays, Check, Eye, Fingerprint, KeyRound, Link2, Mail, Palette, Plus, Send, ShieldCheck, Trash2, Upload, Webhook } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { aiLog, host } from '../data/mock'
import { cn } from '../lib/cn'
import { setAccentHue } from '../lib/theme'
import { Avatar, Badge, Button, Card, CopyButton, Dialog, Field, Input, SectionHeader, Select, Switch, Textarea, toast } from '../ui'
import { PageHeader } from './AdminShell'

const sections = [
  { id: 'profil', label: 'Profil & Marke', icon: Palette },
  { id: 'kalender', label: 'Kalender', icon: CalendarDays },
  { id: 'email', label: 'E-Mail', icon: Mail },
  { id: 'ki', label: 'KI & MCP', icon: Bot },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'datenschutz', label: 'Datenschutz', icon: ShieldCheck },
  { id: 'sicherheit', label: 'Anmeldung & Sicherheit', icon: KeyRound },
]

export function Einstellungen() {
  const { tab = 'profil' } = useParams()
  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="grid gap-8 xl:grid-cols-[200px_1fr]">
        <nav aria-label="Einstellungen" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 xl:mx-0 xl:flex-col xl:overflow-visible xl:px-0">
          {sections.map((s) => (
            <NavLink
              key={s.id}
              to={`/admin/einstellungen/${s.id}`}
              className={cn('press flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted hover:bg-surface-2 hover:text-fg', tab === s.id && 'bg-surface-2 text-fg')}
            >
              <s.icon className="size-4 shrink-0" aria-hidden /> {s.label}
            </NavLink>
          ))}
        </nav>
        <div key={tab} className="enter min-w-0">
          {tab === 'profil' && <Profil />}
          {tab === 'kalender' && <Kalender />}
          {tab === 'email' && <EMail />}
          {tab === 'ki' && <KI />}
          {tab === 'webhooks' && <Webhooks />}
          {tab === 'datenschutz' && <Datenschutz />}
          {tab === 'sicherheit' && <Sicherheit />}
        </div>
      </div>
    </>
  )
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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
const hues = [
  { h: 172, n: 'Petrol' },
  { h: 250, n: 'Blau' },
  { h: 290, n: 'Violett' },
  { h: 15, n: 'Ziegel' },
  { h: 60, n: 'Bernstein' },
  { h: 140, n: 'Grün' },
]

function Profil() {
  const [hue, setHue] = useState(172)
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <SectionHeader title="Profil" description="So erscheinst du auf deinen Buchungsseiten." />
        <div className="mt-5 flex items-center gap-4">
          <Avatar name={host.name} size={64} />
          <Button size="sm"><Upload /> Foto ändern</Button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="pn"><Input id="pn" defaultValue={host.name} /></Field>
          <Field label="Untertitel" htmlFor="pr"><Input id="pr" defaultValue={`${host.role} · ${host.company}`} /></Field>
          <Field label="Dein Link" htmlFor="ph" className="sm:col-span-2" hint="Ändern bricht alte Links nicht, sie leiten 12 Monate weiter.">
            <div className="flex items-center rounded-[10px] border border-line bg-sunken text-[15px] shadow-xs">
              <span className="hidden pl-3 text-muted sm:inline">{host.domain}/</span>
              <input id="ph" defaultValue={host.handle} className="h-10 min-w-0 flex-1 rounded-r-[10px] bg-surface px-3 outline-none" />
            </div>
          </Field>
        </div>
      </Card>
      <Card className="p-6">
        <SectionHeader title="Akzentfarbe" description="Für Buttons, freie Tage und Mails. Wird sofort übernommen." />
        <div className="mt-5 flex flex-wrap gap-3" role="radiogroup" aria-label="Akzentfarbe">
          {hues.map((c) => (
            <button
              key={c.h}
              role="radio"
              aria-checked={hue === c.h}
              aria-label={c.n}
              onClick={() => { setHue(c.h); setAccentHue(c.h) }}
              className={cn('press flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-surface', hue === c.h && 'ring-2 ring-fg')}
              style={{ background: `oklch(0.52 0.1 ${c.h})` }}
            >
              {hue === c.h && <Check className="size-5 text-white" />}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ---------------- Kalender ---------------- */
function Kalender() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <SectionHeader title="Verbundene Kalender" description="Belegte Zeiten werden ausgespart, neue Termine eingetragen." />
          <Button size="sm" onClick={() => setOpen(true)}><Plus /> Verbinden</Button>
        </div>
        <ul className="divide-y divide-line">
          <li className="flex flex-wrap items-center gap-4 px-6 py-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2"><CalendarDays className="size-5 text-muted" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Nextcloud <span className="font-normal text-muted">· CalDAV</span></p>
              <p className="text-sm text-warn-fg">Anmeldung abgelehnt (401) · seit 2 Std. getrennt</p>
            </div>
            <Badge tone="warn">Prüft & trägt ein</Badge>
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Neu anmelden</Button>
          </li>
          <li className="flex flex-wrap items-center gap-4 px-6 py-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2"><Link2 className="size-5 text-muted" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Proton Privat <span className="font-normal text-muted">· ICS-Abo</span></p>
              <p className="text-sm text-muted">Zuletzt abgeglichen vor 4 Min.</p>
            </div>
            <Badge>Nur prüfen</Badge>
            <Button size="sm" variant="ghost">Bearbeiten</Button>
          </li>
        </ul>
      </Card>
      <Card className="p-6">
        <SectionHeader title="Neue Termine eintragen in" />
        <div className="mt-4 max-w-sm">
          <Select defaultValue="nc"><option value="nc">Nextcloud → „Termine“</option><option>Nicht eintragen (nur .ics per Mail)</option></Select>
        </div>
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Kalender verbinden"
        description="Funktioniert mit Nextcloud, iCloud, mailbox.org, Fastmail, Posteo und jedem CalDAV-Server."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button><Button variant="primary" onClick={() => { setOpen(false); toast('Verbunden, 3 Kalender gefunden') }}>Verbinden</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Field label="Server-Adresse" htmlFor="cu" hint="Bei iCloud: caldav.icloud.com"><Input id="cu" defaultValue="https://cloud.example.de/remote.php/dav" className="font-mono text-[13px]" /></Field>
          <Field label="Benutzername" htmlFor="cn"><Input id="cn" defaultValue="beispiel" /></Field>
          <Field label="App-Passwort" htmlFor="cp" hint="Lege in deinem Kalender ein eigenes App-Passwort an, nicht dein Hauptpasswort."><Input id="cp" type="password" /></Field>
        </div>
      </Dialog>
    </div>
  )
}

/* ---------------- E-Mail ---------------- */
const templates = [
  { id: 'booked', n: 'Buchung bestätigt', to: 'Gast' },
  { id: 'request', n: 'Anfrage eingegangen', to: 'Gast' },
  { id: 'reminder', n: 'Erinnerung', to: 'Gast' },
  { id: 'resched', n: 'Termin verschoben', to: 'Gast' },
  { id: 'cancel', n: 'Termin abgesagt', to: 'Gast' },
  { id: 'host-new', n: 'Neue Buchung', to: 'Du' },
]

function EMail() {
  const [tpl, setTpl] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <SectionHeader title="Versand (SMTP)" description="termind verschickt alle Mails über dein eigenes Postfach, deine Domain bleibt der Absender." action={<Badge tone="ok"><Check className="size-3.5" /> Funktioniert</Badge>} />
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Server" htmlFor="sh"><Input id="sh" defaultValue="mail.your-server.de" /></Field>
          <Field label="Port" htmlFor="sp"><Input id="sp" defaultValue="587" className="tabular" /></Field>
          <Field label="Benutzer" htmlFor="su"><Input id="su" defaultValue="termine@example.de" /></Field>
          <Field label="Verschlüsselung" htmlFor="ss"><Select id="ss" defaultValue="starttls"><option value="starttls">STARTTLS</option><option>SSL/TLS</option></Select></Field>
          <Field label="Passwort" htmlFor="spw" className="sm:col-span-2"><Input id="spw" type="password" defaultValue="••••••••••••" /></Field>
          <Field label="Absendername" htmlFor="sn"><Input id="sn" defaultValue="Lena Berger" /></Field>
          <Field label="Antworten an" htmlFor="sr"><Input id="sr" defaultValue="hallo@example.de" /></Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => toast('Testmail an hallo@example.de gesendet')}><Send /> Testmail senden</Button>
          <Button variant="primary" onClick={() => toast('Gespeichert')}>Speichern</Button>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-6 py-4">
          <SectionHeader title="Texte der Mails" description="Layout und Logo sind fest, damit jede Mail gut aussieht und ankommt. Texte kannst du frei anpassen." />
        </div>
        <ul className="divide-y divide-line">
          {templates.map((t) => (
            <li key={t.id}>
              <button onClick={() => setTpl(t.id)} className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-surface-2/60">
                <Mail className="size-4 text-subtle" aria-hidden />
                <span className="flex-1 text-sm font-medium">{t.n}</span>
                <span className="text-[13px] text-muted">an {t.to}</span>
                <Eye className="size-4 text-subtle" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={!!tpl} onOpenChange={(o) => !o && setTpl(null)} wide title={templates.find((t) => t.id === tpl)?.n ?? ''} description="Platzhalter: {vorname} {termin} {datum} {uhrzeit} {ort} {link}" footer={<><Button variant="ghost" onClick={() => setTpl(null)}>Abbrechen</Button><Button variant="primary" onClick={() => { setTpl(null); toast('Text gespeichert') }}>Speichern</Button></>}>
        <TemplateEditor />
      </Dialog>
    </div>
  )
}

function TemplateEditor() {
  const [subject, setSubject] = useState('Bestätigt: {termin} am {datum}')
  const [body, setBody] = useState('Hallo {vorname},\n\ndanke für deine Buchung! Ich freue mich auf unser Gespräch.\n\nDen Link zum Videocall findest du unten. Falls etwas dazwischenkommt, kannst du den Termin jederzeit über die Buttons verschieben oder absagen.\n\nBis bald\nLena')
  const fill = (s: string) => s.replace(/{vorname}/g, 'Clara').replace(/{termin}/g, 'Orientierungsgespräch').replace(/{datum}/g, '17. November').replace(/{uhrzeit}/g, '10:00').replace(/{ort}/g, 'Videocall')
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Field label="Betreff" htmlFor="tsub"><Input id="tsub" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Text" htmlFor="tbody"><Textarea id="tbody" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-64 text-sm" /></Field>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium">Vorschau</p>
        <div className="overflow-hidden rounded-xl border border-line bg-[#f6f4ef] text-[#24221f]">
          <div className="border-b border-black/5 bg-white px-4 py-2.5 text-xs text-[#6b665e]">{fill(subject)}</div>
          <div className="p-4">
            <div className="rounded-lg bg-white p-4 text-[13px] leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="mb-3 h-1 w-8 rounded-full bg-accent" />
              <p className="whitespace-pre-line">{fill(body)}</p>
              <div className="mt-4 rounded-md border border-black/10 p-3">
                <p className="font-semibold">Orientierungsgespräch</p>
                <p className="text-[#6b665e]">Di., 17. November · 10:00–10:30</p>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg">Videocall beitreten</span>
                <span className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs">Verschieben</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- KI & MCP ---------------- */
function KI() {
  const [tokenOpen, setTokenOpen] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="p-6">
          <SectionHeader title="Mit einer KI verbinden" description="Füge diese Adresse in einem MCP-fähigen KI-Assistenten als Connector ein. Die Anmeldung bestätigst du einmal im Browser." />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <code className="flex h-10 min-w-0 flex-1 items-center truncate rounded-[10px] border border-line bg-sunken px-3 font-mono text-[13px]">https://{host.domain}/mcp</code>
            <CopyButton value={`https://${host.domain}/mcp`} label="Kopieren" size="md" />
          </div>
        </div>
        <div className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
          {[
            { t: 'Lesen', d: 'Termine, freie Zeiten, Terminseiten, Einstellungen' },
            { t: 'Verwalten', d: 'Terminseiten, Verfügbarkeit, Ausnahmen, Buchungen anlegen' },
            { t: 'Mit Rückfrage', d: 'Absagen, Verschieben, Löschen, Mails an Gäste' },
          ].map((x) => (
            <div key={x.t} className="bg-surface p-4">
              <p className="text-sm font-medium">{x.t}</p>
              <p className="mt-1 text-[13px] text-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <SectionHeader title="Zugänge" description="Verbundene Assistenten und API-Schlüssel." />
          <Button size="sm" onClick={() => setTokenOpen(true)}><Plus /> API-Schlüssel</Button>
        </div>
        <ul className="divide-y divide-line">
          {[
            { n: 'KI-Assistent (Web)', k: 'Connector', s: 'Verwalten', last: 'vor 1 Std.' },
            { n: 'n8n Automatisierung', k: 'API-Schlüssel', s: 'Verwalten', last: 'gestern' },
            { n: 'Entwickler-Werkzeug', k: 'API-Schlüssel', s: 'Nur lesen', last: 'vor 3 Tagen' },
          ].map((c) => (
            <li key={c.n} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2"><Bot className="size-4 text-muted" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.n}</p>
                <p className="text-[13px] text-muted">{c.k} · zuletzt aktiv {c.last}</p>
              </div>
              <Badge tone={c.s === 'Nur lesen' ? 'neutral' : 'accent'}>{c.s}</Badge>
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger">Entziehen</Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="border-b border-line px-6 py-4">
          <SectionHeader title="KI-Protokoll" description="Alles, was ein Assistent in deinem Namen getan hat." />
        </div>
        <ol className="px-6 py-2">
          {aiLog.map((l) => (
            <li key={l.id} className="relative flex gap-4 py-3 pl-6 before:absolute before:top-0 before:bottom-0 before:left-[5px] before:w-px before:bg-line first:before:top-5 last:before:bottom-auto last:before:h-5">
              <span className={cn('absolute top-[18px] left-0 size-[11px] rounded-full border-2 border-surface', l.kind === 'read' ? 'bg-line-strong' : l.kind === 'confirm' ? 'bg-warn-line' : 'bg-accent')} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm"><span className="font-medium">{l.action}</span> <span className="text-muted">· {l.client}</span></p>
                <p className="mt-0.5 text-[13px] text-muted">{l.detail}</p>
              </div>
              <time className="shrink-0 text-[13px] text-subtle tabular">{new Date(l.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
            </li>
          ))}
        </ol>
      </Card>

      <Dialog open={tokenOpen} onOpenChange={setTokenOpen} title="Neuer API-Schlüssel" footer={<><Button variant="ghost" onClick={() => setTokenOpen(false)}>Abbrechen</Button><Button variant="primary" onClick={() => { setTokenOpen(false); toast('Schlüssel erstellt, nur jetzt sichtbar') }}>Erstellen</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="tn" hint="Damit du später weißt, wofür er ist."><Input id="tn" placeholder="z. B. n8n, Skript" /></Field>
          <Field label="Rechte" htmlFor="tr"><Select id="tr"><option>Nur lesen</option><option>Verwalten (mit Rückfrage bei Gast-Mails)</option></Select></Field>
        </div>
      </Dialog>
    </div>
  )
}

/* ---------------- Webhooks ---------------- */
function Webhooks() {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <SectionHeader title="Webhooks" description="Bei jedem Ereignis eine signierte Nachricht an deine Automatisierung." />
        <Button size="sm"><Plus /> Webhook</Button>
      </div>
      <ul className="divide-y divide-line">
        <li className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[13px]">https://n8n.example.de/webhook/termind</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['gebucht', 'angefragt', 'abgesagt', 'verschoben'].map((e) => <Badge key={e}>{e}</Badge>)}
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[13px] text-muted"><span className="size-2 rounded-full bg-ok" /> 48 zugestellt, 0 Fehler</span>
          <Button size="sm" variant="ghost">Protokoll</Button>
        </li>
      </ul>
    </Card>
  )
}

/* ---------------- Datenschutz ---------------- */
function Datenschutz() {
  const [consent, setConsent] = useState(true)
  return (
    <div className="flex flex-col gap-6">
      <Card className="divide-y divide-line px-6 py-5">
        <Row title="Vergangene Termine anonymisieren nach" hint="Name, E-Mail und Antworten werden entfernt. Die Statistik bleibt.">
          <Select defaultValue="12" className="w-44"><option value="3">3 Monaten</option><option value="6">6 Monaten</option><option value="12">12 Monaten</option><option value="24">24 Monaten</option></Select>
        </Row>
        <Row title="Einwilligung auf der Buchungsseite" hint="Häkchen mit Link zu deiner Datenschutzerklärung.">
          <Switch label="Einwilligung abfragen" checked={consent} onCheckedChange={setConsent} />
        </Row>
        <Row title="Links für Impressum & Datenschutz">
          <div className="flex w-72 flex-col gap-2">
            <Input aria-label="Impressum" defaultValue="https://example.de/impressum" />
            <Input aria-label="Datenschutz" defaultValue="https://example.de/datenschutz" />
          </div>
        </Row>
      </Card>
      <Card className="p-6">
        <SectionHeader title="Auskunft & Löschung" description="Für Anfragen nach Art. 15 und 17 DSGVO: alle Daten zu einer E-Mail-Adresse exportieren oder löschen." />
        <div className="mt-4 flex flex-wrap gap-2">
          <Input aria-label="E-Mail-Adresse" placeholder="name@beispiel.de" className="w-72" />
          <Button>Exportieren</Button>
          <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger"><Trash2 /> Löschen</Button>
        </div>
      </Card>
    </div>
  )
}

/* ---------------- Sicherheit ---------------- */
function Sicherheit() {
  const [twofa, setTwofa] = useState(true)
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <SectionHeader title="Passkeys" description="Anmelden mit Face ID, Touch ID oder Windows Hello. Ohne Passwort." />
          <Button size="sm" variant="primary"><Fingerprint /> Hinzufügen</Button>
        </div>
        <ul className="divide-y divide-line">
          {[{ n: 'MacBook Pro', d: 'iCloud-Schlüsselbund · zuletzt heute' }, { n: 'iPhone', d: 'iCloud-Schlüsselbund · zuletzt vor 2 Tagen' }].map((p) => (
            <li key={p.n} className="flex items-center gap-3 px-6 py-3.5">
              <Fingerprint className="size-4 text-subtle" aria-hidden />
              <div className="flex-1"><p className="text-sm font-medium">{p.n}</p><p className="text-[13px] text-muted">{p.d}</p></div>
              <Button size="sm" variant="ghost">Entfernen</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="divide-y divide-line px-6 py-5">
        <Row title="Passwort" hint="Zuletzt geändert vor 3 Monaten."><Button size="sm">Ändern</Button></Row>
        <Row title="Zwei-Faktor-Anmeldung" hint="Code aus einer Authenticator-App zusätzlich zum Passwort."><Switch label="Zwei-Faktor-Anmeldung" checked={twofa} onCheckedChange={setTwofa} /></Row>
        <Row title="Team" hint="Weitere Gastgeber mit eigenen Terminseiten einladen."><Button size="sm"><Plus /> Einladen</Button></Row>
      </Card>
    </div>
  )
}
