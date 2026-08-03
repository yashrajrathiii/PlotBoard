import { MapPin } from 'lucide-react'

/**
 * Stand-in shown when a map provider key isn't configured. The app must stay
 * usable without map keys — a missing token should degrade to a calm message,
 * never a blank box or a console full of 401s.
 */
export default function MapPlaceholder({
  message = 'Map unavailable',
  detail,
  className = '',
}: {
  message?: string
  detail?: string
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 bg-gray-100 text-gray-400 ${className}`}
    >
      <MapPin size={28} />
      <p className="text-xs font-medium text-gray-500">{message}</p>
      {detail && <p className="text-[11px] text-gray-400 px-4 text-center">{detail}</p>}
    </div>
  )
}
