# Text → listing parser

Brokers already have their leads as WhatsApp text. The parser turns that text
into a pre-filled listing form so posting is a review, not a retype. It runs in
two places:

- **Import from WhatsApp** (`/import`) — paste a message
- **Add from map** (`/map/add`) — drop a pin, then describe the plot

**Nothing is ever saved from parsed text.** Both flows land on the normal
listing form with the extracted fields flagged, and the broker confirms. That
review step is what makes an imperfect parser acceptable.

---

## Two engines, one interface

```ts
interface ListingParser { parse(text: string): Promise<ParsedListing> }
```

| Engine | Where | Used |
| --- | --- | --- |
| `ruleBasedParser` | `src/lib/listingParser.ts` | Always — instant, free, offline |
| `smartParser` | `src/lib/aiParser.ts` | What the app calls: Gemini, with the rules as its floor |

`smartParser` runs **both**. The rule-based parser goes first (no network, no
cost), then Gemini layers on top: AI values win where it produced one, rules
fill every gap it left. Any failure at all — no key, offline, timeout,
rate-limited, malformed reply — silently returns the rule-based result.

The UI shows which engine ran: the amber banner on the form reads **"read by
AI"** or **"read offline"**. That is the quickest way to confirm the key works.

### Why not rules alone

Free broker text has a long tail regex keeps losing to. Three separate bugs
shipped and were fixed in one week — `sq/ft` vs `sq.ft` separators, the rate
pattern matching the *area*, and a spec line being taken as the address. Each
fix only covered the case we happened to see.

The distinction rules genuinely cannot make is **rate vs total**: "@2500" on a
2400 sqft plot is a per-sqft rate, but "price 45 lakh" is the whole deal. That
needs reading comprehension, not pattern matching.

### Why keep the rules

They are the offline floor and the regression suite. `npm run test:parser`
pins 25 cases — 18 for the rules, 7 for the merge — and runs with no network
and no key.

---

## What it extracts

Address (locality/road), city, state, pincode, property type, area + unit,
rate + unit, frontage + unit, contact type, status, and whatever is genuinely
left over as notes.

Two of those carry rules worth knowing.

### Area units

Only `sqft` and `acre` are stored, so everything else is converted:

| Written | Becomes |
| --- | --- |
| gaj / gaz / sq yard | × 9 sqft |
| decimal / dismil | × 435.6 sqft |
| guntha | × 1089 sqft |
| hectare | × 2.4711 **acre** |
| acer / ekad / ekar | acre (common misspellings) |

A rate quoted per gaj is divided by 9 so it lands as ₹/sqft — keeping the deal
value identical either way. "200 gaj @ ₹1800/gaj" and "1800 sqft @ ₹200/sqft"
both come out as ₹3,60,000.

### Contact type — checked most-specific-first

| Value | Meaning | Signals |
| --- | --- | --- |
| `Owner` | the contact owns it | "owner", "malik", "maalik" |
| `Direct` | exactly one broker in between | "direct", with no owner word |
| `Broker` | a longer chain | "broker", "agent", "dalal" |

**An owner claim beats a "direct" claim.** A broker writing "owner direct" is
saying the owner is reachable — not that there is one broker in the chain — so
that phrase resolves to `Owner`, not `Direct`. Bare "direct" with no owner word
is the middle case. This precedence is pinned by four tests, because getting it
backwards silently mislabels how close a lead actually is.

---

## The merge

`mergeParsed(base, overlay)` in `listingParser.ts`. One rule matters more than
the rest:

> **A value and its unit move together.** Taking the AI's `area` while keeping
> the rules' `area_unit` could turn 5 acres into 5 sqft. `area`/`area_unit`,
> `rate`/`rate_unit` and `front`/`front_unit` are each applied only when the
> overlay supplies **both** halves.

This is why the merge is not an object spread, and there are tests pinning it.

One field breaks the gap-filling rule: **`notes` is owned by the AI outright**
when it runs. Notes is derived from whatever is *left over* after everything
else is extracted, so once the AI has captured a line as structured data, the
rules' leftover copy of that same line is stale by definition — otherwise
"@3000" ends up in the notes of a listing whose rate field already says 3000.
Every other field means the same thing when absent from either engine
("didn't find one"), so they keep gap-filling.

---

## Model choice

Set by `GEMINI_MODEL`, defaulting to **`gemini-3.5-flash-lite`**.

Chosen on the free tier's **requests-per-day** limit, which is the binding
constraint — not quality:

| Tier | Models | RPM | RPD |
| --- | --- | --- | --- |
| Flash | 2.5 / 3 / 3.5 / 3.6 Flash | 5 | **20** |
| **Flash Lite** | 3.1 / 3.5 Flash Lite | 15 | **500** |
| Pro | 2.5 Pro, 3.1 Pro | — | not on the free tier |

PlotBoard needs ~100–150 listings/month across 20 brokers ≈ **3–5 parses/day**.
That fits inside 20/day on paper, but 20 is shared by the whole team — one
broker importing a backlog one evening would exhaust everyone's quota. 500 RPD
turns ~4× headroom into ~100×.

Extraction into a fixed JSON schema is what Lite models are good at, and the
rule-based floor plus the review screen cover the difference. If accuracy ever
disappoints, set `GEMINI_MODEL=gemini-3.5-flash` — no redeploy needed — and
accept 20 RPD.

**Cost: ₹0.** Entirely inside the free tier. Even at paid rates a parse is
~800 input + ~150 output tokens, so 150/month is a fraction of a rupee.

---

## Setup

1. Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Supabase → **Project Settings → Edge Functions → Secrets** → add:
   ```
   GEMINI_API_KEY = your_key_here
   ```
   Optionally `GEMINI_MODEL` to override the default.
3. That's it — the function reads secrets at runtime, so no redeploy.

Until step 2 the function returns `{ ok: false, code: "not_configured" }` and
the app runs on rules alone. Nothing breaks; the banner just says "read
offline".

### Security

**The Gemini key must never become a `VITE_*` variable.** The Mapbox and Google
Maps keys in this project are *browser* keys — public by design, protected by
domain restrictions. A Gemini key has no such protection: anyone who pulls it
out of the JS bundle can spend the quota on anything. It lives only in the Edge
Function's secrets, alongside the service-role key and the R2 credentials.

Spend is bounded by three things: the caller must be a signed-in member,
input is capped at 4,000 characters, and the request times out at 12s.

### Prompt injection

The pasted message is untrusted input and is treated as data, not instructions
— the system prompt says so explicitly. The blast radius is small by design:
the model's only output channel is a fixed JSON schema, every field is
re-validated server-side against the allowed enums and numeric ranges before it
leaves the function, and the result only ever pre-fills a form the broker
reviews.

---

## Verifying it works

Which model IDs the key can actually reach:

```js
await supabase.functions.invoke('parse-listing', { body: { action: 'models' } })
```

Returns `{ configured, models }`. Useful because a wrong model ID fails as a
404 that otherwise looks identical to "the AI isn't working" — the client
silently falls back and the banner just says "read offline".

Function logs (including the Gemini status code on any failure) are in
Supabase → Edge Functions → `parse-listing` → Logs.
