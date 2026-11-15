import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { AktionPage } from './public/AktionPage'
import { EventPage, ManagePage, ProfilePage } from './public/PublicPages'

/* Die Buchungsseite bleibt klein: Admin und Anmeldung werden erst bei Bedarf geladen. */
const AdminShell = lazy(() => import('./admin/AdminShell').then((m) => ({ default: m.AdminShell })))
const Termine = lazy(() => import('./admin/Termine').then((m) => ({ default: m.Termine })))
const Terminseiten = lazy(() => import('./admin/Terminseiten').then((m) => ({ default: m.Terminseiten })))
const TerminseiteEditor = lazy(() => import('./admin/Terminseiten').then((m) => ({ default: m.TerminseiteEditor })))
const Verfuegbarkeit = lazy(() => import('./admin/Verfuegbarkeit').then((m) => ({ default: m.Verfuegbarkeit })))
const Einstellungen = lazy(() => import('./admin/Einstellungen').then((m) => ({ default: m.Einstellungen })))
const LoginPage = lazy(() => import('./auth/AuthPages').then((m) => ({ default: m.LoginPage })))
const SetupPage = lazy(() => import('./auth/AuthPages').then((m) => ({ default: m.SetupPage })))
const PasswortNeuPage = lazy(() => import('./auth/AuthPages').then((m) => ({ default: m.PasswortNeuPage })))
const ConsentPage = lazy(() => import('./oauth/Consent').then((m) => ({ default: m.ConsentPage })))

function Root() {
  const auth = useAuth()
  if (auth.isLoading) return null
  if (auth.data && !auth.data.setupComplete) return <Navigate to={`/setup${location.search}`} replace />
  return <Navigate to="/admin" replace />
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/passwort-neu" element={<PasswortNeuPage />} />
        <Route path="/oauth/consent" element={<ConsentPage />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Termine />} />
          <Route path="terminseiten" element={<Terminseiten />} />
          <Route path="terminseiten/:id" element={<TerminseiteEditor />} />
          <Route path="verfuegbarkeit" element={<Verfuegbarkeit />} />
          <Route path="einstellungen" element={<Navigate to="/admin/einstellungen/profil" replace />} />
          <Route path="einstellungen/:tab" element={<Einstellungen />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="/aktion/:token" element={<AktionPage />} />
        <Route path="/b/:token" element={<ManagePage />} />
        <Route path="/:handle" element={<ProfilePage />} />
        <Route path="/:handle/:slug" element={<EventPage />} />
      </Routes>
    </Suspense>
  )
}
