/**
 * Map provider configuration.
 *
 * Two providers, split by cost and by what each is genuinely best at:
 *
 *  - **Mapbox** renders everything the team browses (Map View, listing detail,
 *    and the cached card thumbnails). 50,000 free map loads/month, and a map
 *    load includes unlimited tile requests — so panning and zooming are free.
 *  - **Google** is used *only* to place a pin when adding a property, because
 *    its Indian address/POI search is materially better. That path runs a few
 *    hundred loads a month against a 10,000 free cap.
 *
 * Coordinates are provider-neutral (both use WGS84), so a pin placed in Google
 * renders on the identical spot in Mapbox with no conversion — and dropping
 * either vendor later leaves the stored data untouched.
 */

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined

/** Satellite imagery with road/place labels on top — what brokers navigate by. */
export const MAPBOX_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12'

/** Raipur — the default view before a pin exists. */
export const DEFAULT_CENTER = { lat: 21.2514, lng: 81.6296 }
export const DEFAULT_ZOOM = 12
/** Close enough to make out plot boundaries in satellite view. */
export const PIN_ZOOM = 17

export const hasMapbox = (): boolean => Boolean(MAPBOX_TOKEN)
export const hasGoogleMaps = (): boolean => Boolean(GOOGLE_MAPS_KEY)
