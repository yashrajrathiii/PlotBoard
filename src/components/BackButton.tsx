import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

/**
 * Instagram-style back control: a circular button with a left chevron.
 * `to` navigates to a route, `onClick` runs custom logic, and with neither it
 * goes back one entry in history. Used consistently across the app's pages.
 */
export default function BackButton({
  to,
  onClick,
  label = 'Back',
}: {
  to?: string
  onClick?: () => void
  label?: string
}) {
  const navigate = useNavigate()
  const handle = () => {
    if (onClick) onClick()
    else if (to) navigate(to)
    else navigate(-1)
  }
  return (
    <button
      type="button"
      onClick={handle}
      aria-label={label}
      className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 transition-colors shrink-0"
    >
      <ChevronLeft size={20} strokeWidth={2.5} />
    </button>
  )
}
