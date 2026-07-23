/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { notificationTitle, showSystemNotification } from '../lib/notify'

export interface AppNotification {
  id: number
  user_id: string
  actor_id: string | null
  listing_id: string | null
  type: string
  message: string
  read: boolean
  created_at: string
}

interface NotificationsValue {
  notifications: AppNotification[]
  unreadCount: number
  /** The latest arrival, for the toast; cleared after it's shown. */
  toast: AppNotification | null
  dismissToast: () => void
  markAllRead: () => Promise<void>
  reload: () => Promise<void>
}

const Ctx = createContext<NotificationsValue | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [toast, setToast] = useState<AppNotification | null>(null)
  // Guards against double-processing the same realtime row (StrictMode etc.).
  const seenIds = useRef<Set<number>>(new Set())

  const unreadCount = notifications.filter((n) => !n.read).length

  const reload = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    const rows = (data ?? []) as AppNotification[]
    seenIds.current = new Set(rows.map((r) => r.id))
    setNotifications(rows)
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      seenIds.current = new Set()
      return
    }
    void reload()

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as AppNotification
          if (seenIds.current.has(n.id)) return
          seenIds.current.add(n.id)
          setNotifications((prev) => [n, ...prev])
          setToast(n)
          void showSystemNotification(notificationTitle(n.type), n.message)
        },
      )
      .subscribe((status) => {
        // Re-sync once the channel is live to catch anything that landed
        // during the connect/authorize window (avoids missing the first
        // event right after a fresh load).
        if (status === 'SUBSCRIBED') void reload()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, reload])

  const dismissToast = useCallback(() => setToast(null), [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    const hasUnread = notifications.some((n) => !n.read)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    if (hasUnread) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
    }
  }, [userId, notifications])

  return (
    <Ctx.Provider
      value={{ notifications, unreadCount, toast, dismissToast, markAllRead, reload }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
