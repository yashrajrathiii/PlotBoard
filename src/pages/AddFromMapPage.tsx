import { useState } from 'react'
import { MapPin, Sparkles } from 'lucide-react'
import PinPicker from '../lib/maps/PinPicker'
import ListingForm from '../components/ListingForm'
import BackButton from '../components/BackButton'
import type { LatLng } from '../lib/geo'
import {
  ruleBasedParser,
  type ListingDraft,
  type ParsedListing,
} from '../lib/listingParser'

/**
 * Post a property straight from the map: find the plot with Google (its Indian
 * address search is the reason Google is used here at all), drop the pin,
 * describe it in plain text, and let the parser fill the form.
 *
 * The pin's coordinates are carried into the form as-is — a lat/lng is
 * provider-neutral, so the saved listing appears on the Mapbox Map View at the
 * identical spot with no conversion.
 */
export default function AddFromMapPage() {
  const [coords, setCoords] = useState<LatLng | null>(null)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedListing | null>(null)
  const [busy, setBusy] = useState(false)

  const handleContinue = async () => {
    if (!coords) return
    setBusy(true)
    const result = text.trim()
      ? await ruleBasedParser.parse(text)
      : { fields: {}, autofilled: new Set<keyof ListingDraft>(), unmatched: [] }
    // The dropped pin always wins over anything in the text.
    result.fields.latitude = coords.lat
    result.fields.longitude = coords.lng
    setParsed(result)
    setBusy(false)
  }

  if (parsed) {
    return (
      <ListingForm
        initial={parsed.fields as ListingDraft}
        autofilled={parsed.autofilled}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <BackButton to="/map" />
        <h1 className="text-lg font-semibold text-gray-900">Add from map</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            1. Find the plot and drop a pin
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            Search an address, or tap the satellite map where the property is.
          </p>
          <PinPicker value={coords} onChange={setCoords} className="h-72" />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            2. Describe it
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            Type it however you'd send it on WhatsApp — we'll pull out the size,
            rate, type and frontage. You can skip this and fill the form yourself.
          </p>
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'2400 sqft residential plot\nRate 1850 per sqft\n30 ft front, owner direct'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {!coords && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-1.5">
            <MapPin size={14} /> Drop a pin on the map to continue.
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleContinue()}
          disabled={!coords || busy}
          className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg py-3"
        >
          <Sparkles size={16} /> {busy ? 'Reading…' : 'Continue to listing details'}
        </button>
      </div>
    </div>
  )
}
