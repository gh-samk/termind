import * as RDialog from '@radix-ui/react-dialog'
import * as RSwitch from '@radix-ui/react-switch'
import { X, ChevronDown, Check, Copy } from 'lucide-react'
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
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
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-[10px]',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
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

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...p} />
))
Input.displayName = 'Input'

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-24 py-2.5 leading-relaxed', className)} {...p} />
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldBase, 'h-10 appearance-none pr-9', className)} {...p}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle" />
    </div>
  )
}

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && <p className="text-[13px] leading-snug text-muted">{hint}</p>}
    </div>
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
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong transition-colors duration-200 data-[state=checked]:bg-accent"
    >
      <RSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out-strong data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  )
}

/* ---------------- Segmented ---------------- */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-[10px] bg-sunken p-0.5 ring-1 ring-line ring-inset', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'press inline-flex items-center gap-1.5 rounded-lg font-medium text-muted hover:text-fg',
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
export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="overlay fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] dark:bg-black/55" />
        <RDialog.Content
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

/* ---------------- Toast (minimal) ---------------- */
let pushToast: ((msg: string) => void) | null = null
export function toast(msg: string) {
  pushToast?.(msg)
}
export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([])
  pushToast = (msg) => {
    const id = Date.now()
    setItems((i) => [...i, { id, msg }])
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 2600)
  }
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-24 left-1/2 z-[60] lg:bottom-5 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div key={t.id} className="enter flex items-center gap-2 rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg shadow-pop">
          <Check className="size-4" />
          {t.msg}
        </div>
      ))}
    </div>
  )
}
