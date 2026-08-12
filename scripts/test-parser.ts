import {
  mergeParsed,
  ruleBasedParser,
  type ListingDraft,
} from '../src/lib/listingParser'
import { isShortMapsLink, parseCoords } from '../src/lib/geo'
import { parseAmountInput, splitAmount } from '../src/lib/amount'

const samples: { label: string; text: string; expect: Record<string, unknown> }[] = [
  {
    label: 'classic sqft + rate',
    text: `Kachna main road, Raipur
2400 sqft residential plot
Rate 1850 per sqft
Owner direct, 9876543210`,
    expect: { area: 2400, area_unit: 'sqft', rate: 1850, rate_unit: 'sqft', property_type: 'Residential Plot', contact_type: 'Owner', city: 'Raipur' },
  },
  {
    // An owner claim beats a "direct" claim: "owner direct" means the owner is
    // reachable, not that there is one broker in the chain.
    label: 'contact: "owner direct" is Owner, not Direct',
    text: 'Tagore Nagar, 1500 sqft plot, owner direct',
    expect: { contact_type: 'Owner' },
  },
  {
    label: 'contact: bare "direct" with no owner word is Direct',
    text: 'Kachna, 1500 sqft plot, direct deal, no chain',
    expect: { contact_type: 'Direct' },
  },
  {
    label: 'contact: broker with no owner/direct claim is Broker',
    text: 'Shankar Nagar, 1500 sqft plot, broker ke through',
    expect: { contact_type: 'Broker' },
  },
  {
    label: 'contact: "malik" (Hindi for owner) is Owner',
    text: 'Gudhiyari, 200 gaj, seedha malik se baat karo',
    expect: { contact_type: 'Owner' },
  },
  {
    label: 'acre + per-acre rate',
    text: `Amleshwar farm land
2 acre agricultural
80 lakh per acre
30 ft front`,
    expect: { area: 2, area_unit: 'acre', rate: 8000000, rate_unit: 'acre', front: 30, front_unit: 'ft' },
  },
  {
    label: 'decimal (Chhattisgarh unit)',
    text: `Dharsiwa
40 decimal plot
@ 1200 psf`,
    expect: { area: 17424, area_unit: 'sqft' },
  },
  {
    label: 'gaj',
    text: `Bhilai
200 gaj residential
sold`,
    expect: { area: 1800, area_unit: 'sqft', status: 'Sold' },
  },
  {
    label: 'commercial + pincode',
    text: `Office no 18, Eraya complex
Naya Raipur
commercial 3200 sqft
pin code 492001
rate 5000/sqft`,
    expect: { property_type: 'Commercial Plot', area: 3200, rate: 5000, pincode: '492001' },
  },
  {
    label: 'hectare converts to acre',
    text: `Rajnandgaon
1 hectare kheti ki zameen`,
    expect: { area_unit: 'acre', property_type: 'Agricultural' },
  },
  {
    label: 'indian comma grouping',
    text: `Kumhari
4,800 sqft industrial godown
rate 3,200 per sqft`,
    expect: { area: 4800, rate: 3200, property_type: 'Industrial' },
  },
  {
    label: '@ infers sqft from a sqft plot',
    text: '2400sq.feet residential plot, @2500',
    expect: { area: 2400, area_unit: 'sqft', rate: 2500, rate_unit: 'sqft', property_type: 'Residential Plot' },
  },
  {
    label: '@ infers acre from an acre plot (and "acer" spelling)',
    text: '5 acer agriculture plot, @3000000',
    expect: { area: 5, area_unit: 'acre', rate: 3000000, rate_unit: 'acre', property_type: 'Agricultural' },
  },
  {
    label: '"price 45 lakh" is a TOTAL, must not become a rate',
    text: `Shankar Nagar
2400 sqft plot
price 45 lakh`,
    expect: { area: 2400, rate: undefined },
  },
  {
    label: 'a spec-only line must NOT become the address',
    text: '2400sq.feet residential plot, @2500',
    expect: { area: 2400, rate: 2500, address_line1: undefined },
  },
  {
    label: 'a real address line is still used',
    text: `Plot 42, near water tank
2400 sqft, @2500`,
    expect: { address_line1: 'Plot 42, near water tank', area: 2400, rate: 2500 },
  },
  {
    label: 'sq/ft with a slash separator',
    text: `residential plot 5000sq/ft
@3000`,
    expect: { area: 5000, area_unit: 'sqft', rate: 3000, rate_unit: 'sqft', property_type: 'Residential Plot', address_line1: undefined },
  },
  {
    label: 'other sqft spellings',
    text: '1200 sq-ft plot @1500',
    expect: { area: 1200, area_unit: 'sqft', rate: 1500 },
  },
]

