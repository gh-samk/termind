import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface Me {
  id: string
  email: string
  name: string
  handle: string
  subtitle: string
  role: 'owner' | 'member'
  timezone: string
  locale: 'de' | 'en'
  totpEnabled: boolean
}

export interface AuthState {
  setupComplete: boolean
  user: Me | null
  pendingSecondFactor: boolean
}

export function useAuth() {
  return useQuery({ queryKey: ['auth'], queryFn: () => api<AuthState>('/api/auth/state'), staleTime: 60_000 })
}

export function useRefreshAuth() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['auth'] })
}
