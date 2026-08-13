import { resolveMediaUrls } from './mediaStorage'
import type { Listing, ListingMedia } from './types'

/**
 * Turns a listing's stored media into `File` objects that can be handed to
 * `navigator.share({ files })`, so photos reach WhatsApp as a real gallery
 * instead of the recipient being told to ask for them.
 *
 * Two things here are load-bearing and easy to undo by accident:
 *
 * 1. **Photos are converted WebP → JPEG.** Uploads are stored as WebP, and
 *    WhatsApp interprets a `.webp` file as a STICKER, not a photo. Sharing them
 *    unconverted produces a row of stickers, which looks broken.
 * 2. **The MIME type comes from `media_type`, never from the response.** The R2
 *    upload deliberately omits Content-Type (see `mediaStorage.ts`), so a blob
 *    can come back as `application/octet-stream`, which share targets reject.
 */

/** Quality for the JPEG re-encode. 0.82 is visually clean at phone sizes. */
const JPEG_QUALITY = 0.82

export interface ShareFilesResult {
  files: File[]
  /** Media that could not be fetched — expired URL, deleted object, no access. */
  skipped: number
}

export interface ShareFilesOptions {
  includeVideo?: boolean
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

/** `Vedant vatika, Raipur` → `vedant-vatika-raipur`, for readable filenames. */
function slug(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase()
      .slice(0, 40) || 'listing'
  )
}

/**
 * Decode to something drawable.
 *
 * The `<img>` fallback is fed from a **blob URL** rather than the signed URL on
 * purpose: a blob URL is same-origin, so the canvas can never be tainted and
 * `toBlob` can never throw SecurityError, whatever CORS does.
 */
async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      // Some older Android WebViews refuse WebP here.
    }
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = new Image()
    // Handlers before `src`, and kept as the fallback: `decode()` rejects on
    // some browsers even when the image loads perfectly well.
    const loaded = new Promise<void>((ok, fail) => {
      img.onload = () => ok()
      img.onerror = () => fail(new Error('image load failed'))
    })
    img.src = objectUrl
    await (img.decode ? img.decode().catch(() => loaded) : loaded)
    return img
  } finally {
    // Safe: the decoded pixels belong to the element now, not the URL.
    URL.revokeObjectURL(objectUrl)
  }
}

/** WebP (or anything else) → JPEG, at original dimensions. */
async function toJpeg(blob: Blob, name: string): Promise<File> {
  const src = await decode(blob)
  try {
    const w = 'width' in src ? src.width : 0
    const h = 'height' in src ? src.height : 0
    if (!w || !h) throw new Error('image decoded with no dimensions')

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    // JPEG has no alpha channel. Without this fill, any transparent pixel in
    // the source WebP encodes as solid black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(src as CanvasImageSource, 0, 0)

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!out) throw new Error('jpeg encode failed')
    return new File([out], name, { type: 'image/jpeg' })
  } finally {
    if ('close' in src) src.close()
  }
}

/**
 * Fetch a listing's media and return share-ready files.
 *
 * URLs are re-resolved rather than trusting `media.url`: signed URLs live one
 * hour, and a board left open longer than that has dead ones. `resolveMediaUrls`
 * swallows failures by design (a media outage must not blank the board), so a
 * path simply missing from the returned map is the failure signal — never a
 * rejected promise.
 */
