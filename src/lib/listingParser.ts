import type {
  AreaUnit,
  ContactType,
  FrontUnit,
  ListingStatus,
  RateUnit,
} from './types'

/**
 * Turns free text — a WhatsApp lead, or a description typed against a map pin
 * — into pre-filled listing fields.
 *
 * Rule-based on purpose: free, instant, offline, and completely predictable.
 * Accuracy doesn't need to be perfect because **nothing is ever saved without
 * the broker reviewing the form**; the parser's job is to remove typing, not
 * to be authoritative. `autofilled` tells the UI which fields came from text
 * so they can be flagged for checking.
 *
 * The `ListingParser` interface exists so an AI-backed parser can replace the
 * rules later without touching any calling code.
 */
export interface ListingDraft {
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  pincode?: string
  property_type?: string
  area?: number
  area_unit?: AreaUnit
  rate?: number
  rate_unit?: RateUnit
  front?: number
  front_unit?: FrontUnit
  contact_type?: ContactType
  status?: ListingStatus
  notes?: string
  latitude?: number
  longitude?: number
}

export interface ParsedListing {
  fields: ListingDraft
  /** Keys of `fields` that were inferred from the text. */
  autofilled: Set<keyof ListingDraft>
  /** Lines the parser could not map to anything — kept for the notes field. */
  unmatched: string[]
}

export interface ListingParser {
  parse(text: string): Promise<ParsedListing>
}

/** Area conversions common in Chhattisgarh property talk. */
const SQFT_PER = {
  sqft: 1,
  gaj: 9, // sq yard
  decimal: 435.6, // 1/100 acre
  guntha: 1089,
  acre: 43560,
  hectare: 107639,
} as const

/** Strips Indian digit grouping ("45,00,000") before parsing. */
function num(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''))
}

/** "45 lakh" → 4500000, "1.2 cr" → 12000000. */
function applyMagnitude(value: number, word: string | undefined): number {
  if (!word) return value
  const w = word.toLowerCase()
  if (/^(l|lac|lakh|lakhs)$/.test(w)) return value * 100_000
  if (/^(cr|crore|crores)$/.test(w)) return value * 10_000_000
  if (/^(k|thousand)$/.test(w)) return value * 1_000
  return value
}

const TYPE_PATTERNS: [RegExp, string][] = [
  [/\b(commercial|shop|showroom|office)\b/i, 'Commercial Plot'],
  [/\b(agricultur\w*|farm\s*land|kheti|krishi)\b/i, 'Agricultural'],
  [/\b(farm\s*house|farmhouse)\b/i, 'Farmhouse Land'],
  [/\b(industrial|factory|warehouse|godown)\b/i, 'Industrial'],
  [/\b(residential|residency|housing|makan|ghar)\b/i, 'Residential Plot'],
  // Bare "plot"/"land" is the weakest signal, so it is checked last.
  [/\b(plot|zameen|jameen|land)\b/i, 'Residential Plot'],
]

