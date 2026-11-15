import { MapPin, Phone, Video } from 'lucide-react'
import type { LocationKind } from '@shared/types'

export function LocationIcon({ kind, className }: { kind: LocationKind; className?: string }) {
  if (kind === 'onsite') return <MapPin className={className} aria-hidden />
  if (kind === 'phone-host-calls' || kind === 'phone-guest-calls') return <Phone className={className} aria-hidden />
  return <Video className={className} aria-hidden />
}
