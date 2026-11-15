import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../ui'

/**
 * Warnt vor dem Verlassen mit ungespeicherten Änderungen.
 * Die App läuft in einem BrowserRouter (kein Data-Router), daher gibt es kein useBlocker.
 * Stattdessen: Klicks auf interne Links abfangen, die Zurück-Taste über einen Zusatzeintrag im
 * Verlauf abfangen und beim Schließen/Neuladen den Browserdialog (beforeunload) nutzen.
 * Gibt den Dialog zurück, der im Markup der Seite stehen muss.
 */
export function useUnsavedGuard(dirty: boolean) {
  const nav = useNavigate()
  const [pending, setPending] = useState<{ kind: 'link'; to: string } | { kind: 'back' } | null>(null)
  const leaving = useRef(false)

  // Seite schließen oder neu laden
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // Interne Links (Navigation, „Zurück zu …“)
  useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin) return
      const to = url.pathname + url.search + url.hash
      if (to === location.pathname + location.search + location.hash || (url.pathname === location.pathname && url.search === location.search)) return
      e.preventDefault()
      e.stopPropagation()
      setPending({ kind: 'link', to })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])

  // Zurück-Taste: ein Zusatzeintrag im Verlauf fängt sie ab, die Seite bleibt stehen
  useEffect(() => {
    if (!dirty) return
    const href = location.href
    history.pushState(history.state, '', href)
    const onPop = () => {
      if (leaving.current) return
      history.pushState(history.state, '', href)
      setPending({ kind: 'back' })
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Gespeichert (oder verworfen) und noch auf derselben Seite: Zusatzeintrag wieder entfernen
      if (!leaving.current && location.href === href) history.back()
    }
  }, [dirty])

  const discard = () => {
    const p = pending
    setPending(null)
    if (!p) return
    leaving.current = true
    if (p.kind === 'link') nav(p.to)
    // Es gibt einen Eintrag davor (Router-Zähler > 0): zwei Schritte zurück. Sonst (Seite direkt geöffnet) in den Admin-Bereich.
    else if ((history.state?.idx ?? 0) > 0) history.go(-2)
    else nav('/admin', { replace: true })
    // Sobald die Seite weg ist, ist der Wächter egal; bleibt sie bestehen, soll er wieder greifen
    setTimeout(() => { leaving.current = false }, 600)
  }

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(o) => !o && setPending(null)}
      title="Ungespeicherte Änderungen"
      description="Du hast ungespeicherte Änderungen. Verwerfen oder weiter bearbeiten?"
      confirmLabel="Verwerfen"
      cancelLabel="Weiter bearbeiten"
      onConfirm={discard}
    />
  )
  return { dialog }
}
