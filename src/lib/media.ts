import imageCompression from 'browser-image-compression'
import {
  PHOTO_MAX_DIMENSION,
  PHOTO_SOURCE_MAX_BYTES,
  PHOTO_TARGET_MB,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
} from './limits'

export function prettyBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/**
 * Client-side photo pipeline: reject oversized sources, then resize to
 * ≤1600px and recompress to roughly ≤500 KB JPEG before anything is uploaded.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image`)
  }
  if (file.size > PHOTO_SOURCE_MAX_BYTES) {
    throw new Error(
      `${file.name} is ${prettyBytes(file.size)} — photos over ${prettyBytes(PHOTO_SOURCE_MAX_BYTES)} are not accepted`,
    )
  }
  return imageCompression(file, {
    maxWidthOrHeight: PHOTO_MAX_DIMENSION,
    maxSizeMB: PHOTO_TARGET_MB,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
    useWebWorker: true,
  })
}

/** Reads video duration in the browser via a detached <video> element. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the video file'))
    }
    video.src = url
  })
}

/**
 * Both video caps checked BEFORE upload: file size and duration.
 * Returns the duration so the UI can show it.
 */
export async function validateVideo(file: File): Promise<number> {
  if (!file.type.startsWith('video/')) {
    throw new Error(`${file.name} is not a video`)
  }
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error(
      `Video is ${prettyBytes(file.size)} — the cap is ${prettyBytes(VIDEO_MAX_BYTES)}. Try a shorter or lower-quality clip.`,
    )
  }
  const duration = await readVideoDuration(file)
  if (duration > VIDEO_MAX_SECONDS + 0.5) {
    throw new Error(
      `Video is ${Math.round(duration)}s long — the cap is ${VIDEO_MAX_SECONDS} seconds.`,
    )
  }
  return duration
}
