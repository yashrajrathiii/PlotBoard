import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Images, Loader2, TriangleAlert } from 'lucide-react'
import type { Listing } from '../lib/types'
import { buildShareText, copyText, type Sharer } from '../lib/share'
import { listingShareFiles, shareFiles } from '../lib/shareMedia'

/**
 * "Share with photos" sheet.
 *
 * Exists as a two-step flow for a reason that cannot be designed around:
 * `navigator.share()` requires **transient user activation**, and fetching plus
 * converting the photos takes a second or two. Doing both in one handler throws
 * NotAllowedError, so tap 1 opens this sheet and starts fetching, and tap 2 on
 * "Send to WhatsApp" performs the share inside a fresh gesture.
 *
 * The sheet earns that second tap by also hosting the video opt-in and the
 * clipboard notice.
 */

type Phase = 'preparing' | 'ready' | 'sharing' | 'done' | 'error'

export default function ShareWithPhotosDialog({
  listing,
  sharer,
  onClose,
}: {
  listing: Listing | null
  sharer: Sharer | null
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('preparing')
  const [files, setFiles] = useState<File[]>([])
  const [skipped, setSkipped] = useState(0)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [includeVideo, setIncludeVideo] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const open = listing !== null
  const hasVideo = listing?.listing_media.some((m) => m.media_type === 'video') ?? false

  const close = useCallback(() => {
    abortRef.current?.abort()
    onClose()
  }, [onClose])

  // Escape + body scroll lock, matching ConfirmDialog.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  // Fetch whenever the listing opens or the video choice changes. Photos load
  // immediately so the common case is never slowed by an unwanted 20 MB video.
  useEffect(() => {
    if (!listing) {
      setPhase('preparing')
      setFiles([])
      setMessage(null)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('preparing')
    setMessage(null)
    setProgress({ done: 0, total: 0 })

    void listingShareFiles(listing, {
      includeVideo,
      signal: controller.signal,
      onProgress: (done, total) => setProgress({ done, total }),
    })
      .then(({ files: got, skipped: miss }) => {
        if (controller.signal.aborted) return
        setFiles(got)
        setSkipped(miss)
        setPhase(got.length > 0 ? 'ready' : 'error')
        if (got.length === 0) {
          setMessage('None of the photos could be loaded. Share the details as text instead.')
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setPhase('error')
        setMessage('Could not load the photos. Check your connection and try again.')
      })

    return () => controller.abort()
  }, [listing, includeVideo])

  if (!listing) return null

  const text = buildShareText(listing, sharer, { videoIncluded: includeVideo })
  const totalBytes = files.reduce((n, f) => n + f.size, 0)

  const handleSend = async () => {
    setPhase('sharing')
    // Copy first, and always. WhatsApp frequently drops the caption when
    // several images are attached, so the clipboard — not the share payload —
    // is what actually guarantees the details survive.
    await copyText(text)
    const outcome = await shareFiles(files, text)
    if (outcome === 'shared') {
      setPhase('done')
      setMessage('Sent. Details are on your clipboard — paste them if WhatsApp left them off.')
      setTimeout(close, 2200)
    } else if (outcome === 'cancelled') {
      setPhase('ready')
    } else {
      setPhase('error')
      setMessage(
        outcome === 'unsupported'
          ? 'This browser can’t send files. Details are copied — open the app on your phone to send photos.'
          : 'Sending failed. Details are copied to your clipboard.',
      )
    }
  }

  const busy = phase === 'preparing' || phase === 'sharing'

  return (
    <div
      // Same stacking as ConfirmDialog: above the map panes and the tab bar.
      className="fixed inset-0 z-[1300] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !busy && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-photos-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 bg-emerald-100 text-emerald-700 rounded-full p-2">
            <Images size={18} />
          </span>
          <div className="min-w-0">
            <h2 id="share-photos-title" className="text-base font-semibold text-gray-900">
              Share with photos
            </h2>
            <p className="text-sm text-gray-600 mt-0.5 leading-snug truncate">
              {listing.address_line1}, {listing.city}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {phase === 'preparing' ? (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 size={15} className="animate-spin text-emerald-600" />
              Preparing {progress.total > 0 ? `${progress.done} of ${progress.total}` : '…'}
            </p>
          ) : (
            files.length > 0 && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">{files.length}</span> file
                {files.length === 1 ? '' : 's'} ready
                <span className="text-gray-500"> · {(totalBytes / 1_048_576).toFixed(1)} MB</span>
              </p>
            )
          )}

          {hasVideo && (
            <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVideo}
                onChange={(e) => setIncludeVideo(e.target.checked)}
                disabled={phase === 'sharing'}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                Also send the video
                <span className="block text-xs text-gray-500">
                  Up to 20 MB — slower to send
                </span>
              </span>
            </label>
          )}

          {skipped > 0 && phase !== 'preparing' && (
            <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              {skipped} file{skipped === 1 ? '' : 's'} couldn’t be loaded and will be left out.
            </p>
          )}

          {message && (
            <p
              className={`flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border ${
                phase === 'done'
                  ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                  : 'text-red-700 bg-red-50 border-red-200'
              }`}
            >
              {phase === 'done' && <Check size={13} className="mt-0.5 shrink-0" />}
              {message}
            </p>
          )}

          {phase !== 'done' && (
            <p className="text-xs text-gray-500 leading-snug">
              The details are copied to your clipboard as well — paste them into the
              chat if WhatsApp doesn’t include them.
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={close}
            disabled={phase === 'sharing'}
            className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium rounded-lg py-2.5"
          >
            {phase === 'done' ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={busy || files.length === 0 || phase === 'done'}
            className="flex-1 bg-[#25D366] hover:brightness-95 text-white text-sm font-medium rounded-lg py-2.5 disabled:opacity-50"
          >
            {phase === 'sharing' ? 'Sending…' : 'Send to WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}
