# Rate Calculation Pipeline — PRD

**System ID:** A7
**Layer:** A — Core Shipping Infrastructure
**Status:** Draft v1.0
**Owner:** Shipping Platform
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

The Rate Calculation Pipeline is the single orchestrator that stands between the checkout flow and every shipping method, rule, zone, and carrier integration in ConvexPress. When a customer enters a shipping address on the storefront, exactly one function is called: `calculateRates`. Everything that happens afterward — address validation, zone matching, method eligibility, rule evaluation, rate computation, live carrier API fan-out, aggregation, ranking, caching, diagnostics — is internal to this pipeline.

This is the **last of the seven Layer A foundation PRDs** and the keystone that binds them together. Without this pipeline, the individual Layer A systems (Zones A1, Classes A2, Packages A3, Ship-From A4, Address Validation A5, Rules Engine A6) are independent islands. Without this pipeline, the Layer B method types (B1–B10) have no execution surface. Without this pipeline, the Layer C carrier providers (C1–C5) have no integration point. This system is the nervous system that activates all of them.

The intent is to deliver a **predictable, debuggable, fast** rate calculation surface with these properties:

- **Single entry point** — checkout never calls method-specific code, never calls carrier APIs, never evaluates rules. It asks the pipeline and receives a sorted quote list.
- **Deterministic stages** — every calculation run moves through the same named stages, in the same order, producing structured artifacts at each step.
- **Full traceability** — every run persists a diagnostic record capturing stage timings, rule evaluations, methods considered, carrier responses (including failures), and the final ranked output.
- **Aggressive caching** — identical (cart, address, ship-from) combinations return cached quotes within the configured TTL rather than re-hitting live carriers.
- **Graceful degradation** — a slow UPS API does not block USPS quotes; a dead DHL endpoint does not break checkout; a cart with zero matching zones falls back (when configured) to manual rates.
- **Zero implicit behavior** — the pipeline never silently hides methods, never silently falls back, never silently swallows errors. Everything that happens is surfaced in the diagnostics record.

The existing partial orchestrator at `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` (`fetchCheckoutRates`, starting line 2782) is refactored and consolidated into a staged pipeline with explicit per-stage boundaries, timing, and error capture. This PRD defines the contract and the file layout for that refactor.

---

## 2. Scope

### In Scope

- **Orchestration** — the full staged pipeline from address input to ranked quote output, including stage sequencing, per-stage timing, error capture, and diagnostic persistence.
- **Method resolution** — given a matched zone, determine which methods are attached, active, and eligible; load each method's configuration; dispatch to its rate calculator.
- **Rule evaluation integration** — for each candidate method, call the Shipping Rules Engine (A6) with the cart/address/method context; honor exclude/surcharge/override/discount outcomes.
- **Carrier fan-out** — for Live Rate methods (B10), group methods by provider and call each provider in parallel with per-provider timeouts; attribute responses back to originating methods.
- **Aggregation & normalization** — collect quotes from flat/weight/dimensional/price/quantity/free/local-pickup/local-delivery/table-rate/live-rate methods into a single normalized `ShippingQuote[]` shape.
- **Ranking** — compute `isCheapest`, `isFastest`, `isBestValue` flags across the aggregated quote set using the ranking algorithm defined in Section 6.
- **Caching** — keyed by (addressFingerprint, cartFingerprint, shipFromId, currency) with TTL from `settings.shipping.quoteCacheTtlSeconds`; fingerprints already implemented in `convex/commerce/checkout.ts`.
- **Multi-package shipments** — when Packages System (A3) returns N boxes from bin-packing, request rates per box and sum; the pipeline owns the summation logic, not the method calculators.
- **Diagnostics** — every run creates a `commerce_rate_pipeline_runs` record with stage timings, inputs, intermediate artifacts, final outputs, and (when applicable) a sanitized error trace.
- **Test Rates admin UX** — the diagnostic page at `/admin/commerce/settings/shipping/test-rates` that lets administrators replay any cart+address combination and inspect the full pipeline trace.
- **Events** — `shipping.rates.calculated`, `shipping.rates.failed`, `shipping.rates.fell_back_to_manual` emitted via the Event Dispatcher System.

### Out of Scope

- **Individual method rate math** — flat/weight/dimensional/price/quantity/free/pickup/delivery/table-rate/live-rate calculators live in their own Layer B PRDs (B1–B10). The pipeline calls them; it does not duplicate their logic.
- **Carrier API calls** — UPS, USPS, FedEx, DHL, ShipStation integrations live in their own Layer C PRDs (C1–C5). The pipeline invokes them through a uniform `LiveRateProvider` contract; it does not speak carrier-specific wire formats.
- **Rule condition evaluation** — the predicate tree logic (city equals, subtotal greater than, class includes, etc.) lives in the Shipping Rules Engine (A6). The pipeline asks; it does not evaluate.
- **Address geocoding or correction** — handled entirely by Address Validation System (A5). The pipeline consumes a validated address; it does not validate.
- **Zone geometry matching** — handled by Shipping Zones System (A1). The pipeline calls `matchZoneForAddress` and accepts the result.
- **Package bin-packing** — handled by Shipping Packages System (A3). The pipeline requests a pack; it does not pack.
- **Checkout UI** — the storefront quote picker UI is owned by the Commerce Checkout system. The pipeline provides the data; it does not render it.
- **Label purchasing, tracking, manifests** — the pipeline ends at quote selection. Everything after checkout completion belongs to Fulfillment (Layer D).

