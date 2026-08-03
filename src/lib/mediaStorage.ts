import { supabase } from './supabase'

/**
 * Storage adapter for listing media.
 *
 * Text stays in Supabase; photos/video live in Cloudflare R2 (10 GB free +
 * free egress). Files uploaded before the switch remain in Supabase Storage,
 * so every row carries a `storage_provider` and READS always handle both —
 * that is what makes the migration zero-downtime.
 *
 * Which backend NEW uploads go to is controlled by VITE_MEDIA_PROVIDER:
 *   unset / 'supabase' → Supabase Storage (default; safe before R2 is set up)
 *   'r2'               → Cloudflare R2 via the `media` Edge Function
 * Flipping it back is the rollback path — existing R2 files keep loading.
 *
 * R2 credentials never reach the browser: the client only ever receives
 * short-lived presigned URLs minted by the Edge Function.
 */
export type StorageProvider = 'supabase' | 'r2'

export interface StoredMedia {
  storage_path: string
  storage_provider?: StorageProvider
}

const BUCKET = 'listing-media'
const SIGNED_URL_TTL = 3600 // 1 hour, matches the previous behaviour

/** Where new uploads go. Reads always support both providers. */
export function activeProvider(): StorageProvider {
  return import.meta.env.VITE_MEDIA_PROVIDER === 'r2' ? 'r2' : 'supabase'
}

/** Photos are re-encoded to WebP; videos keep their original container. */
export function extensionFor(mediaType: 'photo' | 'video', file: File): string {
  if (mediaType === 'photo') return 'webp'
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext && /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'mp4'
}

async function callMediaFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('media', { body })
  if (error) {
    const errBody = await (error as { context?: Response }).context
      ?.json()
      .catch(() => null)
    throw new Error(errBody?.error ?? error.message)
  }
  return data as T
}

/**
 * Upload one file and return where it landed. Throws on failure so the caller
 * can surface a message; the listing row itself is never lost.
 */
export async function uploadMedia({
  listingId,
  file,
  mediaType,
}: {
  listingId: string
  file: File
  mediaType: 'photo' | 'video'
}): Promise<{ path: string; provider: StorageProvider }> {
  const ext = extensionFor(mediaType, file)

  if (activeProvider() === 'r2') {
    const { path, uploadUrl } = await callMediaFn<{ path: string; uploadUrl: string }>({
      action: 'upload-url',
      listingId,
      ext,
    })
    // Content-Type is intentionally not set: it isn't part of the signature,
    // and sending it here would break the presigned PUT.
    const res = await fetch(uploadUrl, { method: 'PUT', body: file })
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`)
    return { path, provider: 'r2' }
  }

  const path = `${listingId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return { path, provider: 'supabase' }
}

/**
 * Resolve display URLs for a mixed batch of media, one round trip per
 * provider. Paths the caller may not view (e.g. someone else's private
 * listing) simply come back missing.
 */
export async function resolveMediaUrls(
  items: StoredMedia[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (items.length === 0) return urls

  const supabasePaths = items
    .filter((m) => (m.storage_provider ?? 'supabase') === 'supabase')
    .map((m) => m.storage_path)
  const r2Paths = items
    .filter((m) => m.storage_provider === 'r2')
    .map((m) => m.storage_path)

  await Promise.all([
    (async () => {
      if (supabasePaths.length === 0) return
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(supabasePaths, SIGNED_URL_TTL)
      for (const s of data ?? []) {
        if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
      }
    })(),
    (async () => {
      if (r2Paths.length === 0) return
      try {
        const { urls: signed } = await callMediaFn<{ urls: Record<string, string> }>({
          action: 'read-urls',
          paths: r2Paths,
        })
        for (const [path, url] of Object.entries(signed ?? {})) urls.set(path, url)
      } catch {
        // A media outage must not blank the whole board — cards fall back to
        // their placeholder and the listing details still render.
      }
    })(),
  ])

  return urls
}

/**
 * Ask the server to cache a satellite thumbnail for a listing (fetched from
 * Mapbox once, stored in R2). Best-effort and deliberately silent: a listing
 * must still save if this fails, and cards simply fall back to a placeholder.
 * No-op until R2 is the active provider.
 */
export async function refreshStaticMap(
  listingId: string,
  lat: number,
  lng: number,
): Promise<void> {
  if (activeProvider() !== 'r2') return
  try {
    await callMediaFn({ action: 'static-map', listingId, lat, lng })
  } catch {
    // Non-fatal by design — never block saving a listing on a thumbnail.
  }
}

/** Delete files from whichever store holds them. Best-effort per provider. */
export async function deleteMedia(items: StoredMedia[]): Promise<void> {
  if (items.length === 0) return

  const supabasePaths = items
    .filter((m) => (m.storage_provider ?? 'supabase') === 'supabase')
    .map((m) => m.storage_path)
  const r2Paths = items
    .filter((m) => m.storage_provider === 'r2')
    .map((m) => m.storage_path)

  await Promise.all([
    supabasePaths.length > 0
      ? supabase.storage.from(BUCKET).remove(supabasePaths)
      : Promise.resolve(),
    r2Paths.length > 0
      ? callMediaFn({ action: 'delete', paths: r2Paths }).catch(() => undefined)
      : Promise.resolve(),
  ])
}