export const ruleBasedParser: ListingParser = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async parse(text: string): Promise<ParsedListing> {
    const fields: ListingDraft = {}
    const autofilled = new Set<keyof ListingDraft>()
    const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => {
      if (v === undefined || v === null) return
      fields[k] = v
      autofilled.add(k)
    }

    const t = text.replace(/ /g, ' ')

    // ---- area + unit -------------------------------------------------------
    const areaRe = new RegExp(
      String.raw`(\d[\d,]*(?:\.\d+)?)\s*` +
        String.raw`(sq\.?\s*ft|sqft|sq\.?\s*feet|square\s*feet|sq\.?\s*yd|gaj|gaz|` +
        String.raw`decimal|dismil|guntha|acres?|acers?|ekad|ekar|hectares?|ha)\b`,
      'i',
    )
    const areaM = t.match(areaRe)
    if (areaM) {
      const value = num(areaM[1])
      const unitWord = areaM[2].toLowerCase().replace(/[.\s]/g, '')
      let unit: AreaUnit = 'sqft'
      let converted = value
      if (/^(acres?|acers?|ekad|ekar)$/.test(unitWord)) {
        unit = 'acre'
      } else if (/^(hectares?|ha)$/.test(unitWord)) {
        // No hectare unit in the schema — express it in acres.
        unit = 'acre'
        converted = (value * SQFT_PER.hectare) / SQFT_PER.acre
      } else if (/^(gaj|gaz|sqyd)$/.test(unitWord)) {
        converted = value * SQFT_PER.gaj
      } else if (/^(decimal|dismil)$/.test(unitWord)) {
        converted = value * SQFT_PER.decimal
      } else if (/^guntha$/.test(unitWord)) {
        converted = value * SQFT_PER.guntha
      }
      if (Number.isFinite(converted) && converted > 0) {
        set('area', Math.round(converted * 100) / 100)
        set('area_unit', unit)
      }
    }

    // ---- rate --------------------------------------------------------------
    // A rate MUST carry an explicit signal, otherwise "2400 sqft" (an area)
    // parses as a price — which silently produced garbage rates until the
    // parser tests caught it. Accepted signals, in order of confidence:
    //   1. a cue word/symbol:  "rate 1850 per sqft", "@1850/sqft", "₹5000 sqft"
    //   2. a per/slash split:  "80 lakh per acre", "1850/sqft"
    //   3. the psf suffix:     "1200 psf"
    const UNIT = String.raw`sq\.?\s*ft|sqft|sq\.?\s*feet|square\s*feet|acres?|acers?|gaj|gaz`
    const MAG = String.raw`k|lac|lakh|lakhs|cr|crore|crores`
    const ratePatterns = [
      new RegExp(
        String.raw`(?:@|\brate\b|\bprice\b|\brs\.?|₹)\s*[:-]?\s*(\d[\d,]*(?:\.\d+)?)\s*(${MAG})?\s*(?:\/|per\s+)?\s*(${UNIT}|psf)\b`,
        'i',
      ),
      new RegExp(
        String.raw`(\d[\d,]*(?:\.\d+)?)\s*(${MAG})?\s*(?:\/|per\s+)\s*(${UNIT})\b`,
        'i',
      ),
      new RegExp(String.raw`(\d[\d,]*(?:\.\d+)?)\s*(${MAG})?\s*(psf)\b`, 'i'),
    ]
    let rateM: RegExpMatchArray | null = null
    for (const re of ratePatterns) {
      rateM = t.match(re)
      if (rateM) break
    }

    // 4. Bare "@2500" with no unit. Brokers write the rate in whatever unit
    //    the plot is measured in — "@2500" on a sqft plot means ₹2,500/sqft,
    //    "@3000000" on an acre plot means ₹30,00,000/acre — so inherit the
    //    area's unit.
    //
    //    Deliberately limited to "@": "price 45 lakh" almost always means the
    //    TOTAL, and treating that as a rate would be wildly wrong. "@" is the
    //    one symbol brokers use unambiguously for a rate.
    let inferredRateUnit: RateUnit | null = null
    if (!rateM) {
      const bare = t.match(
        new RegExp(String.raw`@\s*[:-]?\s*₹?\s*(\d[\d,]*(?:\.\d+)?)\s*(${MAG})?`, 'i'),
      )
      if (bare) {
        inferredRateUnit = fields.area_unit ?? 'sqft'
        const value = applyMagnitude(num(bare[1]), bare[2])
        if (Number.isFinite(value) && value > 0) {
          set('rate', Math.round(value * 100) / 100)
          set('rate_unit', inferredRateUnit)
        }
      }
    }

    if (rateM) {
      const value = applyMagnitude(num(rateM[1]), rateM[2])
      const unitWord = rateM[3].toLowerCase().replace(/[.\s]/g, '')
      let rateUnit: RateUnit = 'sqft'
      let rate = value
      if (unitWord === 'psf') {
        rateUnit = 'sqft'
      } else if (/^(acres?|acers?)$/.test(unitWord)) {
        rateUnit = 'acre'
      } else if (/^(gaj|gaz)$/.test(unitWord)) {
        // Quoted per gaj — convert to per sqft so the schema stays consistent.
        rate = value / SQFT_PER.gaj
      }
      if (Number.isFinite(rate) && rate > 0) {
        set('rate', Math.round(rate * 100) / 100)
        set('rate_unit', rateUnit)
      }
    }

    // ---- front (road-facing length) ---------------------------------------
    const frontM =
      t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:ft|feet|fit|m|meter|metre)?\s*(?:front|facing|road[-\s]?facing)\b/i) ??
      t.match(/\bfront\s*[:-]?\s*(\d[\d,]*(?:\.\d+)?)\s*(ft|feet|fit|m|meter|metre)?\b/i)
    if (frontM) {
      const value = num(frontM[1])
      const unitWord = (frontM[2] ?? '').toLowerCase()
      if (Number.isFinite(value) && value > 0) {
        set('front', value)
        set('front_unit', /^(m|meter|metre)$/.test(unitWord) ? 'm' : 'ft')
      }
    }

    // ---- pincode -----------------------------------------------------------
    const pinM = t.match(/\b([1-9]\d{5})\b/)
    // Guard against catching a 6-digit price: require a nearby pin cue, or no
    // other 6-digit-looking money context on that line.
    if (pinM && /\b(pin|pincode|pin\s*code)\b/i.test(t)) {
      set('pincode', pinM[1])
    }

    // ---- property type -----------------------------------------------------
    for (const [re, type] of TYPE_PATTERNS) {
      if (re.test(t)) {
        set('property_type', type)
        break
      }
    }

    // ---- status ------------------------------------------------------------
    if (/\bsold\b/i.test(t)) set('status', 'Sold')
    else if (/\b(under\s*discussion|negotiation|talks?\s*on|hold)\b/i.test(t))
      set('status', 'Under discussion')

    // ---- contact type ------------------------------------------------------
    if (/\b(owner|direct\s*owner|owner\s*direct)\b/i.test(t)) {
      set('contact_type', 'Owner direct')
    } else if (/\b(broker|agent|dalal)\b/i.test(t)) {
      set('contact_type', 'Broker')
    }

    // ---- address -----------------------------------------------------------
    // The first non-empty line is almost always the location in broker
    // messages ("Kachna main road", "Plot 42, Ring Road 2").
    const lines = t
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length > 0) {
      const first = lines[0].replace(/^[*#•\-\s]+/, '').slice(0, 120)
      // A "spec" line ("2400sq.feet residential plot, @2500") is a description,
      // not an address — taking it would overwrite a perfectly good locality
      // from the map pin with the sentence the broker just typed.
      const looksLikeSpec =
        areaRe.test(first) || ratePatterns.some((re) => re.test(first)) || /@/.test(first)
      // Also skip lines that are purely numeric/price noise.
      if (first && /[a-z]{3}/i.test(first) && !looksLikeSpec) {
        set('address_line1', first)
      }
    }

    const cityM = t.match(
      /\b(raipur|bhilai|durg|bilaspur|rajnandgaon|korba|jagdalpur|ambikapur|dhamtari|mahasamund|naya\s*raipur|kumhari|amleshwar|dharsiwa)\b/i,
    )
    if (cityM) {
      const c = cityM[1].replace(/\s+/g, ' ').toLowerCase()
      // Title-case each word so "naya raipur" → "Naya Raipur".
      set(
        'city',
        c.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      )
    }

    // ---- leftovers become the notes ---------------------------------------
    // Skip lines whose content was already captured as structured fields —
    // otherwise the notes just repeat the area/rate the form already shows.
    const consumed = [areaRe, ...ratePatterns, /front|facing/i, /\b\d{10}\b/]
    const unmatched = lines.slice(1).filter((l) => !consumed.some((re) => re.test(l)))
    if (unmatched.length > 0) set('notes', unmatched.join('\n').slice(0, 1000))

    return { fields, autofilled, unmatched }
  },
}