let pass = 0
let fail = 0
for (const s of samples) {
  const { fields } = await ruleBasedParser.parse(s.text)
  const misses: string[] = []
  for (const [k, v] of Object.entries(s.expect)) {
    const got = (fields as Record<string, unknown>)[k]
    const ok = typeof v === 'number' ? Math.abs((got as number) - v) < 0.5 : got === v
    if (!ok) misses.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got)}`)
  }
  if (misses.length === 0) {
    pass++
    console.log(`PASS  ${s.label}`)
  } else {
    fail++
    console.log(`FAIL  ${s.label}`)
    misses.forEach((m) => console.log(`        ${m}`))
    console.log(`        parsed: ${JSON.stringify(fields)}`)
  }
}
// ---------------------------------------------------------------------------
// mergeParsed — how the AI result layers over the rule-based one.
// These run without network or a Gemini key; they pin the merge contract only.
// ---------------------------------------------------------------------------

const mergeCases: {
  label: string
  base: ListingDraft
  overlay: ListingDraft
  expect: Record<string, unknown>
}[] = [
  {
    label: 'merge: AI wins where both filled a field',
    base: { area: 2400, area_unit: 'sqft', city: 'Raipur' },
    overlay: { area: 5000, area_unit: 'sqft' },
    expect: { area: 5000, area_unit: 'sqft', city: 'Raipur' },
  },
  {
    label: 'merge: rules fill the gaps AI left',
    base: { area: 2400, area_unit: 'sqft', city: 'Raipur', property_type: 'Residential Plot' },
    overlay: { rate: 1850, rate_unit: 'sqft' },
    expect: { area: 2400, city: 'Raipur', property_type: 'Residential Plot', rate: 1850 },
  },
  {
    label: 'merge: a unit pair is replaced whole (acre must not inherit sqft)',
    base: { area: 5, area_unit: 'sqft' },
    overlay: { area: 5, area_unit: 'acre' },
    expect: { area: 5, area_unit: 'acre' },
  },
  {
    label: 'merge: a value without its unit is ignored entirely',
    base: { area: 2400, area_unit: 'sqft' },
    overlay: { area: 5 },
    expect: { area: 2400, area_unit: 'sqft' },
  },
  {
    label: 'merge: empty strings from the model never overwrite',
    base: { address_line1: 'Plot 42, near water tank', city: 'Raipur' },
    overlay: { address_line1: '', city: 'Bhilai' },
    expect: { address_line1: 'Plot 42, near water tank', city: 'Bhilai' },
  },
  {
    // The rules keep "@3000" as a leftover line; once the AI has captured it
    // as rate=3000 there is nothing left over, so the stale note must go.
    label: 'merge: notes are cleared when the overlay found nothing left over',
    base: { rate: 3000, rate_unit: 'sqft', notes: '@3000' },
    overlay: { rate: 3000, rate_unit: 'sqft' },
    expect: { rate: 3000, notes: undefined },
  },
  {
    label: 'merge: notes the overlay did supply still win',
    base: { notes: '@3000' },
    overlay: { notes: 'corner plot, boundary wall' },
    expect: { notes: 'corner plot, boundary wall' },
  },
]

for (const c of mergeCases) {
  const merged = mergeParsed(
    { fields: c.base, autofilled: new Set(Object.keys(c.base) as (keyof ListingDraft)[]), unmatched: [] },
    c.overlay,
  )
  const misses: string[] = []
  for (const [k, v] of Object.entries(c.expect)) {
    const got = (merged.fields as Record<string, unknown>)[k]
    if (got !== v) misses.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got)}`)
  }
  if (misses.length === 0) {
    pass++
    console.log(`PASS  ${c.label}`)
  } else {
    fail++
    console.log(`FAIL  ${c.label}`)
    misses.forEach((m) => console.log(`        ${m}`))
    console.log(`        merged: ${JSON.stringify(merged.fields)}`)
  }
}

