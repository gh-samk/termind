import * as RDialog from '@radix-ui/react-dialog'
import { CalendarDays, X } from 'lucide-react'
import { useState } from 'react'
import { eventTypes } from '../data/mock'
import { BookingFlow } from './BookingFlow'

/** Zeigt, wie termind auf einer fremden Webseite aussieht (Inline + schwebender Button). */
export function EmbedDemo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-dvh bg-[#f3f1ec] text-[#1c1b19] dark:bg-[#151412] dark:text-[#ecebe6]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold tracking-tight">Beispiel-Webseite</span>
        <nav className="hidden gap-6 text-sm opacity-70 sm:flex">
          <span>Leistungen</span>
          <span>Über mich</span>
          <span>Kontakt</span>
        </nav>
      </header>
      <section className="mx-auto max-w-5xl px-6 pt-10 pb-12">
        <p className="text-sm font-medium opacity-60">So sieht termind eingebettet aus</p>
        <h1 className="mt-3 max-w-[18ch] font-display text-[40px] leading-[1.1]">Lass uns über dein Projekt sprechen.</h1>
        <p className="mt-4 max-w-[52ch] opacity-70">
          Der Kalender unten ist per Script eingebunden (Modus <code className="rounded bg-black/5 px-1 dark:bg-white/10">inline</code>). Die Höhe passt sich automatisch an, das CSS deiner Seite bleibt unberührt.
        </p>
      </section>
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="rounded-2xl ring-1 ring-black/10 dark:ring-white/10">
          <BookingFlow ev={eventTypes[0]} embedded />
        </div>
        <pre className="mt-6 overflow-x-auto rounded-xl bg-[#1c1b19] p-4 text-[13px] leading-relaxed text-[#e8e6df]">
{`<script src="https://${'termine.example.de'}/embed.js" defer></script>
<div data-termind="lena/kennenlernen" data-mode="inline"></div>

<!-- oder als Button / schwebend -->
<button data-termind="lena/workshop" data-mode="popup">Termin buchen</button>
<div data-termind="lena" data-mode="floating" data-label="Termin buchen"></div>`}
        </pre>
      </section>

      {/* schwebender Button */}
      <RDialog.Root open={open} onOpenChange={setOpen}>
        <RDialog.Trigger asChild>
          <button className="press fixed right-5 bottom-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-medium text-accent-fg shadow-pop">
            <CalendarDays className="size-[18px]" /> Termin buchen
          </button>
        </RDialog.Trigger>
        <RDialog.Portal>
          <RDialog.Overlay className="overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
          <RDialog.Content className="modal fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[1080px] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-surface shadow-pop focus:outline-none">
            <RDialog.Title className="sr-only">Termin buchen</RDialog.Title>
            <RDialog.Description className="sr-only">Buchungskalender</RDialog.Description>
            <RDialog.Close className="press absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Schließen">
              <X className="size-4" />
            </RDialog.Close>
            <BookingFlow ev={eventTypes[1]} embedded />
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>
    </div>
  )
}