---

## 3. Dependencies

### Upstream (consumed by this pipeline)

| PRD ID | System | What the pipeline uses |
|--------|--------|------------------------|
| A1 | Shipping Zones | `matchZoneForAddress(address) → zoneId` |
| A2 | Shipping Classes | class metadata per cart line for rule predicates & method filters |
| A3 | Shipping Packages | `packCart(cart, shipFromId) → Package[]` for multi-box rate requests |
| A4 | Ship-From Locations | default ship-from resolution, origin address for carrier calls |
| A5 | Address Validation | validated destination address (street, city, region, postal, country) |
| A6 | Shipping Rules Engine | `evaluateRulesForMethod(method, ctx) → RuleOutcome` |
| — | Settings System | `settings.shipping.quoteCacheTtlSeconds`, `fallbackToManualRates`, `liveRateProviderTimeoutMs` |
| — | Event Dispatcher | `emitEvent` for pipeline lifecycle events |

### Downstream (consumers of this pipeline)

| PRD ID | System | How it consumes |
|--------|--------|-----------------|
| — | Commerce Checkout | calls `calculateRates` from the shipping step; reads persisted quotes from `commerce_shipping_rate_quotes` |
| B1 | Flat Rate Method | implements `MethodRateCalculator` contract; called by pipeline |
| B2 | Weight-Based Method | implements `MethodRateCalculator`; called by pipeline |
| B3 | Dimensional Method | implements `MethodRateCalculator`; called by pipeline |
| B4 | Price-Based Method | implements `MethodRateCalculator`; called by pipeline |
| B5 | Quantity-Based Method | implements `MethodRateCalculator`; called by pipeline |
| B6 | Free Shipping Method | implements `MethodRateCalculator`; called by pipeline |
| B7 | Local Pickup Method | implements `MethodRateCalculator`; called by pipeline |
| B8 | Local Delivery Method | implements `MethodRateCalculator`; called by pipeline |
| B9 | Table Rate Method | implements `MethodRateCalculator`; called by pipeline |
| B10 | Live Rate Method | implements `MethodRateCalculator` AND dispatches to Layer C provider |
| C1 | UPS Provider | implements `LiveRateProvider` contract |
| C2 | USPS Provider | implements `LiveRateProvider` contract |
| C3 | FedEx Provider | implements `LiveRateProvider` contract |
| C4 | DHL Provider | implements `LiveRateProvider` contract |
| C5 | ShipStation Provider | implements `LiveRateProvider` contract |
| — | Admin Test Rates page | calls `calculateRates` with `diagnosticMode: true` to force-skip cache |

### Contracts Enforced

The pipeline enforces two cross-system contracts. Both are defined as TypeScript type literals in `convex/shipping/rates/contracts.ts`.

- **`MethodRateCalculator`** — shape every Layer B method exposes: `calculate(ctx, method, packages) → ShippingQuote[] | null`.
- **`LiveRateProvider`** — shape every Layer C carrier exposes: `fetchRates(ctx, credentials, origin, destination, packages, services[]) → ProviderQuote[]`.

Layer B and Layer C PRDs are responsible for conforming to these shapes. The pipeline is responsible for invoking them uniformly.

---

## 4. Schema

### Existing Tables (extended, not replaced)

**`commerce_shipping_rate_quotes`** — lives in `convex/schema/shipping.ts` lines 190-216. Already carries `addressKey` and `cartKey` fingerprints added in the prior session. The pipeline writes here after each run.

Fields in use (reference only — no new fields added by this PRD):

- `sessionId` — checkout session the quote belongs to
- `addressKey` — SHA-256 of normalized destination address
- `cartKey` — SHA-256 of cart items + quantities + class assignments
- `shipFromId` — origin location
- `currency` — quote currency
- `expiresAt` — now + `quoteCacheTtlSeconds`
- `quotes` — array of normalized `ShippingQuote` objects
- `rankedAt` — timestamp when ranking flags (`isCheapest`, `isFastest`, `isBestValue`) were applied

### New Table

**`commerce_rate_pipeline_runs`** — new diagnostic table, added to `convex/schema/shipping.ts`.

Purpose: every invocation of `calculateRates` (whether cache hit, cache miss, or error) creates one record. This is the authoritative audit trail for "why did this customer see (or not see) these rates?"

Fields:

- `_id` — record id
- `_creationTime` — run start timestamp
- `sessionId` — checkout session (nullable for admin Test Rates runs)
- `userId` — user triggering the run (customer or admin)
- `triggerSource` — `"checkout" | "admin_test_rates" | "api"`
- `diagnosticMode` — boolean; when true, cache is bypassed and full trace is captured
- `addressKey`, `cartKey`, `shipFromId`, `currency` — cache key components
- `cacheOutcome` — `"hit" | "miss" | "bypassed" | "stale"`
- `stages` — array of stage records (see Section 5)
- `zoneId` — matched zone (nullable if none matched)
- `methodsConsidered` — array of `{ methodId, methodType, outcome, reason }`
- `providerCalls` — array of `{ providerId, methodIds[], startedAt, endedAt, durationMs, outcome, errorCode? }`
- `quotesReturned` — final ranked `ShippingQuote[]` (normalized)
- `totalDurationMs` — wall-clock from pipeline entry to return
- `fellBackToManual` — boolean
- `errorSummary` — nullable string; top-level error message if the run failed