// ---------------------------------------------------------------------------
// parseCoords — every format below is one a broker actually pasted into the
// location box. Pinned here because a silent null is invisible in the UI.
// ---------------------------------------------------------------------------

const RAIPUR = { lat: 21.2514, lng: 81.6296 }

const coordCases: { label: string; text: string; expect: typeof RAIPUR | null }[] = [
  { label: 'coords: plain "lat, lng"', text: '21.2514, 81.6296', expect: RAIPUR },
  { label: 'coords: no space', text: '21.2514,81.6296', expect: RAIPUR },
  {
    label: 'coords: desktop URL with /@lat,lng,zoom',
    text: 'https://www.google.com/maps/place/Gudhiyari/@21.2514,81.6296,15z/data=!3m1',
    expect: RAIPUR,
  },
  {
    label: 'coords: official ?api=1&query= format',
    text: 'https://www.google.com/maps/search/?api=1&query=21.2514,81.6296',
    expect: RAIPUR,
  },
  { label: 'coords: ?q=', text: 'https://www.google.com/maps?q=21.2514,81.6296', expect: RAIPUR },
  { label: 'coords: &ll=', text: 'https://maps.google.com/?ll=21.2514,81.6296&z=17', expect: RAIPUR },
  {
    label: 'coords: !3d..!4d.. inside the data= segment',
    text: 'https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0!3d21.2514!4d81.6296!16s',
    expect: RAIPUR,
  },
  {
    label: 'coords: /place/lat,lng',
    text: 'https://www.google.com/maps/place/21.2514,81.6296',
    expect: RAIPUR,
  },
  { label: 'coords: geo: URI', text: 'geo:21.2514,81.6296', expect: RAIPUR },
  {
    label: 'coords: degree + hemisphere (what Maps shows on long-press)',
    text: '21.2514° N, 81.6296° E',
    expect: RAIPUR,
  },
  {
    label: 'coords: embedded in a sentence',
    text: 'Plot 42 near water tank — 21.2514, 81.6296 , ask for Ramesh',
    expect: RAIPUR,
  },
  { label: 'coords: integers only', text: '21, 81', expect: { lat: 21, lng: 81 } },
  // DMS — what Google Maps puts in the search box when you copy coordinates.
  // 21 + 18/60 + 11.2/3600 = 21.303111 ; 81 + 35/60 + 3.3/3600 = 81.584250
  {
    label: 'coords: DMS as Google Maps writes it',
    text: `21°18'11.2"N 81°35'03.3"E`,
    expect: { lat: 21.3031111, lng: 81.58425 },
  },
  {
    label: 'coords: DMS with a comma separator',
    text: `21°18'11.2"N, 81°35'03.3"E`,
    expect: { lat: 21.3031111, lng: 81.58425 },
  },
  {
    label: 'coords: DMS with curly primes and spaces',
    text: `21° 18′ 11.2″ N  81° 35′ 03.3″ E`,
    expect: { lat: 21.3031111, lng: 81.58425 },
  },
  {
    label: 'coords: DMS southern/western hemisphere is negated',
    text: `21°18'11.2"S 81°35'03.3"W`,
    expect: { lat: -21.3031111, lng: -81.58425 },
  },
  {
    label: 'coords: degrees + decimal minutes (no seconds)',
    text: `21°18.1867'N 81°35.055'E`,
    expect: { lat: 21.3031111, lng: 81.58425 },
  },
  {
    label: 'coords: DMS pasted longitude-first still maps correctly',
    text: `81°35'03.3"E 21°18'11.2"N`,
    expect: { lat: 21.3031111, lng: 81.58425 },
  },
  // Rejections — each of these previously produced a wrong pin or a crash.
  { label: 'coords: rejects a short link (no coords in it)', text: 'https://maps.app.goo.gl/AbC123', expect: null },
  { label: 'coords: rejects plain prose', text: 'Kachna main road, Raipur', expect: null },
  { label: 'coords: rejects out-of-range latitude', text: '210.5, 81.6', expect: null },
  { label: 'coords: rejects empty', text: '   ', expect: null },
]

