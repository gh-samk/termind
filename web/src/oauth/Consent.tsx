import { useMutation, useQuery } from '@tanstack/react-query'
import { Bot, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Logo } from '../admin/AdminShell'
import { useAuth } from '../auth/useAuth'
import { api, errorMessage } from '../lib/api'
import { cn } from '../lib/cn'
import { Button } from '../ui'

interface Req { clientName: string; redirectHost: string; scope: 'read' | 'write'; instanceName: string }

/** Zustimmung, wenn ein KI-Assistent (Web, App, ChatGPT …) sich per OAuth verbinden will. */
export function ConsentPage() {
  const auth = useAuth()
  const id = new URLSearchParams(location.search).get('req') ?? ''
  const q = useQuery({ queryKey: ['oauth-req', id], queryFn: () => api<Req>(`/api/oauth/requests/${encodeURIComponent(id)}`), enabled: !!auth.data?.user, retry: false })
  const [scope, setScope] = useState<'read' | 'write'>('write')
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<{ redirect: string }>(`/api/oauth/requests/${encodeURIComponent(id)}/decision`, { body: { approve, scope: q.data?.scope === 'read' ? 'read' : scope } }),
    onSuccess: (r) => window.location.assign(r.redirect),
  })

  if (auth.isLoading) return null
  if (!auth.data?.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="enter w-full max-w-[440px]">
        <Logo />
        {q.isError ? (
          <div className="mt-8">
            <h1 className="font-display text-[26px] leading-tight">Anfrage abgelaufen</h1>
            <p className="mt-2 text-muted">{errorMessage(q.error)} Bitte starte die Verbindung im KI-Assistenten noch einmal.</p>
          </div>
        ) : q.data ? (
          <>
            <div className="mt-8 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg"><Bot className="size-5" /></span>
              <div>
                <h1 className="font-display text-[24px] leading-tight">{q.data.clientName}</h1>
                <p className="text-sm text-muted">möchte auf {q.data.instanceName} zugreifen</p>
              </div>
            </div>
            <p className="mt-6 text-[15px] text-muted">Nach deiner Zustimmung leitet termind zurück zu <span className="font-medium text-fg">{q.data.redirectHost}</span>. Den Namen „{q.data.clientName}“ hat die App selbst angegeben. Erlaube nur, wenn du die Verbindung gerade selbst gestartet hast und die Adresse passt. Du kannst den Zugang jederzeit unter Einstellungen → KI & MCP entziehen.</p>
            <fieldset className="mt-6 flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Rechte</legend>
              {(q.data.scope === 'write' ? (['write', 'read'] as const) : (['read'] as const)).map((s) => (
                <label key={s} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4', scope === s || q.data!.scope === 'read' ? 'border-accent bg-accent-soft/40 ring-1 ring-accent' : 'border-line hover:border-line-strong')}>
                  <input type="radio" name="scope" className="mt-1 size-4 accent-[var(--accent)]" checked={q.data!.scope === 'read' ? true : scope === s} onChange={() => setScope(s)} />
                  <span>
                    <span className="block text-sm font-semibold">{s === 'write' ? 'Verwalten' : 'Nur lesen'}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">{s === 'write' ? 'Termine, freie Zeiten, Terminseiten und Verfügbarkeit lesen und ändern. Mails an Gäste und Löschen nur nach Vorschau und deiner Zustimmung im Chat.' : 'Termine, freie Zeiten und Einstellungen lesen. Nichts ändern.'}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-subtle"><ShieldCheck className="size-3.5" /> Jede Aktion landet im KI-Protokoll.</p>
            {decide.isError && <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">{errorMessage(decide.error)}</p>}
            <div className="mt-6 flex gap-2">
              <Button variant="primary" size="lg" className="flex-1" disabled={decide.isPending} onClick={() => decide.mutate(true)}>Erlauben</Button>
              <Button variant="secondary" size="lg" disabled={decide.isPending} onClick={() => decide.mutate(false)}>Ablehnen</Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
