import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Badge, Button, Card, Dialog, Field, Input, SectionHeader, Segmented, Textarea, toast } from '../ui'
import { ErrorBox } from './AdminShell'

type Locale = 'de' | 'en'
interface Texts { subject: string; intro: string }
interface TemplateInfo {
  id: string
  label: string
  to: 'guest' | 'host'
  de: { default: Texts; custom: Partial<Texts> | null }
  en: { default: Texts; custom: Partial<Texts> | null }
}

export function MailTexte() {
  const q = useQuery({ queryKey: ['mail-texts'], queryFn: () => api<{ placeholders: string[]; templates: TemplateInfo[] }>('/api/settings/mail-texts') })
  const [open, setOpen] = useState<TemplateInfo | null>(null)
  return (
    <Card>
      <div className="border-b border-line px-6 py-4">
        <SectionHeader title="Texte der Mails" description="Layout, Akzentfarbe und Termin-Details sind fest, damit jede Mail gut aussieht und ankommt. Betreff und Einleitung kannst du frei formulieren." />
      </div>
      <ErrorBox error={q.error} />
      <ul className="divide-y divide-line">
        {q.data?.templates.map((t) => {
          const changed = !!(t.de.custom || t.en.custom)
          return (
            <li key={t.id}>
              <button onClick={() => setOpen(t)} className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2/60">
                <Mail className="size-4 shrink-0 text-subtle" aria-hidden />
                <span className="flex-1 text-sm font-medium">{t.label}</span>
                {changed && <Badge tone="accent">Eigener Text</Badge>}
                <span className="hidden text-[13px] text-muted sm:inline">an {t.to === 'guest' ? 'Gast' : 'dich'}</span>
                <PenLine className="size-4 text-subtle" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
      {open && q.data && <Editor t={open} placeholders={q.data.placeholders} onClose={() => setOpen(null)} />}
    </Card>
  )
}

function Editor({ t, placeholders, onClose }: { t: TemplateInfo; placeholders: string[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [locale, setLocale] = useState<Locale>('de')
  const [v, setV] = useState<Texts>({ subject: '', intro: '' })
  const focused = useRef<'subject' | 'intro'>('intro')
  useEffect(() => {
    const d = t[locale]
    setV({ subject: d.custom?.subject ?? d.default.subject, intro: d.custom?.intro ?? d.default.intro })
  }, [t, locale])

  // Vorschau leicht verzögert neu rendern
  const [debounced, setDebounced] = useState(v)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(v), 250)
    return () => clearTimeout(id)
  }, [v])
  const preview = useQuery({
    queryKey: ['mail-preview', t.id, locale, debounced],
    queryFn: () => api<{ subject: string; html: string }>(`/api/settings/mail-texts/${t.id}/${locale}/preview`, { body: debounced }),
    placeholderData: (prev) => prev,
  })

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ['mail-texts'] })
    toast(msg)
    onClose()
  }
  const isDefault = v.subject === t[locale].default.subject && v.intro === t[locale].default.intro
  const save = useMutation({
    mutationFn: () => (isDefault ? api(`/api/settings/mail-texts/${t.id}/${locale}`, { method: 'DELETE' }) : api(`/api/settings/mail-texts/${t.id}/${locale}`, { method: 'PUT', body: v })),
    onSuccess: () => done('Text gespeichert'),
  })
  const insert = (ph: string) => {
    const k = focused.current
    setV((x) => ({ ...x, [k]: x[k] + (x[k].endsWith(' ') || !x[k] ? '' : ' ') + ph }))
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      wide
      title={t.label}
      description={`Mail an ${t.to === 'guest' ? 'den Gast' : 'dich'}. Darunter folgen automatisch Termin-Details und Buttons.`}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setV(t[locale].default)} disabled={isDefault}>Standardtext</Button>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>Speichern</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented size="sm" value={locale} onChange={setLocale} options={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label="Betreff" htmlFor="ms"><Input id="ms" value={v.subject} onFocus={() => (focused.current = 'subject')} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
            <Field label="Einleitung" htmlFor="mi" hint="Steht nach „Hallo {vorname},“. Leerzeile = neuer Absatz.">
              <Textarea id="mi" value={v.intro} onFocus={() => (focused.current = 'intro')} onChange={(e) => setV({ ...v, intro: e.target.value })} className="min-h-40 text-sm" />
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-medium">Platzhalter einfügen</p>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map((p) => (
                  <button key={p} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p)} className="press h-7 rounded-md border border-line bg-surface px-2 font-mono text-[12px] text-muted hover:border-line-strong hover:text-fg">{p}</button>
                ))}
              </div>
            </div>
            <ErrorBox error={save.error} />
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-[13px] font-medium">Vorschau</p>
            <div className="overflow-hidden rounded-xl border border-line bg-[#f5f3ee]">
              <p className="truncate border-b border-black/5 bg-white px-3 py-2 text-xs text-[#5f5a52]">{preview.data?.subject ?? ' '}</p>
              <iframe title="Vorschau der Mail" sandbox="allow-same-origin" srcDoc={preview.data?.html ?? ''} className="h-[380px] w-full bg-[#f5f3ee]" />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