Indexes:

- `by_session` on `sessionId` — for "show me this session's rate runs" in admin
- `by_user` on `userId` — for diagnostics scoped to a customer
- `by_creation_desc` on `_creationTime` — for the recent-runs list on Test Rates page
- `by_cache_outcome` on `cacheOutcome` — for monitoring cache hit rate over time

Retention: records older than `settings.shipping.pipelineRunRetentionDays` (default 30 days) are purged by a scheduled cron job owned by this system. See Section 11.

---

## 5. Data Model

### Pipeline as Stages

A single `calculateRates` invocation is modeled as an ordered list of named stages. Each stage has:

- a unique stage key (`"validateInputs"`, `"resolveContext"`, etc.)
- a `startedAt` / `endedAt` timestamp pair
- an `outcome` (`"ok" | "skipped" | "warning" | "error"`)
- a `summary` string (human-readable)
- a `payload` (structured stage-specific output — e.g., for `"matchZone"` the payload carries `{ zoneId, zoneName }`)

This shape is uniform across every stage. The `stages[]` array on `commerce_rate_pipeline_runs` is this exact list.

### The Ten Stages

```
                    RATE CALCULATION PIPELINE
                    =========================

  [Entry: calculateRates(sessionId, address, cart?, overrides?)]
       |
       v
  +----------------------------+
  | 1. validateInputs          |  verify address shape, cart present,
  |                            |  currency set, session valid
  +----------------------------+
       |
       v
  +----------------------------+
  | 2. resolveContext          |  load cart, ship-from, settings,
  |                            |  classes, fingerprints
  +----------------------------+
       |
       v
  +----------------------------+
  | 3. checkCache              |  lookup by (addressKey, cartKey,
  |                            |  shipFromId, currency)
  +----------------------------+
       |
       +--- cache hit? ---> [return cached quotes, record run, exit]
       |
       v  (cache miss or bypassed)
  +----------------------------+
  | 4. matchZone               |  internals.matchZoneForAddress
  +----------------------------+
       |
       +--- no zone? ---> [apply fallback policy, record, exit]
       |
       v
  +----------------------------+
  | 5. loadMethods             |  fetch methods attached to zone,
  |                            |  filter by active + supported currency
  +----------------------------+
       |
       v
  +----------------------------+
  | 6. evaluateRules           |  for each method, call rules engine;
  |                            |  drop excluded methods, capture
  |                            |  surcharges/overrides/discounts
  +----------------------------+
       |
       v
  +----------------------------+
  | 7. packShipment            |  Packages A3 bin-packs cart into
  |                            |  Package[] for this ship-from
  +----------------------------+
       |
       v
  +----------------------------+
  | 8. computeQuotes           |  per surviving method, dispatch to
  |                            |  its calculator; for Live Rate,
  |                            |  group by provider and fan out
  |                            |  in parallel with timeouts
  +----------------------------+
       |
       v
  +----------------------------+
  | 9. rankQuotes              |  apply isCheapest / isFastest /
  |                            |  isBestValue flags
  +----------------------------+
       |
       v
  +----------------------------+
  | 10. persistAndEmit         |  upsert commerce_shipping_rate_quotes,
  |                            |  write commerce_rate_pipeline_runs,
  |                            |  emit shipping.rates.calculated
  +----------------------------+
       |
       v
  [Return: { quotes: ShippingQuote[], runId: Id<...>, fromCache: boolean }]
```

### Normalized Quote Shape

Every method calculator and every provider returns results that the pipeline coerces into this single shape:

- `methodId` — id of the source `commerce_shipping_methods` row
- `methodType` — `"flat" | "weight" | "dimensional" | "price" | "quantity" | "free" | "local_pickup" | "local_delivery" | "table_rate" | "live_rate"`
- `serviceCode` — carrier service code for live rates (null for non-carrier methods)
- `providerId` — nullable; populated only for live rate methods
- `label` — customer-facing label (e.g., "USPS Priority Mail")
- `amount` — integer cents in quote currency
- `currency` — ISO 4217 code
- `estimatedDaysMin`, `estimatedDaysMax` — nullable integers
- `carrier` — nullable carrier name (e.g., "UPS")
- `metadata` — provider-specific passthrough (dimensions, surcharge breakdown, rule adjustments)
- `isCheapest`, `isFastest`, `isBestValue` — ranking flags set by stage 9

### Fingerprints (reuse, do not redefine)

The pipeline reuses fingerprint helpers already implemented in `convex/commerce/checkout.ts`:

- `computeAddressKey(address)` — normalizes casing, trims whitespace, sorts optional fields, hashes
- `computeCartKey(cartItems)` — normalizes item ids + quantities + class ids, hashes

These are not redefined here. The pipeline imports them. If a future refactor moves these helpers, the pipeline's imports update; the shape and semantics stay.

---

## 6. Functions / API

### Public Action (checkout-facing and admin-facing)

**`shipping.rates.pipeline.calculateRates`** — the single public entry point.

