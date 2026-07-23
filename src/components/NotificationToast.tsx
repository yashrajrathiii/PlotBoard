import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, X } from 'lucide-react'
import { useNotifications } from '../context/NotificationsContext'
import { notificationTitle } from '../lib/notify'

/**
 * In-app pop-up shown for a few seconds whenever a new notification arrives
 * over Realtime while the app is open. Tapping it opens the related listing.
 * (The OS-level pop-up is handled separately in NotificationsContext.)
 */
export default function NotificationToast() {
  const { toast, dismissToast } = useNotifications()
  const navigate = useNavigate()

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismissToast, 6000)
    return () => clearTimeout(t)
  }, [toast, dismissToast])

  if (!toast) return null

  return (
    <div className="fixed top-4 inset-x-0 z-[1100] flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        onClick={() => {
          if (toast.listing_id) navigate(`/listing/${toast.listing_id}`)
          dismissToast()
        }}
        className="pointer-events-auto w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-lg p-3 flex items-start gap-3 cursor-pointer animate-[fadeIn_0.2s_ease-out]"
      >
        <span className="mt-0.5 bg-emerald-100 text-emerald-700 rounded-full p-1.5 shrink-0">
          <BellRing size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {notificationTitle(toast.type)}
          </p>
          <p className="text-sm text-gray-600 leading-snug line-clamp-2">
            {toast.message}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            dismissToast()
          }}
          aria-label="Dismiss"
          className="text-gray-400 hover:text-gray-600 shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
