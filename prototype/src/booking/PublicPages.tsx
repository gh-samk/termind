import { ArrowRight, Clock } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { LocationIcon } from '../components/LocationIcon'
import { eventTypes, fmtDuration, host } from '../data/mock'
import { Avatar } from '../ui'
import { BookingFlow } from './BookingFlow'

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 pt-8 pb-10 sm:px-6 sm:pt-14">
      <main>{children}</main>
      <footer className="mx-auto mt-10 flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-1 text-[13px] text-subtle">
        <nav className="flex gap-4">
          <a href="#impressum" className="hover:text-fg">Impressum</a>
          <a href="#datenschutz" className="hover:text-fg">Datenschutz</a>
        </nav>
        <span>
          Terminbuchung mit <span className="font-medium text-muted">termind</span>
        </span>
      </footer>
    </div>
  )
}

export function ProfilePage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-[640px]">
        <header className="enter flex flex-col items-center text-center">
          <Avatar name={host.name} size={72} />
          <h1 className="mt-5 font-display text-[28px] leading-tight">{host.name}</h1>
          <p className="mt-3 text-muted">
            {host.role} · {host.company}
          </p>
          <p className="mt-4 max-w-[46ch] text-[15px] text-muted text-pretty">Such dir einen passenden Termin aus. Du bekommst sofort eine Bestätigung mit Kalendereintrag per Mail.</p>
        </header>
        <ul className="enter-stagger mt-10 flex flex-col gap-3">
          {eventTypes
            .filter((e) => e.active)
            .map((e) => (
              <li key={e.id}>
                <Link
                  to={`/${host.handle}/${e.slug}`}
                  className="press hover-lift group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs"
                >
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: `oklch(0.7 0.11 ${e.color})` }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{e.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5" aria-hidden /> {fmtDuration(e.duration)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <LocationIcon kind={e.location.kind} className="size-3.5" /> {e.location.label}
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
      </div>
    </PublicShell>
  )
}

export function EventPage() {
  const { slug } = useParams()
  const ev = eventTypes.find((e) => e.slug === slug) ?? eventTypes[0]
  return (
    <PublicShell>
      <div className="enter">
        <BookingFlow ev={ev} />
      </div>
    </PublicShell>
  )
}