- Kind: `action`
- File: `convex/shipping/rates/pipeline.ts`
- Args:
  - `sessionId: Id<"commerce_checkout_sessions"> | null` — null when run from admin Test Rates
  - `address: ShippingAddress` — destination
  - `cartSnapshot?: CartSnapshot` — optional; if absent, loaded from session
  - `shipFromId?: Id<"commerce_ship_from_locations">` — optional; defaults resolved
  - `currency?: string` — optional; defaults to session currency
  - `diagnosticMode?: boolean` — when true, bypass cache and capture full payloads on every stage
  - `triggerSource: "checkout" | "admin_test_rates" | "api"`
- Returns: `{ quotes: ShippingQuote[], runId: Id<"commerce_rate_pipeline_runs">, fromCache: boolean, fellBackToManual: boolean, warnings: string[] }`

### Internal Query

**`shipping.rates.pipeline.resolveRateContext`** — internal query.

- File: `convex/shipping/rates/pipeline.ts`
- Purpose: hydrate the full context object needed by later stages in one atomic read.
- Returns:
  - `cart` — items + class ids + totals
  - `address` — validated destination
  - `shipFromId` + `shipFromLocation`
  - `settings` — `{ quoteCacheTtlSeconds, fallbackToManualRates, liveRateProviderTimeoutMs }`
  - `currency`
  - `fingerprints` — `{ addressKey, cartKey }`

This consolidates what is currently scattered across `getRateContextForSession` and ad-hoc reads in `actions.ts`. Keep and extend; do not replace wholesale.

### Internal Mutation

**`shipping.rates.pipeline.persistQuotes`** — internal mutation.

- File: `convex/shipping/rates/pipeline.ts`
- Purpose: called by the action after ranking to write to `commerce_shipping_rate_quotes` and `commerce_rate_pipeline_runs` atomically.
- Reuses and extends the existing `internals.replaceCheckoutQuotes`.

### Helpers

**`rankQuotes(quotes: ShippingQuote[]): ShippingQuote[]`** — pure function.

- File: `convex/shipping/helpers.ts` (extend existing `rankShippingQuotes` rather than duplicate)
- Algorithm detailed below in this section.

**`bestValueScore(quote, set): number`** — pure function.

- File: `convex/shipping/helpers.ts`
- Algorithm detailed below.

### Method Resolver Pseudocode

Stage 6 (`evaluateRules`) and stage 8 (`computeQuotes`) together form the method resolver. In plain prose:

```
for each method M attached to the matched zone:
    if M is not active: record reason="inactive"; skip
    if M does not support currency: record reason="currency_unsupported"; skip
    outcome = rulesEngine.evaluateRulesForMethod(M, ctx)
    if outcome.excluded: record reason="rule_excluded"; skip
    pendingMethods.push({ M, outcome })

group pendingMethods by methodType:
    nonLiveMethods = all except live_rate
    liveMethods    = filter methodType == live_rate

for each (M, outcome) in nonLiveMethods:
    rawQuotes = M.calculator.calculate(ctx, M, packages)
    rawQuotes = applyOutcomeAdjustments(rawQuotes, outcome)
    allQuotes.extend(rawQuotes)

for each (M, outcome) in liveMethods, grouped by providerId:
    launch in parallel, with per-provider timeout = settings.liveRateProviderTimeoutMs:
        providerResponse = provider.fetchRates(ctx, creds, origin, dest, packages, services[])
        for each raw response row:
            attribute to originating method by serviceCode
            rawQuote = normalize(raw, method)
            rawQuote = applyOutcomeAdjustments(rawQuote, outcome)
            allQuotes.push(rawQuote)

if allQuotes.length == 0:
    if ctx.settings.fallbackToManualRates === true:
        allQuotes = loadManualFallbackMethods(ctx) then calculate
        mark fellBackToManual = true
    else:
        return []
```

The `applyOutcomeAdjustments` function handles rule-driven surcharges, overrides, and discounts. Its semantics are defined in the Rules Engine PRD (A6). The pipeline is responsible only for applying the adjustment, not computing it.

### Ranking Algorithm Detail

Given an array of quotes, `rankQuotes` computes three flags per quote. All three flags may be true on a single quote simultaneously (e.g., a single quote is cheapest, fastest, and best value).

**`isCheapest`** — flag exactly one quote: the one with the lowest `amount`. Ties broken by earlier `estimatedDaysMax`. If still tied, by `methodId` sort order (stable).

**`isFastest`** — flag exactly one quote: the one with the smallest `estimatedDaysMax`. Quotes with null `estimatedDaysMax` are excluded from fastest consideration. If all quotes have null days, no quote is flagged fastest. Ties broken by lower `amount`. If still tied, by `methodId` sort order.

**`isBestValue`** — weighted composite score:

```
costRank(q)  = rank of q.amount in ascending order, normalized to [0, 1]
               where rank 0 = cheapest, rank 1 = most expensive
speedRank(q) = rank of q.estimatedDaysMax in ascending order, normalized to [0, 1]
               where rank 0 = fastest, rank 1 = slowest
               (quotes with null days get speedRank = 1.0)

score(q) = 0.6 * costRank(q) + 0.4 * speedRank(q)

isBestValue flagged on the quote with the smallest score.
Ties broken by lower amount, then earlier estimatedDaysMax, then methodId.
```

