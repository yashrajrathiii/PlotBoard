import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, Home, Tag } from 'lucide-react'
import { useNotifications, type AppNotification } from '../context/NotificationsContext'
import {
  canAskNotificationPermission,
  requestNotificationPermission,
} from '../lib/notify'
import { timeAgo } from '../lib/format'

function iconFor(type: string) {
  if (type === 'sold') return <Tag size={15} className="text-emerald-600" />
  if (type === 'new_listing') return <Home size={15} className="text-emerald-600" />
  return <BellRing size={15} className="text-amber-500" />
}

/**
 * Bell button with an unread badge that opens a dropdown list of the user's
 * notifications. Used in the mobile top bar (top-right) and the desktop
 * sidebar. Opening the panel marks everything read and, on first use, offers
 * to turn on OS pop-up notifications.
 */
export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [permission, setPermission] = useState<NotificationPermission>(
    canAskNotificationPermission() ? Notification.permission : 'denied',
  )

  useEffect(() => {
    if (!open) return
    void markAllRead()
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const enableAlerts = async () => {
    setPermission(await requestNotificationPermission())
  }

  const openListing = (n: AppNotification) => {
    setOpen(false)
    if (n.listing_id) navigate(`/listing/${n.listing_id}`)
  }

  const showEnable =
    canAskNotificationPermission() && permission === 'default'

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative text-gray-500 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-80 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {notifications.some((n) => !n.read) && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-emerald-700 hover:underline flex items-center gap-1"
              >
                <Check size={13} /> Mark all read
              </button>
            )}
          </div>

          {showEnable && (
            <button
              onClick={() => void enableAlerts()}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-b border-emerald-100"
            >
              <BellRing size={14} /> Turn on pop-up alerts on this device
            </button>
          )}

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">
                No notifications yet.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openListing(n)}
                  className={`w-full text-left flex gap-2.5 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${
                    n.read ? '' : 'bg-emerald-50/40'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{iconFor(n.type)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-800 leading-snug">
                      {n.message}
                    </span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
