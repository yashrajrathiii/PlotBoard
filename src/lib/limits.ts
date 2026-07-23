// Media limits — change these numbers here and the whole app follows.
// (The storage bucket also caps files at 20 MB server-side; if you raise
// VIDEO_MAX_BYTES above that, raise the bucket's file_size_limit too.)

/** Max photos per listing. */
export const PHOTO_LIMIT = 4

/** Reject source photos bigger than this before compressing. */
export const PHOTO_SOURCE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/** Compression targets: longest edge and approximate output size. */
export const PHOTO_MAX_DIMENSION = 1600
export const PHOTO_TARGET_MB = 0.5

/** Max videos per listing. */
export const VIDEO_LIMIT = 1

/** Video hard caps, both checked in the browser before upload. */
export const VIDEO_MAX_SECONDS = 30
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024 // 20 MB
