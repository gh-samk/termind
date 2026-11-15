import * as RDialog from '@radix-ui/react-dialog'
import * as RSwitch from '@radix-ui/react-switch'
import { X, ChevronDown, Check, Copy, AlertTriangle, HelpCircle } from 'lucide-react'
import { createContext, forwardRef, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type AriaAttributes, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-xs',
  secondary: 'bg-surface text-fg border border-line hover:border-line-strong hover:bg-surface-2 shadow-xs',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90 shadow-xs',
  soft: 'bg-accent-soft text-accent-soft-fg hover:brightness-[0.98]',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg pointer-coarse:h-11',
  md: 'h-10 px-4 text-sm gap-2 rounded-[10px] pointer-coarse:h-11',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center pointer-coarse:size-11',
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ className, variant = 'secondary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'press inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

/* ---------------- Form ---------------- */
const fieldBase =
  'w-full rounded-[10px] border border-line bg-surface px-3 text-[15px] text-fg placeholder:text-subtle shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15'

/* Field verknüpft Hinweis- und Fehlertext automatisch mit dem Eingabeelement, dessen id zu htmlFor passt. */
const FieldCtx = createContext<{ htmlFor?: string; describedBy?: string; required?: boolean; invalid?: boolean }>({})

export function useFieldProps(id: string | undefined, own: Pick<AriaAttributes, 'aria-describedby' | 'aria-required' | 'aria-invalid'>) {
  const f = useContext(FieldCtx)
  if (!id || f.htmlFor !== id) return {}
  return {
    'aria-describedby': [own['aria-describedby'], f.describedBy].filter(Boolean).join(' ') || undefined,
    'aria-required': own['aria-required'] ?? (f.required ? true : undefined),
    'aria-invalid': own['aria-invalid'] ?? (f.invalid ? true : undefined),
  }
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...p} {...useFieldProps(p.id, p)} />
))
Input.displayName = 'Input'

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-24 py-2.5 leading-relaxed', className)} {...p} {...useFieldProps(p.id, p)} />
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldBase, 'h-10 appearance-none pr-9', className)} {...p} {...useFieldProps(p.id, p)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle" />
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  help,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  error?: ReactNode
  /** Pflichtfeld: zeigt „Pflicht“ am Label und setzt aria-required */
  required?: boolean
  /** Kurze Erklärung hinter dem „?“-Knopf neben dem Label */
  help?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  const uid = useId()
  const hintId = hint ? `${uid}-hint` : undefined
  const errId = error ? `${uid}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <FieldCtx.Provider value={{ htmlFor, describedBy, required, invalid: !!error }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div className="flex items-center gap-1.5">
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg">
            {label}
            {required && <span className="ml-1.5 text-xs font-normal text-subtle">Pflicht</span>}
          </label>
          {help && <Hint label={label}>{help}</Hint>}
        </div>
        {children}
        {hint && <p id={hintId} className="text-[13px] leading-snug text-muted">{hint}</p>}
        {error && <p id={errId} role="alert" className="text-[13px] leading-snug text-danger">{error}</p>}
      </div>
    </FieldCtx.Provider>
  )
}

/* ---------------- Hint: kleiner „?“-Knopf mit Erklärung ---------------- */
export function Hint({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  // Panel nach dem Öffnen messen und mit 16 px Rand im Bild halten
  useLayoutEffect(() => {
    if (!open || !panel.current) return setShift(0)
    const r = panel.current.getBoundingClientRect()
    const base = r.left - shift
    const vw = document.documentElement.clientWidth
    let x = Math.min(0, vw - 16 - (base + r.width))
    if (base + x < 16) x = 16 - base
    setShift(x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    // Escape auch dann, wenn der Fokus nach einem Tipp auf den Text beim body liegt
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const a = document.activeElement
      if (a && a !== document.body && !wrap.current?.contains(a)) return
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        ref={btn}
        type="button"
        aria-label={`Erklärung: ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="press relative inline-flex size-5 items-center justify-center rounded-full text-subtle hover:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-3 [&_svg]:size-4"
      >
        <HelpCircle aria-hidden />
      </button>
      {open && (
        <span ref={panel} id={id} role="note" style={{ transform: `translateX(${shift}px)` }} className="enter absolute top-full left-0 z-40 mt-1.5 w-64 max-w-[calc(100vw-48px)] rounded-xl border border-line bg-surface p-3 text-[13px] leading-snug font-normal text-fg shadow-pop">
          {children}
        </span>
      )}
    </span>
  )
}

