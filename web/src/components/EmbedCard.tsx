import { useState } from 'react'
import { Card, CopyButton, SectionHeader, Segmented } from '../ui'

type EmbedMode = 'inline' | 'popup' | 'floating'

/**
 * Code zum Einbetten auf der eigenen Webseite. `path` ist „handle“ (Profilseite mit allen Terminseiten)
 * oder „handle/terminseite“ (eine einzelne Terminseite), siehe server/embed.ts.
 */
export function EmbedCard({ path, title = 'Auf deiner Webseite einbetten', description = 'Damit Besucher deiner Website direkt dort buchen können, ohne zu dir auf eine andere Seite zu wechseln: Code kopieren und an der gewünschten Stelle in deine Seite einfügen.' }: { path: string; title?: string; description?: string }) {
  const [mode, setMode] = useState<EmbedMode>('inline')
  const src = `${location.origin}/embed.js`
  const snippet = {
    inline: `<script src="${src}" defer></script>\n<div data-termind="${path}"></div>`,
    popup: `<script src="${src}" defer></script>\n<button data-termind="${path}" data-mode="popup">Termin buchen</button>`,
    floating: `<script src="${src}" defer></script>\n<div data-termind="${path}" data-mode="floating" data-label="Termin buchen"></div>`,
  }[mode]
  return (
    <Card className="p-6">
      <SectionHeader title={title} description={description} />
      <div className="mt-5">
        <Segmented
          label="So soll der Kalender erscheinen"
          size="sm"
          value={mode}
          onChange={setMode}
          className="max-w-full flex-wrap"
          options={[{ value: 'inline', label: 'Kalender direkt auf der Seite' }, { value: 'popup', label: 'Knopf, der den Kalender öffnet' }, { value: 'floating', label: 'Schwebender Knopf unten rechts' }]}
        />
      </div>
      <p className="mt-3 text-[13px] text-muted">
        {mode === 'inline' ? 'Der Kalender erscheint mitten im Text, die Höhe passt sich an.' : mode === 'popup' ? 'Besucher klicken auf einen Knopf, der Kalender öffnet sich als Fenster.' : 'Ein Knopf schwebt auf jeder Seite unten rechts und öffnet den Kalender.'}
      </p>
      <div className="mt-4"><CopyButton value={snippet} label="Code kopieren" size="md" variant="primary" /></div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-medium">Wohin mit dem Code?</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-muted">
          <li><span className="font-medium text-fg">WordPress:</span> Block „Individuelles HTML“ einfügen und den Code hineinkopieren.</li>
          <li><span className="font-medium text-fg">Wix:</span> „Einbetten“ → „Code einbetten“ wählen und den Code einfügen.</li>
          <li><span className="font-medium text-fg">Jimdo:</span> Element „Widget/HTML“ hinzufügen und den Code einfügen.</li>
          <li><span className="font-medium text-fg">Andere Systeme:</span> Im Bearbeitungsmodus ein HTML- oder Code-Element wählen und dort einfügen.</li>
        </ul>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">Code anzeigen</summary>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-sunken p-4 font-mono text-[12.5px] leading-relaxed text-fg ring-1 ring-line ring-inset">{snippet}</pre>
      </details>
    </Card>
  )
}
