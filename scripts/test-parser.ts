import {
  mergeParsed,
  ruleBasedParser,
  type ListingDraft,
} from '../src/lib/listingParser'

const samples: { label: string; text: string; expect: Record<string, unknown> }[] = [
  {
    label: 'classic sqft + rate',
    text: `Kachna main road, Raipur
2400 sqft residential plot
Rate 1850 per sqft
Owner direct, 9876543210`,
    expect: { area: 2400, area_unit: 'sqft', rate: 1850, rate_unit: 'sqft', property_type: 'Residential Plot', contact_type: 'Owner direct', city: 'Raipur' },
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

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