The 0.6 / 0.4 weighting is the default. It is configurable via `settings.shipping.rankingWeights = { cost: number, speed: number }` with both values required to sum to 1.0. Validation on settings write.

Edge cases:

- **One quote** — flagged cheapest, fastest (if days known), and best value. Ranking still runs; single quote is trivially the best of its set.
- **Zero quotes** — no flags to apply; ranking is a no-op.
- **All same price** — `costRank` is uniform; `isBestValue` reduces to speed ranking.
- **Free shipping present** — free quote (amount = 0) always wins `isCheapest` and always has `costRank = 0`; ties with other free quotes broken by speed.

---

## 7. Admin UX

### Test Rates Diagnostic Page

Route: `/admin/commerce/settings/shipping/test-rates`
File: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.test-rates.tsx` (new)
Capability: `admin.shipping.test_rates.run`

Layout follows the Admin Settings & Forms UI Expert patterns (full-page, left sidebar navigation, Base UI components only).

**Top section: Input form**

- **Address panel** — address form with country, region, postal, city, street. Supports either typing or loading a saved customer address by customer id.
- **Cart panel** — either:
  - paste a cart ID (loads the snapshot from `commerce_carts`)
  - or build an ad-hoc cart by adding product lines with quantities
- **Options panel**:
  - ship-from selector (defaults to default ship-from)
  - currency selector (defaults to store currency)
  - "Bypass cache" toggle (forces `diagnosticMode: true`)
- **Run** button — calls `calculateRates` with `triggerSource: "admin_test_rates"` and `diagnosticMode: true`

**Bottom section: Run trace**

For each completed run, shows:

1. **Summary row** — cache outcome, total duration, zone matched, method count, quote count, fallback flag
2. **Stage timeline** — a vertical list of the 10 stages with per-stage duration bars, outcome badge, and expandable payload
3. **Method consideration table** — every method considered, with columns: method name, method type, outcome (`included` / `rule_excluded` / `inactive` / `currency_unsupported` / `no_rates`), reason
4. **Rule evaluation detail** — per method, the rules engine trace (which rules matched, which conditions fired, what adjustments applied)
5. **Provider call table** — for live rate methods: provider, methods served, duration, HTTP status, service count returned, error (if any)
6. **Final quote list** — the normalized, ranked quote set with flag badges

**Recent runs panel** — a sidebar showing the last 50 runs across all users (scoped by cap) with click-to-replay, sortable by duration / cache outcome / zone / error status. Queries `commerce_rate_pipeline_runs` ordered by `by_creation_desc`.

### Example Diagnostic Output

```
RUN 01HX9Y2K4... · 2026-04-14 09:14:22 · 1.82s · cache:miss · zone:US-Domestic

STAGE TIMELINE
  1. validateInputs        12ms   ok      address + cart shapes valid
  2. resolveContext        43ms   ok      3 cart lines, shipFrom=Warehouse-East, currency=USD
  3. checkCache            8ms    miss    no entry for this fingerprint
  4. matchZone             22ms   ok      zone=US-Domestic (id=k17g...)
  5. loadMethods           31ms   ok      5 methods attached
  6. evaluateRules         67ms   ok      5 considered, 4 survived, 1 excluded by rule
  7. packShipment          19ms   ok      cart packed into 1 box (12x9x4, 3.2 lb)
  8. computeQuotes         1488ms ok      3 provider calls in parallel
  9. rankQuotes            4ms    ok      4 quotes ranked
 10. persistAndEmit        88ms   ok      quotes written, event emitted

METHODS CONSIDERED
  Flat Rate Ground           included
  Weight-Based Expedited     included
  Free Shipping Over $75     rule_excluded   subtotal $62.40 below threshold
  UPS Live Rates             included
  USPS Live Rates            included

PROVIDER CALLS
  UPS        623ms  200  5 services returned
  USPS       1421ms 200  3 services returned
  (no other providers invoked)

QUOTES RETURNED
  [cheapest] Flat Rate Ground           $ 6.99   3-5d
             Weight-Based Expedited     $ 9.50   2-3d   [bestValue]
             UPS Ground                 $12.44   2-4d
  [fastest]  USPS Priority              $14.20   1-2d

EVENTS EMITTED
  shipping.rates.calculated
