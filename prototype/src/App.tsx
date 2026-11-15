import { ArrowUpRight, LayoutGrid, Moon, Sun } from 'lucide-react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminShell, Logo } from './admin/AdminShell'
import { Einstellungen } from './admin/Einstellungen'
import { Termine } from './admin/Termine'
import { TerminseiteEditor, Terminseiten } from './admin/Terminseiten'
import { Verfuegbarkeit } from './admin/Verfuegbarkeit'
import { EmbedDemo } from './booking/EmbedDemo'
import { EventPage, ProfilePage } from './booking/PublicPages'
import { useTheme } from './lib/theme'
import { Button } from './ui'

/** Kleine Leiste nur für den Prototyp: Design umschalten, zurück zur Übersicht. */
function PrototypeBar() {
  const { theme, toggle } = useTheme()
  return (
    <>
      <Outlet />
      <div className="fixed top-3 right-3 z-40 flex items-center gap-1 rounded-xl border border-line bg-surface/85 p-1 shadow-card backdrop-blur-md">
        <Link to="/" aria-label="Prototyp-Übersicht" className="press flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
          <LayoutGrid className="size-4" />
        </Link>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Design wechseln">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </div>
    </>
  )
}

const screens = [
  { group: 'Für deine Kunden', items: [
    { to: '/lena', t: 'Profilseite', d: 'Alle Terminseiten eines Gastgebers' },
    { to: '/lena/kennenlernen', t: 'Buchung: direkt bestätigt', d: 'Tag → Uhrzeit → Angaben → fertig' },
    { to: '/lena/workshop', t: 'Buchung: mit Bestätigung', d: 'Wird zur Anfrage, du entscheidest' },
    { to: '/embed-demo', t: 'Auf einer Webseite eingebettet', d: 'Inline-Kalender und schwebender Button' },
  ] },
  { group: 'Für dich (Admin)', items: [
    { to: '/admin', t: 'Termine', d: 'Bevorstehend, Anfragen, Vergangen' },
    { to: '/admin/terminseiten', t: 'Terminseiten', d: 'Liste und Editor mit Vorschau' },
    { to: '/admin/verfuegbarkeit', t: 'Verfügbarkeit', d: 'Wochenzeiten und Ausnahmen' },
    { to: '/admin/einstellungen/ki', t: 'KI & MCP', d: 'Connector-URL, Zugänge, KI-Protokoll' },
    { to: '/admin/einstellungen/email', t: 'E-Mail', d: 'Eigenes SMTP und Mail-Texte mit Vorschau' },
    { to: '/admin/einstellungen/profil', t: 'Profil & Marke', d: 'Akzentfarbe live umschalten' },
  ] },
]

function Overview() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <Logo />
      <h1 className="mt-10 font-display text-[36px] leading-[1.1] sm:text-[44px]">Design-Prototyp</h1>
      <p className="mt-4 max-w-[54ch] text-[17px] text-muted text-pretty">
        Alles ist klickbar und mit Beispieldaten gefüllt. Oben rechts schaltest du zwischen hell und dunkel um. Nichts wird gespeichert.
      </p>
      <div className="mt-12 flex flex-col gap-10">
        {screens.map((g) => (
          <section key={g.group}>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase">{g.group}</h2>
            <ul className="enter-stagger grid gap-2 sm:grid-cols-2">
              {g.items.map((s) => (
                <li key={s.to}>
                  <Link to={s.to} className="press hover-lift group flex h-full items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
                    <span>
                      <span className="block font-medium">{s.t}</span>
                      <span className="mt-0.5 block text-sm text-muted">{s.d}</span>
                    </span>
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PrototypeBar />}>
          <Route path="/" element={<Overview />} />
          <Route path="/embed-demo" element={<EmbedDemo />} />
          <Route path="/lena" element={<ProfilePage />} />
          <Route path="/lena/:slug" element={<EventPage />} />
        </Route>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Termine />} />
          <Route path="terminseiten" element={<Terminseiten />} />
          <Route path="terminseiten/:id" element={<TerminseiteEditor />} />
          <Route path="verfuegbarkeit" element={<Verfuegbarkeit />} />
          <Route path="einstellungen" element={<Navigate to="/admin/einstellungen/profil" replace />} />
          <Route path="einstellungen/:tab" element={<Einstellungen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
