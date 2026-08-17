import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Copy, Share2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useShareSelection } from '../context/ShareSelectionContext'
import { buildMultiShareText, copyText } from '../lib/share'
import ShareDialog from './ShareDialog'

/**
 * Bottom bar shown while multi-select is active (like WhatsApp's selection
 * toolbar): a count + cancel on the left, Copy / WhatsApp on the right, both
 * acting on ALL selected listings at once. Sits above the mobile tab bar.
 */
export default function ShareSelectionBar() {
  const { active, selected, exit } = useShareSelection()
  const { profile } = useAuth()
  const location = useLocation()
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)

  // Leaving the page cancels selection so it can't linger with stale cards.
  useEffect(() => {
    exit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (!active) return null

  // One sharer for the whole batch — the person tapping share, not the posters.
  const sharer = profile ? { name: profile.name, phone: profile.phone } : null
  const disabled = selected.length === 0

  // Copy takes rates where the posters allow it; buildMultiShareText asks each
  // listing individually, so a mixed selection needs no branching here.
  const onCopy = async () => {
    const ok = await copyText(buildMultiShareText(selected, sharer, { includeRate: true }))
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={exit}
            aria-label="Cancel selection"
            className="p-1.5 text-gray-600 hover:text-gray-900"
          >
            <X size={20} />
          </button>
          <span className="text-sm font-medium text-gray-900">
            {selected.length} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onCopy()}
            disabled={disabled}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-sm font-medium rounded-lg px-3 py-2"
          >
            {copied ? (
              <>
                <Check size={15} className="text-emerald-600" /> Copied
              </>
            ) : (
              <>
                <Copy size={15} /> Copy
              </>
            )}
          </button>
          {/* Opens the same dialog the single-listing share uses, so the batch
              gets the rate opt-in and the OS share sheet — and therefore a
              choice of WhatsApp account — rather than a wa.me link that always
              opens the default one. */}
          <button
            onClick={() => setSharing(true)}
            disabled={disabled}
            className="flex items-center gap-1.5 bg-[#25D366] hover:brightness-95 disabled:opacity-40 text-white text-sm font-medium rounded-lg px-3 py-2"
          >
            <Share2 size={15} /> Share
          </button>
        </div>
      </div>

      <ShareDialog
        listings={sharing ? selected : null}
        mode="text"
        sharer={sharer}
        onClose={() => setSharing(false)}
      />
    </div>
  )
}
