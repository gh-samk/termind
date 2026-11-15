import { startAuthentication } from '@simplewebauthn/browser'
import { useMutation } from '@tanstack/react-query'
import { Check, Fingerprint, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../admin/AdminShell'
import { TimezonePicker } from '../components/TimezonePicker'
import { api, errorMessage } from '../lib/api'
import { browserTz } from '../lib/format'
import { Button, CopyButton, Field, Input } from '../ui'
import { useAuth, useRefreshAuth } from './useAuth'

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="enter w-full max-w-[400px]">
        <Logo />
        <h1 className="mt-8 font-display text-[28px] leading-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">{errorMessage(error)}</p>
}

/* ---------------- Ersteinrichtung ---------------- */

/** Aus eingefügtem Text den Code holen: der ganze Link, nur der Code oder „token=…“ */
export function parseSetupCode(input: string) {
  const t = input.trim()
  const m = /[?&]token=([^&\s#]+)/.exec(t)
  if (m) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
  return t.replace(/^["']|["']$/g, '')
}

function Command({ children }: { children: string }) {
  return (
    <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row">
      <pre className="min-w-0 flex-1 rounded-xl bg-sunken p-3 font-mono text-[13px] break-all whitespace-pre-wrap ring-1 ring-line ring-inset">{children}</pre>
      <CopyButton value={children} label="Kopieren" />
    </div>
  )
}

function SetupCodeCard({ onVerified, initialError }: { onVerified: (token: string) => void; initialError?: string }) {
  const [text, setText] = useState('')
  const check = useMutation({
    mutationFn: async () => {
      const token = parseSetupCode(text)
      const r = await api<{ ok: boolean; done: boolean }>('/api/auth/setup/check', { body: { token } })
      if (!r.ok) throw new Error('Dieser Einrichtungscode stimmt nicht. Kopiere ihn noch einmal vollständig aus dem Log, ohne Leerzeichen am Anfang oder Ende.')
      return token
    },
    onSuccess: onVerified,
  })
  return (
    <AuthCard title="Einrichtungscode eingeben" subtitle="Damit niemand Fremdes deine neue termind-Installation übernimmt, lässt sich das erste Konto nur mit einem Einrichtungscode anlegen.">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); check.mutate() }}>
        <Field label="Einrichtungscode einfügen" htmlFor="code" hint="Du kannst den Code oder den ganzen Einrichtungslink einfügen.">
          <Input id="code" required autoFocus autoComplete="off" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[14px]" />
        </Field>
        {initialError && !check.error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">{initialError}</p>}
        <ErrorText error={check.error} />
        <Button type="submit" variant="primary" size="lg" disabled={check.isPending || !text.trim()}>Weiter</Button>
      </form>
      <div className="mt-8 border-t border-line pt-6 text-[15px] text-muted">
        <p className="font-medium text-fg">Wo finde ich den Code?</p>
        <p className="mt-1">Auf dem Server, auf dem termind läuft. Im Ordner mit der Datei <code className="font-mono text-[13px]">docker-compose.yml</code> gibt es zwei Wege:</p>
        <p className="mt-4 text-sm">Der Link aus dem Log (steht dort alle 10 Minuten neu):</p>
        <Command>docker compose logs termind | grep setup</Command>
        <p className="mt-4 text-sm">Oder nur der Code, direkt aus der Datei:</p>
        <Command>docker compose exec termind cat /data/setup-token</Command>
      </div>
    </AuthCard>
  )
}

export function SetupPage() {
  const auth = useAuth()
  const refresh = useRefreshAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', email: '', password: '', instanceName: '', timezone: browserTz() })
  // Den Code nur einmal lesen und danach aus der Adressleiste entfernen (Verlauf, Weitergabe)
  const [urlToken] = useState(() => new URLSearchParams(location.search).get('token') ?? '')
  useEffect(() => {
    if (urlToken) history.replaceState(null, '', location.pathname)
  }, [urlToken])
  const [created, setCreated] = useState(false)
  const [token, setToken] = useState('')
  const [urlError, setUrlError] = useState('')
  const [checking, setChecking] = useState(!!urlToken)
  // Einrichtungslink früh prüfen, bevor jemand das Formular ausfüllt
  const checked = useRef(false)
  useEffect(() => {
    if (!urlToken || checked.current) return
    checked.current = true
    api<{ ok: boolean }>('/api/auth/setup/check', { body: { token: urlToken } })
      .then((r) => (r.ok ? setToken(urlToken) : setUrlError('Dieser Einrichtungslink ist nicht (mehr) gültig. Gib den Einrichtungscode unten von Hand ein.')))
      .catch((e) => setUrlError(errorMessage(e)))
      .finally(() => setChecking(false))
  }, [urlToken])
  const m = useMutation({
    mutationFn: () => api('/api/auth/setup', { body: { ...f, instanceName: f.instanceName || f.name, setupToken: token } }),
    onSuccess: async () => {
      // Erst merken, dass wir gerade eingerichtet haben, sonst leitet die Seite nach dem Aktualisieren ohne Willkommens-Parameter weiter
      setCreated(true)
      await refresh()
      nav('/admin?willkommen=1', { replace: true })
    },
  })
  if (auth.data?.setupComplete && !created) return <Navigate to="/admin" replace />
  if (checking) return null
  if (!token) return <SetupCodeCard onVerified={setToken} initialError={urlError} />
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <AuthCard title="Willkommen bei termind" subtitle="Lege dein Konto an. Danach richtest du den Mail-Versand und deine erste Terminseite ein.">
      <form className="flex flex-col gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate() }}>
        <Field label="Dein Name" htmlFor="name"><Input id="name" required autoComplete="name" value={f.name} onChange={set('name')} /></Field>
        <Field label="E-Mail" htmlFor="email" hint="Damit meldest du dich an. Hierhin gehen auch Benachrichtigungen."><Input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Passwort" htmlFor="pw" hint="Mindestens 10 Zeichen. Passkey und Zwei-Faktor-Anmeldung kannst du danach ergänzen."><Input id="pw" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <Field label="Firmen- oder Anzeigename (optional)" htmlFor="inst" hint="Erscheint als Absender in deinen Mails, z. B. dein Firmenname."><Input id="inst" value={f.instanceName} placeholder={f.name || 'z. B. Berger Coaching'} onChange={set('instanceName')} /></Field>
        <Field label="Zeitzone" htmlFor="tz" hint="Dein Standort. Danach richten sich deine Verfügbarkeit und alle Uhrzeiten im Admin-Bereich."><TimezonePicker id="tz" value={f.timezone} onChange={(timezone) => setF({ ...f, timezone })} /></Field>
        <ErrorText error={m.error} />
        <Button type="submit" variant="primary" size="lg" className="mt-2" disabled={m.isPending}>Konto anlegen</Button>
      </form>
    </AuthCard>
  )
}

/* ---------------- Anmeldung ---------------- */

export function LoginPage() {
  const auth = useAuth()
  const refresh = useRefreshAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [forgot, setForgot] = useState(false)
  // Hinweis „neues Passwort gespeichert“ einmal merken und den Parameter aus der Adresse entfernen
  const [pwChanged] = useState(() => new URLSearchParams(location.search).get('passwort') === 'neu')
  useEffect(() => {
    if (pwChanged) history.replaceState(null, '', location.pathname)
  }, [pwChanged])

  const done = async () => {
    await refresh()
    const next = new URLSearchParams(location.search).get('next') ?? ''
    // Nur interne Pfade, keine offene Weiterleitung
    nav(next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/admin', { replace: true })
  }
  const login = useMutation({
    mutationFn: () => api<{ needsSecondFactor: boolean }>('/api/auth/login', { body: { email, password } }),
    onSuccess: async (r) => (r.needsSecondFactor ? refresh() : done()),
  })
  const second = useMutation({ mutationFn: () => api('/api/auth/second-factor', { body: { code, backup: useBackup } }), onSuccess: done })
  const passkey = useMutation({
    mutationFn: async () => {
      const { options, challengeId } = await api<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; challengeId: string }>('/api/auth/passkey/options', { body: {} })
      const response = await startAuthentication({ optionsJSON: options })
      await api('/api/auth/passkey/verify', { body: { challengeId, response } })
    },
    onSuccess: done,
  })

  if (auth.data && !auth.data.setupComplete) return <Navigate to="/setup" replace />
  if (auth.data?.user) return <Navigate to="/admin" replace />

  if (auth.data?.pendingSecondFactor) {
    return (
      <AuthCard title={useBackup ? 'Ersatzcode' : 'Bestätigungscode'} subtitle={useBackup ? 'Gib einen deiner Ersatzcodes ein, z. B. K7M2P-9XQ4R. Jeder Code funktioniert nur einmal.' : 'Gib den 6-stelligen Code aus deiner Authenticator-App ein.'}>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); second.mutate() }}>
          <Field label={useBackup ? 'Ersatzcode' : 'Code'} htmlFor="code">
            {useBackup ? (
              <Input id="code" key="backup" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus required minLength={10} maxLength={20} placeholder="XXXXX-XXXXX" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 text-center font-mono text-lg tracking-[0.15em] uppercase" />
            ) : (
              <Input id="code" key="totp" inputMode="numeric" autoComplete="one-time-code" autoFocus required pattern="[0-9 ]{6,7}" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 text-center text-xl tracking-[0.3em] tabular" />
            )}
          </Field>
          <ErrorText error={second.error} />
          <Button type="submit" variant="primary" size="lg" disabled={second.isPending}>Anmelden</Button>
          <Button type="button" variant="ghost" onClick={() => { setUseBackup(!useBackup); setCode(''); second.reset() }}>
            {useBackup ? 'Stattdessen Code aus der App eingeben' : 'Ersatzcode verwenden'}
          </Button>
          <Button type="button" variant="ghost" onClick={async () => { await api('/api/auth/logout', { body: {} }); setUseBackup(false); setCode(''); refresh() }}>Abbrechen</Button>
        </form>
      </AuthCard>
    )
  }

  if (forgot) return <ForgotPassword initialEmail={email} onBack={() => setForgot(false)} />

  return (
    <AuthCard title="Anmelden">
      <div className="flex flex-col gap-4">
        {pwChanged && (
          <p role="status" className="flex items-start gap-3 rounded-xl bg-accent-soft px-4 py-3 text-[15px] text-accent-soft-fg"><Check className="mt-0.5 size-4 shrink-0" aria-hidden /> Dein neues Passwort ist gespeichert. Melde dich jetzt an.</p>
        )}
        <Button variant="secondary" size="lg" onClick={() => passkey.mutate()} disabled={passkey.isPending}>
          <Fingerprint /> Mit Passkey anmelden
        </Button>
        {passkey.isError && !/NotAllowed|abort/i.test(String(passkey.error)) && <ErrorText error={passkey.error} />}
        <div className="my-1 flex items-center gap-3 text-xs text-subtle"><span className="h-px flex-1 bg-line" />oder<span className="h-px flex-1 bg-line" /></div>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); login.mutate() }}>
          <Field label="E-Mail" htmlFor="email"><Input id="email" type="email" required autoComplete="username webauthn" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Passwort" htmlFor="pw"><Input id="pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <ErrorText error={login.error} />
          <Button type="submit" variant="primary" size="lg" disabled={login.isPending}><KeyRound /> Anmelden</Button>
          <button type="button" onClick={() => setForgot(true)} className="press -mt-1 self-center rounded-lg px-2 py-2 text-sm text-muted underline decoration-line-strong underline-offset-2 hover:text-fg">Passwort vergessen?</button>
        </form>
      </div>
    </AuthCard>
  )
}

