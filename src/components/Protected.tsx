import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DeviceLimitScreen from './DeviceLimitScreen'

export function FullScreenSpinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50">
      <div className="h-8 w-8 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin" />
    </div>
  )
}

/**
 * Gate order: session → device slot → completed profile → (optionally) admin.
 * The device gate sits before everything so an evicted/3rd device can never
 * see board data, and incomplete profiles are pushed to /welcome first.
 */
export default function Protected({
  children,
  adminOnly = false,
}: {
  children: ReactNode
  adminOnly?: boolean
}) {
  const { session, loading, profile, deviceStatus } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenSpinner />
  if (!session) return <Navigate to="/login" replace />
  if (deviceStatus === 'blocked') return <DeviceLimitScreen />
  if (deviceStatus === 'checking' || !profile) return <FullScreenSpinner />

  const profileIncomplete = !profile.name.trim() || !profile.phone.trim()
  if (profileIncomplete && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />
  }
  if (adminOnly && !profile.is_admin) return <Navigate to="/" replace />

  return <>{children}</>
}
