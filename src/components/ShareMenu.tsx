import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ListChecks, Share2 } from 'lucide-react'
import type { Listing } from '../lib/types'
import { buildShareText, copyText, whatsappShareUrl } from '../lib/share'
import { useAuth } from '../context/AuthContext'
import { useShareSelection } from '../context/ShareSelectionContext'

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#25D366" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
    </svg>
  )
}

/**
 * Share button + dropdown on every listing card. WhatsApp opens with the
 * listing text pre-filled (user just picks contacts); Copy puts the same
 * block on the clipboard. onOpenChange lets the card raise its z-index while
 * the menu is open so neighbouring cards can't cover it.
 */
export default function ShareMenu({
  listing,
  onOpenChange,
  allowMultiSelect = false,
}: {
  listing: Listing
  onOpenChange?: (open: boolean) => void
  /** Shows a "Select multiple" entry that starts WhatsApp-style selection. */
  allowMultiSelect?: boolean
}) {
  const [open, setOpenState] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const { profile } = useAuth()
  const selection = useShareSelection()
  // The contact on a shared listing is whoever is sharing it, never the
  // original poster — see the note in share.ts. Rates never leave the app at
  // all, so there is no rate-visibility check here any more.
  const sharer = profile ? { name: profile.name, phone: profile.phone } : null

  const setOpen = (v: boolean) => {
    setOpenState(v)
    onOpenChange?.(v)
    if (!v) setCopied(false)
  }

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleWhatsApp = () => {
    window.open(whatsappShareUrl(buildShareText(listing, sharer)), '_blank', 'noopener')
    setOpen(false)
  }

  const handleCopy = async () => {
    const ok = await copyText(buildShareText(listing, sharer))
    setCopied(ok)
    if (ok) setTimeout(() => setOpen(false), 900)
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Share ${listing.address_line1} listing`}
        className={`p-1.5 rounded-full ${
          open ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        <Share2 size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white rounded-xl border border-gray-200 shadow-lg py-1">
          <button
            onClick={handleWhatsApp}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <WhatsAppIcon /> WhatsApp
          </button>
          <button
            onClick={() => void handleCopy()}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {copied ? (
              <>
                <Check size={15} className="text-emerald-600" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={15} className="text-gray-400" /> Copy details
              </>
            )}
          </button>
          {allowMultiSelect && (
            <button
              onClick={() => {
                selection.enter(listing)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
            >
              <ListChecks size={15} className="text-gray-400" /> Select multiple
            </button>
          )}
        </div>
      )}
    </div>
  )
}