/* ---------------- Switch ---------------- */
export function Switch({ checked, onCheckedChange, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong transition-colors duration-200 data-[state=checked]:bg-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2.5"
    >
      <RSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out-strong data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  )
}

/* ---------------- Segmented ---------------- */
/** Pfeiltasten-Bedienung für eine Gruppe von role="radio"-Knöpfen (Roving Tabindex). */
export function useRovingRadio<T>(values: T[], value: T, onChange: (v: T) => void) {
  const root = useRef<HTMLDivElement>(null)
  const current = values.includes(value) ? value : values[0]
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const i = values.indexOf(current)
    const next = (i + dir + values.length) % values.length
    onChange(values[next])
    // Fokus folgt der Auswahl, sobald React neu gerendert hat
    requestAnimationFrame(() => root.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus())
  }
  return { ref: root, onKeyDown, tabIndex: (v: T) => (v === current ? 0 : -1) }
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', label, wrap }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md'; label?: string; /** Schmale Bildschirme: 2×2-Raster statt einer Zeile */ wrap?: boolean }) {
  const roving = useRovingRadio(options.map((o) => o.value), value, onChange)
  return (
    <div ref={roving.ref} role="radiogroup" aria-label={label} onKeyDown={roving.onKeyDown} className={cn('rounded-[10px] bg-sunken p-0.5 ring-1 ring-line ring-inset', wrap ? 'grid w-full grid-cols-2 gap-0.5 sm:inline-flex sm:w-auto' : 'inline-flex', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={roving.tabIndex(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            'press inline-flex items-center gap-1.5 rounded-lg font-medium text-muted hover:text-fg pointer-coarse:h-11',
            wrap && 'justify-center',
            size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-sm',
            value === o.value && 'bg-surface text-fg shadow-xs ring-1 ring-line',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Badge ---------------- */
type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok'
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted ring-line',
  accent: 'bg-accent-soft text-accent-soft-fg ring-transparent',
  danger: 'bg-danger-soft text-danger-soft-fg ring-transparent',
  warn: 'bg-warn-soft text-warn-fg ring-warn-line',
  ok: 'bg-accent-soft text-accent-soft-fg ring-transparent',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>
}

/* ---------------- Card ---------------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-line bg-surface shadow-xs', className)}>{children}</div>
}

export function SectionHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-soft-fg ring-1 ring-black/5', className)}
    >
      {initials}
    </span>
  )
}

/* ---------------- Copy Button ---------------- */
export function CopyButton({ value, label = 'Link kopieren', size = 'sm', variant = 'secondary' }: { value: string; label?: string; size?: Size; variant?: Variant }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {})
        setDone(true)
        setTimeout(() => setDone(false), 1600)
      }}
    >
      <span className="relative inline-flex size-4">
        <Copy className={cn('absolute transition-[opacity,transform,filter] duration-200', done && 'scale-75 opacity-0 blur-[2px]')} />
        <Check className={cn('absolute text-accent transition-[opacity,transform,filter] duration-200', !done && 'scale-75 opacity-0 blur-[2px]')} />
      </span>
      {size !== 'icon' && <span>{done ? 'Kopiert' : label}</span>}
    </Button>
  )
}

/* ---------------- Dialog ---------------- */
export function Dialog({ open, onOpenChange, title, description, children, footer, wide, onOpenAutoFocus }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean; onOpenAutoFocus?: (e: Event) => void }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="overlay fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] dark:bg-black/55" />
        <RDialog.Content
          onOpenAutoFocus={onOpenAutoFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'modal fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-line bg-surface shadow-pop focus:outline-none',
            wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <RDialog.Title className="text-[17px] font-semibold text-fg">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description>}
            </div>
            <RDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Schließen" className="-mt-1 -mr-2">
                <X />
              </Button>
            </RDialog.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-4">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

export function Sheet({ open, onOpenChange, title, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="overlay fixed inset-0 z-50 bg-black/25 dark:bg-black/50" />
        <RDialog.Content className="sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-line bg-surface shadow-pop focus:outline-none">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <RDialog.Title className="text-[15px] font-semibold">{title}</RDialog.Title>
            <RDialog.Description className="sr-only">Details</RDialog.Description>
            <RDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Schließen" className="-mr-2">
                <X />
              </Button>
            </RDialog.Close>
          </div>
          <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

/* ---------------- Bestätigungsdialog ---------------- */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Löschen',
  cancelLabel = 'Abbrechen',
  danger = true,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  pending?: boolean
  onConfirm: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      // Fokus zuerst auf den harmlosen Knopf, damit Enter nichts löscht
      onOpenAutoFocus={(e) => { e.preventDefault(); cancel.current?.focus() }}
      footer={
        <>
          <Button ref={cancel} variant="ghost" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={pending} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    />
  )
}

/* ---------------- Toast ---------------- */
interface ToastItem { id: number; msg: string; kind: 'ok' | 'error'; action?: { label: string; onClick: () => void } }
interface ToastOptions { action?: { label: string; onClick: () => void }; duration?: number }
let pushToast: ((t: Omit<ToastItem, 'id'>, duration?: number) => void) | null = null
let toastId = 0

/** Erfolgsmeldung. Mit `action` (z. B. „Rückgängig“) bleibt sie etwas länger stehen. */
export function toast(msg: string, opts: ToastOptions = {}) {
  pushToast?.({ msg, kind: 'ok', action: opts.action }, opts.duration ?? (opts.action ? 8000 : 2600))
}
/** Fehlermeldung: bleibt stehen, bis sie geschlossen wird. */
toast.error = (msg: string) => pushToast?.({ msg, kind: 'error' })

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const close = (id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((i) => i.filter((x) => x.id !== id))
  }
  useEffect(() => {
    const active = timers.current
    pushToast = (t, duration) => {
      const id = ++toastId
      // Höchstens 4 gleichzeitig: die ältesten weichen
      setItems((i) => [...i, { ...t, id }].slice(-4))
      if (duration) active.set(id, setTimeout(() => close(id), duration))
    }
    return () => {
      pushToast = null
      active.forEach(clearTimeout)
      active.clear()
    }
  }, [])
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex w-[calc(100vw-32px)] max-w-md -translate-x-1/2 flex-col items-center gap-2 lg:bottom-5">
      {items.map((t) =>
        t.kind === 'error' ? (
          <div key={t.id} role="alert" className="enter pointer-events-auto flex max-w-full items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft py-2.5 pr-1.5 pl-4 text-sm font-medium text-danger-soft-fg shadow-pop">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 py-0.5">{t.msg}</span>
            <Button variant="ghost" size="icon" aria-label="Meldung schließen" onClick={() => close(t.id)} className="-my-1 size-8 shrink-0 text-danger-soft-fg hover:text-danger-soft-fg [&_svg]:size-4">
              <X />
            </Button>
          </div>
        ) : (
          <div key={t.id} className="enter pointer-events-auto flex max-w-full items-center gap-2 rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg shadow-pop">
            <Check className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{t.msg}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { t.action!.onClick(); close(t.id) }}
                className="press -my-1 -mr-2 ml-1 inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 font-semibold underline underline-offset-2 hover:bg-bg/15 pointer-coarse:h-11"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ),
      )}
    </div>
  )
}

/* ---------------- Feste Speichern-Leiste (nur Mobil) ---------------- */
/**
 * Erscheint nur bei ungespeicherten Änderungen, über der unteren Navigation (Safe-Area beachtet).
 * Entweder onSave (Knopf) oder formId (Absenden eines Formulars mit Browser-Prüfung).
 */
export function SaveBar({ show, pending, disabled, onSave, formId, label = 'Speichern', text = 'Ungespeicherte Änderungen' }: { show: boolean; pending?: boolean; disabled?: boolean; onSave?: () => void; formId?: string; label?: string; text?: string }) {
  if (!show) return null
  return (
    <>
      <div aria-hidden className="h-16 lg:hidden" />
      <div role="region" aria-label="Änderungen speichern" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur-md lg:hidden">
        <p className="min-w-0 text-sm text-muted">{text}</p>
        <Button variant="primary" type={formId ? 'submit' : 'button'} form={formId} disabled={pending || disabled} onClick={onSave}>{pending ? 'Speichert …' : label}</Button>
      </div>
    </>
  )
}
