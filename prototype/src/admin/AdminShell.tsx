import { CalendarCheck2, CalendarRange, Clock4, ExternalLink, Moon, Settings2, Sun } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { bookings, host } from '../data/mock'
import { cn } from '../lib/cn'
import { useTheme } from '../lib/theme'
import { Avatar, Button, Toaster } from '../ui'

const pending = bookings.filter((b) => b.status === 'pending').length

const nav = [
  { to: '/admin', end: true, label: 'Termine', icon: CalendarCheck2, badge: pending },
  { to: '/admin/terminseiten', label: 'Terminseiten', icon: CalendarRange },
  { to: '/admin/verfuegbarkeit', label: 'Verfügbarkeit', icon: Clock4 },
  { to: '/admin/einstellungen', label: 'Einstellungen', icon: Settings2 },
]

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-accent" />
        <path d="M10 11h12M16 11v11" stroke="var(--accent-fg)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="22.5" cy="21.5" r="2.2" fill="var(--accent-fg)" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.02em]">termind</span>
    </span>
  )
}

export function AdminShell() {
  const { theme, toggle } = useTheme()
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Seitenleiste (Desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-sunken/60 px-3 py-5 lg:flex">
        <div className="px-3">
          <Logo />
        </div>
        <nav aria-label="Hauptnavigation" className="mt-8 flex flex-col gap-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'press flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium text-muted hover:bg-surface-2 hover:text-fg',
                  isActive && 'bg-surface text-fg shadow-xs ring-1 ring-line hover:bg-surface',
                )
              }
            >
              <n.icon className="size-[18px]" aria-hidden />
              <span className="flex-1">{n.label}</span>
              {n.badge ? <span className="rounded-md bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-fg tabular">{n.badge}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <a href={`/${host.handle}`} target="_blank" className="press flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium text-muted hover:bg-surface-2 hover:text-fg">
            <ExternalLink className="size-[18px]" aria-hidden /> Meine Buchungsseite
          </a>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
            <Avatar name={host.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{host.name}</p>
              <p className="truncate text-xs text-muted">{host.domain}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Kopfzeile (Mobil) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md lg:hidden">
        <Logo />
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Design wechseln">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </header>

      <main className="min-w-0 px-4 pt-6 pb-28 sm:px-8 lg:px-12 lg:pt-10 lg:pb-16">
        <div className="mx-auto max-w-[1040px]">
          <Outlet />
        </div>
      </main>

      {/* Tab-Leiste (Mobil) */}
      <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => cn('press relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted', isActive && 'text-accent')}
          >
            <n.icon className="size-5" aria-hidden />
            {n.label}
            {n.badge ? <span className="absolute top-2 left-1/2 ml-2 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-fg">{n.badge}</span> : null}
          </NavLink>
        ))}
      </nav>
      <Toaster />
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2.5 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
