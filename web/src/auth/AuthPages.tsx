import { startAuthentication } from '@simplewebauthn/browser'
import { useMutation } from '@tanstack/react-query'
import { Fingerprint, KeyRound } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../admin/AdminShell'
import { api, errorMessage } from '../lib/api'
import { browserTz } from '../lib/format'
import { Button, Field, Input } from '../ui'
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

export function SetupPage() {
  const auth = useAuth()
  const refresh = useRefreshAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', email: '', password: '', instanceName: '', timezone: browserTz() })
  const setupToken = new URLSearchParams(location.search).get('token') ?? ''
  const m = useMutation({
    mutationFn: () => api('/api/auth/setup', { body: { ...f, instanceName: f.instanceName || f.name, setupToken } }),
    onSuccess: async () => {
      await refresh()
      nav('/admin?willkommen=1')
    },
  })
  if (auth.data?.setupComplete) return <Navigate to="/admin" replace />
  if (!setupToken) {
    return (
      <AuthCard title="Einrichtungslink nötig" subtitle="Damit niemand Fremdes deine neue termind-Installation übernimmt, lässt sich das erste Konto nur mit dem Einrichtungslink anlegen.">
        <p className="text-[15px] text-muted">Du findest ihn im Server-Log, zum Beispiel mit:</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-sunken p-4 font-mono text-[13px] ring-1 ring-line ring-inset">docker compose logs termind | grep setup</pre>
      </AuthCard>
    )
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <AuthCard title="Willkommen bei termind" subtitle="Lege dein Konto an. Danach richtest du den Mail-Versand und deine erste Terminseite ein.">
      <form className="flex flex-col gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate() }}>
        <Field label="Dein Name" htmlFor="name"><Input id="name" required autoComplete="name" value={f.name} onChange={set('name')} /></Field>
        <Field label="E-Mail" htmlFor="email" hint="Damit meldest du dich an. Hierhin gehen auch Benachrichtigungen."><Input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Passwort" htmlFor="pw" hint="Mindestens 10 Zeichen. Passkey und Zwei-Faktor-Anmeldung kannst du danach ergänzen."><Input id="pw" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <Field label="Firmen- oder Anzeigename (optional)" htmlFor="inst" hint="Erscheint als Absender in deinen Mails, z. B. dein Firmenname."><Input id="inst" value={f.instanceName} placeholder={f.name || 'z. B. Berger Coaching'} onChange={set('instanceName')} /></Field>
        <Field label="Zeitzone" htmlFor="tz"><Input id="tz" value={f.timezone} onChange={set('timezone')} /></Field>
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
  const second = useMutation({ mutationFn: () => api('/api/auth/second-factor', { body: { code } }), onSuccess: done })
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
      <AuthCard title="Bestätigungscode" subtitle="Gib den 6-stelligen Code aus deiner Authenticator-App ein.">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); second.mutate() }}>
          <Field label="Code" htmlFor="code">
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required pattern="[0-9 ]{6,7}" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 text-center text-xl tracking-[0.3em] tabular" />
          </Field>
          <ErrorText error={second.error} />
          <Button type="submit" variant="primary" size="lg" disabled={second.isPending}>Anmelden</Button>
          <Button type="button" variant="ghost" onClick={async () => { await api('/api/auth/logout', { body: {} }); refresh() }}>Abbrechen</Button>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Anmelden">
      <div className="flex flex-col gap-4">
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
        </form>
      </div>
    </AuthCard>
  )
}
