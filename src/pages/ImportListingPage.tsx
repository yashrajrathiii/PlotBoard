import { useState } from 'react'
import { ClipboardPaste, Sparkles } from 'lucide-react'
import ListingForm from '../components/ListingForm'
import BackButton from '../components/BackButton'
import { smartParser } from '../lib/aiParser'
import type { ListingDraft, ParsedListing } from '../lib/listingParser'

const SAMPLE = `Kachna main road, Raipur
2400 sqft residential plot
Rate 1850 per sqft
Owner direct, 30 ft front`

/**
 * Paste a WhatsApp lead → the parser pre-fills the listing form.
 *
 * Nothing is saved from the paste directly: the broker always lands on the
 * normal form to check what was extracted and complete what wasn't. That
 * review step is what makes rule-based parsing good enough here.
 */
export default function ImportListingPage() {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedListing | null>(null)
  const [busy, setBusy] = useState(false)

  const handleParse = async () => {
    if (!text.trim()) return
    setBusy(true)
    setParsed(await smartParser.parse(text))
    setBusy(false)
  }

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText()
      if (clip) setText(clip)
    } catch {
      // Clipboard read is permission-gated; the textarea still works manually.
    }
  }

  if (parsed) {
    return (
      <ListingForm
        initial={parsed.fields as ListingDraft}
        autofilled={parsed.autofilled}
        engine={parsed.engine}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <BackButton to="/" />
        <h1 className="text-lg font-semibold text-gray-900">Import from WhatsApp</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4">
        <p className="text-sm text-gray-600">
          Paste a property message and we'll fill in what we can — size, rate,
          type, address, frontage. You'll review everything before it's posted.
        </p>

        <textarea
          rows={9}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={SAMPLE}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleParse()}
            disabled={!text.trim() || busy}
            className="flex-1 min-w-40 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2.5"
          >
            <Sparkles size={16} /> {busy ? 'Reading…' : 'Read the message'}
          </button>
          <button
            type="button"
            onClick={() => void pasteFromClipboard()}
            className="flex items-center justify-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg px-4 py-2.5"
          >
            <ClipboardPaste size={16} /> Paste
          </button>
          {text && (
            <button
              type="button"
              onClick={() => setText(SAMPLE)}
              className="text-sm text-gray-500 hover:text-gray-700 px-2"
            >
              Use example
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Understands sq ft, acres, gaj, decimal and hectare, rates per sqft or
          per acre, lakh/crore amounts, frontage, pincode and property type.
        </p>
      </div>
    </div>
  )
}
