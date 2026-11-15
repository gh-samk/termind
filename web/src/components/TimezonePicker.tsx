import { useMemo } from 'react'
import { timezoneGroups, supportedTimezones } from '@shared/timezones'
import type { Locale } from '@shared/types'
import { browserTz } from '../lib/format'
import { localizeTimezoneGroups } from '../lib/guest'
import { Select } from '../ui'

/**
 * Zeitzonen-Auswahl für Laien: oben „Empfohlen“ (Zeitzone dieses Geräts), dann häufige Länder,
 * dann alle übrigen nach Erdteil, jeweils mit lesbarem Namen und Abstand zu UTC.
 * Ein natives Auswahlfeld, damit Tastatur, Suche per Tippen und Mobilgeräte ohne Extra-Code funktionieren.
 * Verknüpfung mit <Field htmlFor=…> läuft über `id`, wie bei Select.
 */
export function TimezonePicker({ value, onChange, id, className, locale = 'de', 'aria-label': ariaLabel }: { value: string; onChange: (tz: string) => void; id?: string; className?: string; locale?: Locale; 'aria-label'?: string }) {
  const groups = useMemo(() => localizeTimezoneGroups(timezoneGroups(supportedTimezones(), { recommended: browserTz(), current: value }), locale), [value, locale])
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label={ariaLabel}>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
        </optgroup>
      ))}
    </Select>
  )
}