/* ---------------- Passwort vergessen ---------------- */

function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const m = useMutation({ mutationFn: () => api('/api/auth/password-reset/request', { body: { email } }) })
  const emergency = (
    <div className="mt-4 rounded-xl border border-line px-4 py-3 text-sm text-muted">
      <p className="font-medium text-fg">Kommt keine Mail an, oder kommst du gar nicht mehr hinein?</p>
      <p className="mt-1">Prüfe den Spam-Ordner. Wer den Server betreut, kann dir einen neuen Link erzeugen. Das geht auch, wenn der Mail-Versand nicht eingerichtet ist.</p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium text-fg">Befehl für den Server</summary>
        <Command>docker compose exec termind node server/index.js reset-password du@example.de</Command>
        <p className="mt-2">Ersetze <code className="font-mono text-[13px]">du@example.de</code> durch deine Adresse. Der Link ist 30 Minuten gültig. Mit dem Zusatz <code className="font-mono text-[13px]">--disable-2fa</code> wird auch die Zwei-Faktor-Anmeldung ausgeschaltet, falls dir das Handy fehlt.</p>
      </details>
    </div>
  )
  if (m.isSuccess) {
    return (
      <AuthCard title="Prüfe dein Postfach">
        <p role="status" className="flex items-start gap-3 rounded-xl bg-accent-soft px-4 py-3 text-[15px] text-accent-soft-fg"><Check className="mt-0.5 size-4 shrink-0" aria-hidden /> Wenn ein Konto existiert, ist eine Mail unterwegs. Der Link darin ist 30 Minuten gültig.</p>
        {emergency}
        <Button variant="ghost" className="mt-6 w-full" onClick={onBack}>Zurück zur Anmeldung</Button>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Passwort vergessen?" subtitle="Gib die E-Mail-Adresse deines Kontos ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <Field label="E-Mail" htmlFor="femail"><Input id="femail" type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <ErrorText error={m.error} />
        <Button type="submit" variant="primary" size="lg" disabled={m.isPending}>Link senden</Button>
        <Button type="button" variant="ghost" onClick={onBack}>Zurück zur Anmeldung</Button>
      </form>
      {emergency}
    </AuthCard>
  )
}