for (const c of coordCases) {
  const got = parseCoords(c.text)
  const ok =
    c.expect === null
      ? got === null
      : got !== null &&
        Math.abs(got.lat - c.expect.lat) < 1e-6 &&
        Math.abs(got.lng - c.expect.lng) < 1e-6
  if (ok) {
    pass++
    console.log(`PASS  ${c.label}`)
  } else {
    fail++
    console.log(`FAIL  ${c.label}`)
    console.log(`        expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`)
  }
}

for (const [text, want] of [
  ['https://maps.app.goo.gl/AbC123', true],
  ['https://goo.gl/maps/AbC123', true],
  ['https://www.google.com/maps?q=21.25,81.63', false],
] as const) {
  const got = isShortMapsLink(text)
  if (got === want) {
    pass++
    console.log(`PASS  shortlink: ${text.slice(0, 40)} -> ${want}`)
  } else {
    fail++
    console.log(`FAIL  shortlink: ${text} expected ${want}, got ${got}`)
  }
}

// ---------------------------------------------------------------------------
// parseAmountInput — the rate field's K / L / Cr shorthand.
//
// The critical case is "5.5k". parseFloat("5.5k") returns 5.5, so a rate field
// that accepts text and still uses parseFloat saves ₹5.5 where ₹5,500 was
// meant — passing every validity check and looking plausible on the card.
// ---------------------------------------------------------------------------

for (const [input, wantValue, wantMag] of [
  ['5.5k', 5500, 'k'],
  ['4L', 400000, 'l'],
  ['1Cr', 10000000, 'cr'],
  ['1 cr', 10000000, 'cr'],
  ['2 lakh', 200000, 'l'],
  ['3 crores', 30000000, 'cr'],
  ['1850', 1850, null],
  ['45,00,000', 4500000, null],
  ['₹45,00,000', 4500000, null],
  ['0.5cr', 5000000, 'cr'],
  // Rejections — each of these must NOT silently become a number.
  ['', null, null],
  ['abc', null, null],
  ['4LL', null, null],
  ['5.5kk', null, null],
  ['1850/sqft', null, null],
] as const) {
  const got = parseAmountInput(input)
  const ok =
    wantValue === null
      ? got === null
      : got !== null && Math.abs(got.value - wantValue) < 1e-6 && got.magnitude === wantMag
  if (ok) {
    pass++
    console.log(`PASS  amount: ${JSON.stringify(input)} -> ${wantValue ?? 'null'}`)
  } else {
    fail++
    console.log(
      `FAIL  amount: ${JSON.stringify(input)} expected ${wantValue ?? 'null'}/${wantMag}, got ${JSON.stringify(got)}`,
    )
  }
}

// splitAmount — how a saved rate reopens in the edit form. Never below 1 lakh.
for (const [value, wantDisplay, wantMag] of [
  [400000, '4', 'l'],
  [10000000, '1', 'cr'],
  [8000000, '80', 'l'],
  [12500000, '1.25', 'cr'],
  [1850, '1850', null],
  [5900, '5900', null],
  // Not clean enough to split — raw digits are clearer than "1.8734 L".
  [187340, '187340', null],
] as const) {
  const got = splitAmount(value)
  if (got.display === wantDisplay && got.magnitude === wantMag) {
    pass++
    console.log(`PASS  splitAmount: ${value} -> ${wantDisplay}${wantMag ?? ''}`)
  } else {
    fail++
    console.log(
      `FAIL  splitAmount: ${value} expected ${wantDisplay}/${wantMag}, got ${JSON.stringify(got)}`,
    )
  }
}

// Round-trip: whatever splitAmount shows must parse back to the same value.
for (const value of [400000, 10000000, 8000000, 12500000, 1850, 5900, 187340]) {
  const { display, magnitude } = splitAmount(value)
  const back = parseAmountInput(display)
  const resolved = back ? back.value * (magnitude ? { k: 1e3, l: 1e5, cr: 1e7 }[magnitude] : 1) : NaN
  if (Math.abs(resolved - value) < 1e-6) {
    pass++
    console.log(`PASS  round-trip: ${value}`)
  } else {
    fail++
    console.log(`FAIL  round-trip: ${value} came back as ${resolved}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
