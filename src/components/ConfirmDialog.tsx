import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * In-app confirmation dialog.
 *
 * Deliberately replaces window.confirm(): native dialogs are suppressed in
 * installed PWAs and embedded webviews, where confirm() returns false without
 * ever showing — which silently turned "Delete" into a no-op. This also lets
 * destructive actions look destructive, and shows progress while they run.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus the confirm button so the dialog is keyboard-operable, and stop
    // the page behind it scrolling.
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      // Above the Leaflet map panes (z-index up to 1000) and the mobile tab bar.
      className="fixed inset-0 z-[1300] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="shrink-0 bg-red-100 text-red-600 rounded-full p-2">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-gray-900">
              {title}
            </h2>
            {message && (
              <p className="text-sm text-gray-600 mt-1 leading-snug">{message}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium rounded-lg py-2.5"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 text-white text-sm font-medium rounded-lg py-2.5 disabled:opacity-50 ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