/* ---------------- Neues Passwort (Link aus der Mail) ---------------- */

export function PasswortNeuPage() {
  const nav = useNavigate()
  const refresh = useRefreshAuth()
  // Token aus der Adresse übernehmen und sofort aus der Adressleiste entfernen (Verlauf, Weitergabe)
  const [token] = useState(() => new URLSearchParams(location.search).get('token') ?? '')
  useEffect(() => {
    if (token) history.replaceState(null, '', location.pathname)
  }, [token])
  const [state, setState] = useState<'prüfe' | 'ok' | 'ungültig'>(token ? 'prüfe' : 'ungültig')
  useEffect(() => {
    if (!token) return
    api<{ ok: boolean }>('/api/auth/password-reset/check', { body: { token } })
      .then((r) => setState(r.ok ? 'ok' : 'ungültig'))
      .catch(() => setState('ok')) // bei Netzproblemen das Formular zeigen, der Server prüft beim Absenden erneut
  }, [token])
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const m = useMutation({
    mutationFn: () => api('/api/auth/password-reset/confirm', { body: { token, password: pw } }),
    onSuccess: async () => {
      await refresh()
      nav('/login?passwort=neu', { replace: true })
    },
  })
  if (state === 'prüfe') return null
  if (state === 'ungültig' || (m.isError && /abgelaufen|benutzt/.test(errorMessage(m.error)))) {
    return (
      <AuthCard title="Link nicht mehr gültig" subtitle="Der Link zum Zurücksetzen ist abgelaufen oder wurde schon benutzt. Aus Sicherheitsgründen gilt er nur 30 Minuten und nur einmal.">
        <Link to="/login" className="press inline-flex h-12 w-full items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-fg shadow-xs hover:bg-accent-hover">Neuen Link anfordern</Link>
      </AuthCard>
    )
  }
  const mismatch = pw2.length > 0 && pw !== pw2
  return (
    <AuthCard title="Neues Passwort festlegen" subtitle="Danach wirst du auf allen Geräten abgemeldet und meldest dich mit dem neuen Passwort an. Eine eingerichtete Zwei-Faktor-Anmeldung bleibt bestehen.">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch) m.mutate() }}>
        <Field label="Neues Passwort" htmlFor="npw" hint="Mindestens 10 Zeichen."><Input id="npw" type="password" required minLength={10} maxLength={200} autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Noch einmal" htmlFor="npw2" error={mismatch ? 'Die beiden Passwörter sind nicht gleich.' : undefined}><Input id="npw2" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <ErrorText error={m.error} />
        <Button type="submit" variant="primary" size="lg" disabled={m.isPending || mismatch || pw.length < 10}>Passwort speichern</Button>
      </form>
    </AuthCard>
  )
}
