import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Film, Globe, ImagePlus, Lock, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PinPicker from '../lib/maps/PinPicker'
import {
  LISTING_STATUSES,
  PROPERTY_TYPES,
  type AreaUnit,
  type ContactType,
  type FrontUnit,
  type RateUnit,
  type Listing,
  type ListingMedia,
  type ListingStatus,
  type Visibility,
} from '../lib/types'
import type { LatLng } from '../lib/geo'
import type { ListingDraft, ParsedListing } from '../lib/listingParser'
import { compressPhoto, prettyBytes, validateVideo } from '../lib/media'
import { deleteMedia, refreshStaticMap, uploadMedia } from '../lib/mediaStorage'
import { PHOTO_LIMIT, VIDEO_MAX_SECONDS } from '../lib/limits'
import BackButton from './BackButton'
import ConfirmDialog from './ConfirmDialog'

interface PendingPhoto {
  file: File
  preview: string
}

interface PendingVideo {
  file: File
  duration: number
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function Field({
  label,
  optional,
  children,
}: {
  label: ReactNode
  optional?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {optional && <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * Shared create/edit form. In edit mode (`existing` set) it prefills every
 * field, allows changing status, and manages already-uploaded media
 * (removal is immediate: storage file + DB row go together).
 */
export default function ListingForm({
  existing,
  initial,
  autofilled,
  engine,
}: {
  existing?: Listing
  /** Pre-filled values, e.g. parsed from a WhatsApp message or a map pin. */
  initial?: ListingDraft
  /** Which of those came from parsed text, so they can be flagged for review. */
  autofilled?: Set<keyof ListingDraft>
  /** Which parser produced `initial` — surfaced in the banner. */
  engine?: ParsedListing['engine']
}) {
  const navigate = useNavigate()
  const isEdit = Boolean(existing)

  /** Marks a field that was filled by the parser and should be double-checked. */
  const fromText = (key: keyof ListingDraft) =>
    autofilled?.has(key) ? (
      <span className="ml-1.5 align-middle text-[10px] font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
        from text
      </span>
    ) : null

  // Visibility — the Pub/Pvt choice.
  const [visibility, setVisibility] = useState<Visibility>(existing?.visibility ?? 'public')
  // Address
  const [line1, setLine1] = useState(existing?.address_line1 ?? initial?.address_line1 ?? '')
  const [line2, setLine2] = useState(existing?.address_line2 ?? initial?.address_line2 ?? '')
  const [city, setCity] = useState(existing?.city ?? initial?.city ?? 'Raipur')
  const [stateName, setStateName] = useState(existing?.state ?? initial?.state ?? 'Chhattisgarh')
  const [pincode, setPincode] = useState(existing?.pincode ?? initial?.pincode ?? '')
  // Property
  const [propertyType, setPropertyType] = useState<string>(
    existing?.property_type ?? initial?.property_type ?? PROPERTY_TYPES[0],
  )
  const [area, setArea] = useState(existing ? String(existing.area) : initial?.area != null ? String(initial.area) : '')
  const [unit, setUnit] = useState<AreaUnit>(existing?.area_unit ?? initial?.area_unit ?? 'sqft')
  const [rate, setRate] = useState(existing ? String(existing.rate) : initial?.rate != null ? String(initial.rate) : '')
  const [rateUnit, setRateUnit] = useState<RateUnit>(existing?.rate_unit ?? initial?.rate_unit ?? 'sqft')
  const [front, setFront] = useState(existing?.front != null ? String(existing.front) : initial?.front != null ? String(initial.front) : '')
  const [frontUnit, setFrontUnit] = useState<FrontUnit>(existing?.front_unit ?? initial?.front_unit ?? 'ft')
  const [rateVisible, setRateVisible] = useState(existing?.rate_visible ?? true)
  const [contactType, setContactType] = useState<ContactType>(
    existing?.contact_type ?? initial?.contact_type ?? 'Broker',
  )
  const [status, setStatus] = useState<ListingStatus>(existing?.status ?? 'Available')
  const [coords, setCoords] = useState<LatLng | null>(
    existing
      ? { lat: existing.latitude, lng: existing.longitude }
      : initial?.latitude != null && initial?.longitude != null
        ? { lat: initial.latitude, lng: initial.longitude }
        : null,
  )
  const [notes, setNotes] = useState(existing?.notes ?? initial?.notes ?? '')
  // Media
  const [existingMedia, setExistingMedia] = useState<ListingMedia[]>(
    existing?.listing_media ?? [],
  )
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [video, setVideo] = useState<PendingVideo | null>(null)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<ListingMedia | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const existingPhotos = existingMedia.filter((m) => m.media_type === 'photo')
  const existingVideo = existingMedia.find((m) => m.media_type === 'video')
  const photoSlotsLeft = PHOTO_LIMIT - existingPhotos.length - photos.length

  useEffect(() => {
    return () => photos.forEach((p) => URL.revokeObjectURL(p.preview))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    setError(null)
    setMediaBusy(true)
    const next = [...photos]
    for (const file of Array.from(files)) {
      if (existingPhotos.length + next.length >= PHOTO_LIMIT) {
        setError(`Maximum ${PHOTO_LIMIT} photos per listing.`)
        break
      }
      try {
        const compressed = await compressPhoto(file)
        next.push({ file: compressed, preview: URL.createObjectURL(compressed) })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    setPhotos(next)
    setMediaBusy(false)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const addVideo = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setError(null)
    setMediaBusy(true)
    try {
      const duration = await validateVideo(file)
      setVideo({ file, duration })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setMediaBusy(false)
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  const removePendingPhoto = (index: number) => {
    URL.revokeObjectURL(photos[index].preview)
    setPhotos(photos.filter((_, i) => i !== index))
  }

  // Confirmed via ConfirmDialog rather than window.confirm(), which is
  // suppressed in installed PWAs (it returns false, silently cancelling).
  const removeExistingMedia = async () => {
    const m = pendingRemoval
    if (!m) return
    setMediaBusy(true)
    await deleteMedia([m])
    await supabase.from('listing_media').delete().eq('id', m.id)
    setExistingMedia(existingMedia.filter((x) => x.id !== m.id))
    setPendingRemoval(null)
    setMediaBusy(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const areaNum = parseFloat(area)
    const rateNum = parseFloat(rate)
    if (!line1.trim()) return setError('Address line 1 is required.')
    if (!city.trim() || !stateName.trim()) return setError('City and state are required.')
    if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) {
      return setError('Pincode must be 6 digits (or leave it empty).')
    }
    if (!areaNum || areaNum <= 0) return setError('Area must be a positive number.')
    if (!rateNum || rateNum <= 0) return setError('Rate must be a positive number.')
    const frontNum = front.trim() ? parseFloat(front) : null
    if (front.trim() && (!frontNum || frontNum <= 0)) {
      return setError('Front must be a positive number, or leave it empty.')
    }
    if (!coords) return setError('Drop the location pin on the map.')

    setSubmitting(true)

    const payload = {
      visibility,
      address_line1: line1.trim(),
      address_line2: line2.trim() || null,
      city: city.trim(),
      state: stateName.trim(),
      pincode: pincode || null,
      property_type: propertyType,
      area: areaNum,
      area_unit: unit,
      rate: rateNum,
      rate_unit: rateUnit,
      front: frontNum,
      front_unit: frontUnit,
      rate_visible: rateVisible,
      contact_type: contactType,
      notes: notes.trim() || null,
      latitude: coords.lat,
      longitude: coords.lng,
    }

    let listingId: string
    if (isEdit) {
      const { error: updateError } = await supabase
        .from('listings')
        .update({ ...payload, status })
        .eq('id', existing!.id)
      if (updateError) {
        setError(updateError.message)
        setSubmitting(false)
        return
      }
      listingId = existing!.id
    } else {
      const { data: listing, error: insertError } = await supabase
        .from('listings')
        .insert(payload)
        .select('id')
        .single()
      if (insertError || !listing) {
        setError(insertError?.message ?? 'Could not save the listing.')
        setSubmitting(false)
        return
      }
      listingId = listing.id
    }

    // Upload new media after the listing row exists; failures downgrade to a
    // warning so the listing itself is never lost.
    // Cache the card thumbnail for the (possibly new) coordinates. Fire and
    // forget — it must never block or fail the save.
    void refreshStaticMap(listingId, coords.lat, coords.lng)

    const uploadErrors: string[] = []
    const startPos = existingPhotos.length
    const uploads: { file: File; media_type: 'photo' | 'video'; position: number }[] =
      photos.map((p, i) => ({
        file: p.file,
        media_type: 'photo' as const,
        position: startPos + i,
      }))
    if (video) uploads.push({ file: video.file, media_type: 'video', position: 0 })

    for (const u of uploads) {
      try {
        const { path, provider } = await uploadMedia({
          listingId,
          file: u.file,
          mediaType: u.media_type,
        })
        const { error: mediaError } = await supabase.from('listing_media').insert({
          listing_id: listingId,
          media_type: u.media_type,
          storage_path: path,
          storage_provider: provider,
          position: u.position,
        })
        if (mediaError) uploadErrors.push(mediaError.message)
      } catch (e) {
        uploadErrors.push(e instanceof Error ? e.message : String(e))
      }
    }

    setSubmitting(false)
    const destination = isEdit ? '/my-listings' : '/'
    if (uploadErrors.length > 0) {
      setError(
        `Listing saved, but some media failed to upload: ${uploadErrors[0]} — you can re-add media from Edit.`,
      )
      setTimeout(() => navigate(destination, { replace: true }), 2500)
      return
    }
    navigate(destination, { replace: true })
  }

  const visibilityButton = (
    v: Visibility,
    icon: ReactNode,
    title: string,
    subtitle: string,
  ) => (
    <button
      type="button"
      onClick={() => setVisibility(v)}
      className={`flex-1 rounded-xl border-2 p-3 text-left transition-colors ${
        visibility === v
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span
        className={`flex items-center gap-2 text-sm font-semibold ${
          visibility === v ? 'text-emerald-700' : 'text-gray-700'
        }`}
      >
        {icon} {title}
      </span>
      <span className="block text-xs text-gray-500 mt-0.5">{subtitle}</span>
    </button>
  )

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <BackButton to={isEdit ? '/my-listings' : '/'} />
        <h1 className="text-lg font-semibold text-gray-900">
          {isEdit ? 'Edit listing' : 'Add a listing'}
        </h1>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-5"
      >
        {autofilled && autofilled.size > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-amber-900">
                {autofilled.size} field{autofilled.size === 1 ? '' : 's'} filled from your text
              </p>
              {/* Shows at a glance whether the AI parser ran or the offline
                  rules did — the only way to tell that the Gemini key is
                  actually working without opening the network tab. */}
              {engine && (
                <span className="text-[11px] font-medium text-amber-900/70 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                  {engine === 'ai' ? 'read by AI' : 'read offline'}
                </span>
              )}
            </div>
            <p className="text-xs text-amber-800/80 mt-0.5">
              Check the highlighted fields and complete anything still empty before posting.
            </p>
          </div>
        )}

        {/* ---------- Visibility (Pub / Pvt) ---------- */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Who can see this listing?</h2>
          <div className="flex gap-2">
            {visibilityButton(
              'public',
              <Globe size={16} />,
              'Public',
              'Visible to every member on the board',
            )}
            {visibilityButton(
              'private',
              <Lock size={16} />,
              'Private',
              'Only you — for your own reference',
            )}
          </div>
        </div>

        {/* ---------- Address ---------- */}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <h2 className="text-sm font-semibold text-gray-900">Property address</h2>
          <Field label={<>Address line 1{fromText('address_line1')}</>}>
            <input
              type="text"
              required
              placeholder="Plot / khasra no, street, locality"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Address line 2" optional>
            <input
              type="text"
              placeholder="Landmark, colony, tehsil…"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>City{fromText('city')}</>}>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="State">
              <input
                type="text"
                required
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label={<>Pincode{fromText('pincode')}</>} optional>
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit PIN"
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={inputClass}
            />
          </Field>
        </div>

        {/* ---------- Property details ---------- */}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <h2 className="text-sm font-semibold text-gray-900">Property details</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>Type{fromText('property_type')}</>}>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className={inputClass}
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={<>Contact type{fromText('contact_type')}</>}>
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as ContactType)}
                className={inputClass}
              >
                <option>Broker</option>
                <option>Owner direct</option>
              </select>
            </Field>
          </div>
          {isEdit && (
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ListingStatus)}
                className={inputClass}
              >
                {LISTING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>Total area{fromText('area')}</>}>
              <input
                type="number"
                required
                min="0.01"
                step="any"
                placeholder="e.g. 2400"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Unit">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as AreaUnit)}
                className={inputClass}
              >
                <option value="sqft">sq feet</option>
                <option value="acre">acres</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>Front (road-facing){fromText('front')}</>} optional>
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder="e.g. 30"
                value={front}
                onChange={(e) => setFront(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Front unit">
              <select
                value={frontUnit}
                onChange={(e) => setFrontUnit(e.target.value as FrontUnit)}
                className={inputClass}
              >
                <option value="ft">feet</option>
                <option value="m">metres</option>
              </select>
            </Field>
          </div>

          <Field
            label={
              <>
                Rate (₹ per {rateUnit === 'acre' ? 'acre' : 'sqft'}){fromText('rate')}
              </>
            }
          >
            <div className="flex gap-2">
              <input
                type="number"
                required
                min="0.01"
                step="any"
                placeholder={rateUnit === 'acre' ? 'e.g. 8000000' : 'e.g. 1850'}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={inputClass}
              />
              <select
                value={rateUnit}
                onChange={(e) => setRateUnit(e.target.value as RateUnit)}
                aria-label="Rate unit"
                className="shrink-0 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="sqft">/sqft</option>
                <option value="acre">/acre</option>
              </select>
              <button
                type="button"
                onClick={() => setRateVisible(!rateVisible)}
                title={
                  rateVisible
                    ? 'Rate is visible to all members — click to hide'
                    : 'Rate is hidden ("On request") — click to show'
                }
                className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                  rateVisible
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-gray-50 text-gray-500'
                }`}
              >
                {rateVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                {rateVisible ? 'Shared' : 'Hidden'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {rateVisible
                ? 'Other members will see the rate and total value.'
                : 'Others see "On request" — only you see the rate and total.'}
            </p>
          </Field>
        </div>

        {/* ---------- Location ---------- */}
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <h2 className="text-sm font-semibold text-gray-900">Location pin</h2>
          <PinPicker value={coords} onChange={setCoords} />
        </div>

        {/* ---------- Notes ---------- */}
        <div className="border-t border-gray-100 pt-4">
          <Field label={<>Notes{fromText('notes')}</>} optional>
            <textarea
              rows={3}
              placeholder="Facing, road width, negotiability, documents…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {/* ---------- Media ---------- */}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Photos & video</h2>
            <span className="text-xs text-gray-400">
              {existingPhotos.length + photos.length}/{PHOTO_LIMIT} photos ·{' '}
              {existingVideo || video ? 1 : 0}/1 video
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {existingPhotos.map((m) => (
              <div key={m.id} className="relative w-20 h-20">
                {m.url ? (
                  <img
                    src={m.url}
                    alt="Listing photo"
                    className="w-full h-full object-cover rounded-lg border border-gray-200"
                  />
                ) : (
                  <div className="w-full h-full rounded-lg border border-gray-200 bg-gray-100" />
                )}
                <button
                  type="button"
                  onClick={() => setPendingRemoval(m)}
                  aria-label="Remove existing photo"
                  className="absolute -top-1.5 -right-1.5 bg-gray-900/80 text-white rounded-full p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.map((p, i) => (
              <div key={p.preview} className="relative w-20 h-20">
                <img
                  src={p.preview}
                  alt={`New photo ${i + 1}`}
                  className="w-full h-full object-cover rounded-lg border border-emerald-300"
                />
                <button
                  type="button"
                  onClick={() => removePendingPhoto(i)}
                  aria-label={`Remove new photo ${i + 1}`}
                  className="absolute -top-1.5 -right-1.5 bg-gray-900/80 text-white rounded-full p-0.5"
                >
                  <X size={12} />
                </button>
                <span className="absolute bottom-0.5 left-0.5 bg-black/50 text-white text-[9px] rounded px-1">
                  {prettyBytes(p.file.size)}
                </span>
              </div>
            ))}
            {photoSlotsLeft > 0 && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={mediaBusy}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-emerald-400 hover:text-emerald-600 flex flex-col items-center justify-center gap-0.5 text-[10px]"
              >
                <ImagePlus size={20} />
                {mediaBusy ? 'Working…' : 'Add photo'}
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void addPhotos(e.target.files)}
          />

          {existingVideo ? (
            <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <Film size={16} className="text-emerald-600" /> Video attached
              </span>
              <button
                type="button"
                onClick={() => setPendingRemoval(existingVideo)}
                aria-label="Remove existing video"
                className="text-gray-400 hover:text-red-600 p-1"
              >
                <X size={15} />
              </button>
            </div>
          ) : video ? (
            <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                <Film size={16} className="text-emerald-600 shrink-0" />
                <span className="truncate">{video.file.name}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {Math.round(video.duration)}s · {prettyBytes(video.file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setVideo(null)}
                aria-label="Remove video"
                className="text-gray-400 hover:text-red-600 p-1"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={mediaBusy}
              className="flex items-center gap-2 text-sm text-gray-500 border-2 border-dashed border-gray-300 hover:border-emerald-400 hover:text-emerald-600 rounded-lg px-3 py-2.5 w-full justify-center"
            >
              <Film size={16} /> Add video (max {VIDEO_MAX_SECONDS}s, 20 MB)
            </button>
          )}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => void addVideo(e.target.files)}
          />
          <p className="text-xs text-gray-400">
            Photos are compressed on your phone before upload (~500 KB each).
            Video length and size are checked before upload.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || mediaBusy}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg py-3"
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Post listing'}
        </button>
      </form>

      <ConfirmDialog
        open={pendingRemoval !== null}
        destructive
        busy={mediaBusy}
        title={pendingRemoval?.media_type === 'video' ? 'Remove this video?' : 'Remove this photo?'}
        message="It will be deleted from the listing and from storage. This cannot be undone."
        confirmLabel="Remove"
        onConfirm={() => void removeExistingMedia()}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  )
}
