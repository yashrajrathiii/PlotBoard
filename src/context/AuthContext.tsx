/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getDeviceId, getDeviceName } from '../lib/device'

export interface Profile {
  id: string
  name: string
  phone: string
  is_admin: boolean
}

export interface DeviceRow {
  user_id: string
  device_id: string
  device_name: string
  created_at: string
  last_seen: string
}

/**
 * checking → we haven't confirmed this device holds a slot yet
 * ok       → this device is one of the user's (max 2) registered devices
 * blocked  → both slots are taken by other devices; user must evict one
 */
export type DeviceStatus = 'checking' | 'ok' | 'blocked'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  profile: Profile | null
  deviceStatus: DeviceStatus
  activeDevices: DeviceRow[]
  refreshProfile: () => Promise<void>
  /** Evict the given device and claim its slot for this one. */
  evictAndRegister: (device: DeviceRow) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('checking')
  const [activeDevices, setActiveDevices] = useState<DeviceRow[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, is_admin')
      .eq('id', userId)
      .single()
    if (data) setProfile(data)
  }, [userId])

  const checkDevice = useCallback(async () => {
    if (!userId) return
    const deviceId = getDeviceId()
    const { data, error } = await supabase
      .from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .order('last_seen', { ascending: false })
    if (error || !data) return // transient network error: stay in current state

    if (data.some((d) => d.device_id === deviceId)) {
      setDeviceStatus('ok')
      void supabase
        .from('user_devices')
        .update({ last_seen: new Date().toISOString(), device_name: getDeviceName() })
        .eq('user_id', userId)
        .eq('device_id', deviceId)
      return
    }

    if (data.length < 2) {
      const { error: insertError } = await supabase.from('user_devices').insert({
        user_id: userId,
        device_id: deviceId,
        device_name: getDeviceName(),
      })
      if (!insertError) {
        setDeviceStatus('ok')
        return
      }
      // Lost a race with a concurrent login (DB trigger raised DEVICE_LIMIT):
      // fall through to blocked with a fresh list.
      const { data: fresh } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
      setActiveDevices(fresh ?? data)
      setDeviceStatus('blocked')
      return
    }

    setActiveDevices(data)
    setDeviceStatus('blocked')
  }, [userId])

  // On login: load profile and claim/verify a device slot.
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setDeviceStatus('checking')
      setActiveDevices([])
      return
    }
    void refreshProfile()
    void checkDevice()
  }, [userId, refreshProfile, checkDevice])

  const evictAndRegister = useCallback(
    async (device: DeviceRow): Promise<string | null> => {
      if (!userId) return 'Not signed in'
      const { error: delError } = await supabase
        .from('user_devices')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', device.device_id)
      if (delError) return delError.message
      const { error: insError } = await supabase.from('user_devices').insert({
        user_id: userId,
        device_id: getDeviceId(),
        device_name: getDeviceName(),
      })
      if (insError) return insError.message
      setDeviceStatus('ok')
      return null
    },
    [userId],
  )

  const signOut = useCallback(async () => {
    // Free this device's slot so a new device can log in without eviction.
    if (userId) {
      await supabase
        .from('user_devices')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', getDeviceId())
    }
    await supabase.auth.signOut()
  }, [userId])

  // Once registered, watch for this device being evicted from elsewhere:
  // realtime DELETE for instant reaction, plus a periodic + on-focus re-check
  // as a fallback (realtime can drop while a phone is backgrounded).
  useEffect(() => {
    if (!userId || deviceStatus !== 'ok') return
    const deviceId = getDeviceId()

    const verifyStillRegistered = async () => {
      const { data, error } = await supabase
        .from('user_devices')
        .select('device_id')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
      if (!error && data && data.length === 0) {
        await supabase.auth.signOut() // evicted: end this session locally
      }
    }

    const channel = supabase
      .channel(`device-watch-${deviceId}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_devices' },
        (payload) => {
          const old = payload.old as Partial<DeviceRow>
          if (old.device_id === deviceId) void verifyStillRegistered()
        },
      )
      .subscribe()

    const interval = setInterval(verifyStillRegistered, 60_000)
    const onFocus = () => void verifyStillRegistered()
    window.addEventListener('focus', onFocus)

    return () => {
      void supabase.removeChannel(channel)
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId, deviceStatus])

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        profile,
        deviceStatus,
        activeDevices,
        refreshProfile,
        evictAndRegister,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