export async function listingShareFiles(
  listing: Listing,
  { includeVideo = false, signal, onProgress }: ShareFilesOptions = {},
): Promise<ShareFilesResult> {
  // Same source of truth as ListingGallery: photos are a filter, the video is a
  // single find. Photo and video `position` values overlap, so media_type must
  // be the primary split rather than raw array order.
  const photos = listing.listing_media.filter((m) => m.media_type === 'photo')
  const video = listing.listing_media.find((m) => m.media_type === 'video')

  const wanted: ListingMedia[] = [...photos, ...(includeVideo && video ? [video] : [])]
  if (wanted.length === 0) return { files: [], skipped: 0 }

  const urlByPath = await resolveMediaUrls(wanted)
  const base = slug(`${listing.address_line1}-${listing.city}`)

  const files: File[] = []
  let skipped = 0
  let done = 0

  // Strictly sequential. Four photos is small, but a 20 MB video alongside them
  // is not, and decoding several at once is how mid-range Android phones OOM.
  for (const media of wanted) {
    if (signal?.aborted) break
    const url = urlByPath.get(media.storage_path)
    if (!url) {
      skipped++
      done++
      onProgress?.(done, wanted.length)
      continue
    }

    try {
      // credentials omitted: the presigned URL carries its own auth in the
      // query string, and sending cookies would demand a credentialed CORS
      // response R2 is not configured to give.
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()

      if (media.media_type === 'photo') {
        files.push(await toJpeg(blob, `${files.length + 1}-${base}.jpg`))
      } else {
        // Video passes through untouched — re-encoding video in the browser
        // is not viable. Type comes from media_type, not the response.
        const ext = media.storage_path.split('.').pop()?.toLowerCase() ?? 'mp4'
        files.push(
          new File([blob], `${base}.${ext}`, { type: blob.type || `video/${ext}` }),
        )
      }
    } catch (e) {
      if (signal?.aborted) break
      console.debug('[LD Board] share media skipped:', media.storage_path, e)
      skipped++
    }
    done++
    onProgress?.(done, wanted.length)
    // Yield so the progress UI paints and cancel stays responsive.
    await new Promise((r) => setTimeout(r, 0))
  }

  return { files, skipped }
}

/**
 * Whether this browser will actually accept files in a share.
 *
 * `navigator.canShare` exists on browsers that still refuse files, so the test
 * has to pass a real File rather than checking for the method.
 */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
      return false
    }
    const probe = new File([new Uint8Array([0])], 'probe.jpg', { type: 'image/jpeg' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed'

/**
 * Share plain text through the OS share sheet.
 *
 * This exists so a broker with two WhatsApp accounts can choose which one
 * sends. A `wa.me` / `whatsapp://` link cannot express that — it just opens
 * whichever WhatsApp is the default handler, with no parameter for the sending
 * account. The system sheet is the only mechanism that lists WhatsApp and
 * WhatsApp Business as separate targets.
 *
 * Returns 'unsupported' where there is no Web Share (desktop Firefox, older
 * Chrome) so the caller can fall back to the wa.me link and nothing regresses.
 */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share !== 'function') return 'unsupported'
  try {
    await navigator.share({ text })
    return 'shared'
  } catch (e) {
    // Dismissing the sheet rejects with AbortError — a decision, not a failure.
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    console.debug('[LD Board] text share failed:', e)
    return 'failed'
  }
}

/** Whether the OS sheet is available for plain text. */
export function canShareText(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Hand the files to the OS share sheet.
 *
 * MUST be called inside a fresh user gesture — `navigator.share` requires
 * transient user activation, so fetching first and sharing in the same handler
 * throws NotAllowedError. That is why the dialog splits this across two taps.
 *
 * `text` is included in the hope WhatsApp uses it as a caption, but it is
 * frequently dropped when several images are attached — the caller also copies
 * it to the clipboard, which is the actual guarantee.
 */
export async function shareFiles(files: File[], text: string): Promise<ShareOutcome> {
  if (files.length === 0) return 'unsupported'
  if (typeof navigator.share !== 'function') return 'unsupported'
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files })) {
    return 'unsupported'
  }
  try {
    await navigator.share({ files, text })
    return 'shared'
  } catch (e) {
    // Dismissing the sheet rejects with AbortError. That is a decision, not a
    // failure, and must never surface as an error banner.
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    console.debug('[LD Board] share failed:', e)
    return 'failed'
  }
}
