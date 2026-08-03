import { ruleBasedParser } from '../src/lib/listingParser'

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
console.log(`\n${pass} passed, ${fail} failed`)