```

---

## 8. Merchant Workflow

**Scenario: "A customer emailed saying they see no shipping options at checkout."**

1. Merchant opens `/admin/commerce/settings/shipping/test-rates`.
2. Merchant either pastes the customer's cart id (from the support email or customer lookup) or loads the customer's last saved address.
3. Merchant clicks Run.
4. Merchant reads the stage timeline:
   - If stage 4 (matchZone) returned null → zone coverage gap. Fix by editing zones in A1.
   - If stage 5 (loadMethods) returned 0 methods → the matched zone has no methods attached. Fix by attaching methods to that zone.
   - If stage 6 (evaluateRules) excluded every method → a rule is over-aggressive. Fix by inspecting the rule detail panel and editing the rule in A6.
   - If stage 8 (computeQuotes) returned 0 quotes despite methods surviving → method calculators or providers are failing. Read the provider call table for HTTP errors; check credentials.
5. Merchant fixes the root cause and re-runs to verify the customer will now see options.

**Scenario: "Rates seem slower than they used to be."**

1. Merchant opens the recent runs panel, sorts by `totalDurationMs` descending.
2. Merchant opens the slowest run, checks the provider call table.
3. Identifies which provider is the bottleneck. If a carrier is consistently timing out, merchant either:
   - raises `liveRateProviderTimeoutMs` in settings
   - disables the problematic live rate method until the carrier recovers

**Scenario: "We want to know our cache hit rate."**

1. Analytics read `commerce_rate_pipeline_runs` grouped by `cacheOutcome`.
2. A dashboard widget (owned by Dashboard System) surfaces the ratio over the last 24 hours / 7 days / 30 days.

---

## 9. Storefront UX

From the storefront's perspective, the pipeline is invisible. The checkout shipping step does exactly three things:

1. Call `shipping.rates.pipeline.calculateRates` with the session id and destination address.
2. Display the returned `quotes[]` as a radio-group list, labeling each with `label`, `amount`, `estimatedDaysMin..estimatedDaysMax`.
3. On selection, persist the chosen quote id to the checkout session.

The UI may optionally highlight the `isCheapest`, `isFastest`, `isBestValue` quotes with subtle badges. The pipeline does not dictate this; it only provides the flags.

**What the customer never sees:**

- Which zone matched
- Which methods were considered
- Which rules fired
- Which providers were called
- Whether the result came from cache or live
- Whether any provider failed (partial success is surfaced only in diagnostics, not to the customer)

**What the customer sees when nothing returns:**

- If `fellBackToManual === true` and manual methods exist → the manual quotes, rendered normally.
- If `quotes.length === 0` → a polite "We're unable to calculate shipping to this address. Please contact support." message, with a hook for the merchant to customize via settings.

No raw error messages are ever shown at the storefront. Full detail is always captured server-side in `commerce_rate_pipeline_runs`.

---

## 10. Edge Cases

### No zone matches the destination

- Pipeline stage 4 returns null.
- Pipeline checks `settings.shipping.fallbackToManualRates`.
- If `true`: load all methods tagged as `isManualFallback`, skip zone filter, run stages 6–10 normally. Mark `fellBackToManual: true`. Emit `shipping.rates.fell_back_to_manual`.
- If `false`: return `{ quotes: [], warnings: ["no_zone_match"] }`. Emit `shipping.rates.failed` with reason `no_zone_match`. Record full diagnostic.

### All methods return zero rates

- Identical behavior to "no zone matches" — fallback policy applies at stage 8, not just stage 4.
- Common cause: every method has a rule that excluded it, or every live rate provider failed, or the cart weight exceeds every method's max.
- Always captured in diagnostic `methodsConsidered` with per-method reason.

### One provider is slow

- `settings.shipping.liveRateProviderTimeoutMs` (default 5000) enforces a per-provider timeout via `Promise.race`.
- Timed-out provider's promise rejects with `provider_timeout`. Diagnostic records the timeout in `providerCalls`.
- Other providers' results are still aggregated. `warnings[]` includes `"provider_timeout:ups"` etc.
- Event `shipping.rates.calculated` fires with a `success: "partial"` flag if any provider timed out but others succeeded.

### Cart changes mid-calculation

- Customer adds an item to the cart while `calculateRates` is in flight.
- When the pipeline completes and tries to write quotes, it checks the current cart fingerprint against the fingerprint captured at stage 2.
- If fingerprints mismatch: discard the computed quotes (they're stale), do not write to `commerce_shipping_rate_quotes`, but still write the diagnostic record with `cacheOutcome: "stale"`.
- Checkout retries automatically with the new cart on next render (reactive query re-fires).

### Multi-package shipment

- Stage 7 calls Packages System (A3) `packCart(cart, shipFromId)`. Result is `Package[]` with N entries.
- Stage 8 dispatches per-method rate requests with the full `Package[]`.
  - Non-live methods receive `packages` and sum their own totals.
  - Live rate methods submit one rate request per provider per package, summing amounts per `serviceCode` across packages.
- Quote metadata carries `packageCount: N` and `perPackageAmounts: number[]` for transparency.
- If any package produces no rate from a given method/service, that method/service is dropped from the aggregate (the shipment can't be fulfilled if one box can't be shipped).

### Partial carrier failures

- UPS returns 200 with 5 services; FedEx returns 500.
- Diagnostic records both: UPS `outcome: "ok"`, FedEx `outcome: "error"` with error code.
- Customer sees UPS quotes only. `success: "partial"` on the event.
- Merchant is alerted only if `settings.shipping.alertOnPartialFailure` is true (integration with Site Notifications).

### Invalid or incomplete address

- Stage 1 validates shape (country required, postal required for countries that use postal codes, etc.).
- If invalid: return `{ quotes: [], warnings: ["address_invalid:<reason>"] }`. No stages beyond 1 run. Diagnostic captures the validation failure.
- Address Validation System (A5) is responsible for upstream correction before `calculateRates` is called; this is a last-resort guard.

### Cache entry exists but expired

- Stage 3 finds entry but `expiresAt < now`.
- `cacheOutcome: "stale"`. Proceed to stages 4–10 as a cache miss. Overwrite the stale entry.

### `diagnosticMode: true`

- Stage 3 records `cacheOutcome: "bypassed"` and proceeds to stage 4 regardless of cache state.
- All stages capture full payloads (even large ones like the complete cart snapshot).
- Results ARE written to cache (so subsequent real checkout calls benefit), but the diagnostic record is marked `diagnosticMode: true` for filtering.

### Currency mismatch

- Cart currency is USD, but a live rate provider only returns CAD.
- Normalization converts via the Currency System's current conversion rate.
- Conversion rate used is captured in quote `metadata.conversionRate`.
- If no conversion rate available for the pair: that provider's quotes are dropped, warning emitted.

---

## 11. Testing Requirements

### Unit Tests

- `rankQuotes` — 20+ cases: empty, single, ties at cheapest, ties at fastest, all null days, free shipping present, weights customized.
- `bestValueScore` — boundary cases around the cost/speed weighting.
- Fingerprint stability — identical carts with reordered items produce identical `cartKey`.

### Integration Tests (with in-memory Convex test harness)

- **Cache hit path** — two consecutive `calculateRates` calls with identical inputs: first writes, second reads. Assert `fromCache: true` on second. Assert identical quote set. Assert diagnostic records both runs with correct `cacheOutcome`.
- **Cache miss path** — vary address, assert miss + write.
- **No zone match, fallback enabled** — manual methods returned, `fellBackToManual: true`, event fired.
- **No zone match, fallback disabled** — empty quotes, warning, event fired.
- **Rule exclusion** — method attached to zone, rule excludes it, diagnostic records `rule_excluded`, quote absent.
- **Rule surcharge** — method included, rule adds $5 surcharge, quote amount = base + 500.
- **Multi-package** — cart that packs into 3 boxes, per-method amounts sum correctly.
- **Staleness** — simulate cart change mid-flight by mutating cart between stages; assert `cacheOutcome: "stale"` and no quote write.

### End-to-End Tests with Mocked Providers

- Each Layer C provider has a `mockProvider` fixture returning deterministic responses.
- **Happy path** — 3 providers all succeed, 8 quotes aggregated, ranking flags applied.
- **One provider times out** — `Promise.race` triggers, diagnostic records timeout, other providers' quotes present, `success: "partial"`.
- **One provider 500s** — error captured, other providers' quotes present.
- **All providers fail** — fallback engages if configured.

### Diagnostic Record Verification

- Every test run asserts:
  - exactly one `commerce_rate_pipeline_runs` record created
  - all 10 stages present in `stages[]` (or fewer if early exit, with `skipped` outcome on later stages)
  - `totalDurationMs` is non-negative and matches sum of stage durations within tolerance
  - `quotesReturned` matches the action return value

### Retention Cron

- Cron job `rateCalculationPipelineRunRetention` runs daily, deletes runs older than `settings.shipping.pipelineRunRetentionDays`.
- Test verifies retention: seed 100 runs at varying ages, run cron, assert only runs within retention remain.

### Performance Tests

- Load test with 100 concurrent `calculateRates` calls, 5-provider live rate setup, each provider mocked with 200ms latency.
- Assert p95 < 3000ms, p99 < 5000ms.

---

## 12. Success Criteria

### Latency

- **p95 end-to-end `calculateRates` latency < 3000ms** for a 5-provider query on a realistic cart (3–5 line items, 1 package).
- **p95 cache-hit latency < 100ms**.
- **Stage 9 (ranking) < 10ms** for any realistic quote set (< 50 quotes).

### Cache Effectiveness

- **Cache hit rate > 40%** across a full checkout funnel in steady state. Measured via `commerce_rate_pipeline_runs.cacheOutcome` grouped counts over 7-day windows.

### Correctness

- **Zero silent fallbacks to manual when live rates were intended.** Defined as: `fellBackToManual === true` on any run where live rate methods were eligible must always be accompanied by a `shipping.rates.fell_back_to_manual` event and at least one warning or provider error in the diagnostic.
- **100% of quote computation errors traced.** Defined as: every run that returns `quotes.length === 0` must have a diagnostic record with a non-empty `errorSummary` OR a non-empty set of `warnings[]` explaining why.

### Observability

- Every pipeline run is fully reproducible from its diagnostic record. An administrator can open a run and understand every decision made.
- Test Rates page loads a run in < 500ms.

### Stability

- Zero uncaught exceptions escaping `calculateRates`. Any error inside the pipeline is caught, recorded as a stage outcome `"error"`, returned as a structured warning or empty-quote response, and emitted as `shipping.rates.failed`.

---

## 13. Roles & Capabilities

Capabilities registered in the Role & Capability System for this pipeline:

| Capability | Description | Default Roles |
|------------|-------------|---------------|
| `admin.shipping.diagnostics.view` | View `commerce_rate_pipeline_runs` records | Administrator |
| `admin.shipping.test_rates.run` | Invoke `calculateRates` from the Test Rates page with `triggerSource: "admin_test_rates"` | Administrator |
| `admin.shipping.settings.manage` | Edit `quoteCacheTtlSeconds`, `fallbackToManualRates`, `liveRateProviderTimeoutMs`, `rankingWeights`, `pipelineRunRetentionDays` | Administrator |

The storefront `calculateRates` call is not gated by capability — it is gated by session ownership (the caller must be the session owner or the session must belong to a guest session token the caller holds).

---

## 14. Events Fired

All events emitted via the Event Dispatcher System's `emitEvent` helper.

### `shipping.rates.calculated`

- Fired on every successful pipeline completion (including cache hits).
- Payload: `{ runId, sessionId, quoteCount, cacheOutcome, totalDurationMs, fellBackToManual, success: "full" | "partial", warnings[] }`
- Consumers: Analytics System (cache hit tracking), Dashboard System (latency metrics).

### `shipping.rates.failed`

- Fired when the pipeline returns `quotes.length === 0` AND `fellBackToManual === false` (i.e., the customer sees nothing).
- Payload: `{ runId, sessionId, reason: "no_zone_match" | "all_methods_excluded" | "all_providers_failed" | "address_invalid" | "internal_error", warnings[] }`
- Consumers: Site Notifications (alert merchant), Audit Log.

### `shipping.rates.fell_back_to_manual`

- Fired when `fellBackToManual: true` regardless of success.
- Payload: `{ runId, sessionId, reason: "no_zone_match" | "all_methods_returned_zero", manualQuoteCount }`
- Consumers: Site Notifications (optional alert per settings), Analytics (fallback rate tracking).

All three events are registered in the Airtable Events table (`[redacted-airtable-table-id]`) under system A7.

---

## 15. References

### External Patterns

- **Shopify Shipping API aggregation pattern** — Shopify's Carrier Service API pattern of calling registered carriers in parallel, aggregating service-level responses, and returning a unified rate list to checkout. This pipeline follows the same fan-out/aggregate shape with the addition of rule-based adjustments between aggregation and ranking.
- **WooCommerce `woocommerce_package_rates` filter hook** — WooCommerce's approach of letting multiple shipping method classes each contribute rates to a package, then filtering/modifying the combined result. The pipeline's rule-driven `applyOutcomeAdjustments` step is the analogous layer — it runs after method calculators produce raw quotes and before ranking.
- **ShipStation rate shopping** — ShipStation's rate shopping model where multiple carriers are queried and cheapest/fastest are highlighted. The ranking algorithm in Section 6 is the ConvexPress equivalent, generalized to a tunable cost/speed weighting.

### Internal References

- A1 Shipping Zones System — `specs/ConvexPress/systems/shipping-zones-system/PRD.md`
- A2 Shipping Classes System — `specs/ConvexPress/systems/shipping-classes-system/PRD.md`
- A3 Shipping Packages System — `specs/ConvexPress/systems/shipping-packages-system/PRD.md`
- A4 Ship-From Locations System — `specs/ConvexPress/systems/ship-from-locations-system/PRD.md`
- A5 Address Validation System — `specs/ConvexPress/systems/address-validation-system/PRD.md`
- A6 Shipping Rules Engine — `specs/ConvexPress/systems/shipping-rules-engine/PRD.md`
- B1–B10 Method type PRDs — `specs/ConvexPress/systems/shipping-method-{flat,weight,dimensional,price,quantity,free,local-pickup,local-delivery,table-rate,live-rate}/PRD.md`
- C1–C5 Provider PRDs — `specs/ConvexPress/systems/shipping-provider-{ups,usps,fedex,dhl,shipstation}/PRD.md`

### Existing Code to Refactor Into This Pipeline

- `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` — existing `fetchCheckoutRates` (line 2782+) becomes the new `calculateRates` action, split across stages.
- `ConvexPress-Admin/packages/backend/convex/shipping/internals.ts` — existing `matchZoneForAddress`, `getRateContextForSession`, `replaceCheckoutQuotes` are retained and called by the new pipeline; `getRateContextForSession` is extended into `resolveRateContext`.
- `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts` — existing `getCheckoutQuotes`, `computeAddressKey`, `computeCartKey` are consumed as-is.
- `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` — existing `commerce_shipping_rate_quotes` (lines 190-216) is reused; new `commerce_rate_pipeline_runs` table is added.
- `ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts` — existing `rankShippingQuotes` is extended to implement the three-flag ranking model (isCheapest/isFastest/isBestValue) described in Section 6.

### New Files Introduced

- `convex/shipping/rates/pipeline.ts` — the `calculateRates` action, `resolveRateContext` internal query, `persistQuotes` internal mutation.
- `convex/shipping/rates/contracts.ts` — `MethodRateCalculator` and `LiveRateProvider` TypeScript contract types.
- `convex/shipping/methods/flat.ts` — flat rate calculator (B1).
- `convex/shipping/methods/weight.ts` — weight-based calculator (B2).
- `convex/shipping/methods/dimensional.ts` — dimensional calculator (B3).
- `convex/shipping/methods/price.ts` — price-based calculator (B4).
- `convex/shipping/methods/quantity.ts` — quantity-based calculator (B5).
- `convex/shipping/methods/free.ts` — free shipping calculator (B6).
- `convex/shipping/methods/localPickup.ts` — local pickup calculator (B7).
- `convex/shipping/methods/localDelivery.ts` — local delivery calculator (B8).
- `convex/shipping/methods/tableRate.ts` — table rate calculator (B9).
- `convex/shipping/methods/liveRate.ts` — live rate calculator (B10), delegates to Layer C providers.
- `apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.test-rates.tsx` — admin Test Rates page.

---

**End of PRD.**
