# AI Shopping Experience Strategy — Cart, Search, and the Assistant Rail

**Status:** Research + strategy (no code). **Authored:** 2026-09-02.
**Scope:** Redesign of the ConvexPress storefront shopping experience (search results, product listing, cart drawer, cart page, PDP touchpoints) to match the 2026 Amazon pattern of a persistent, cart-aware AI assistant rail, plus a conformance plan for Google's Universal Commerce Protocol (UCP).
**Companion artifact:** published page "Cart-Aware Assistant Rail" (same content, with annotated Amazon screenshots).
**Related docs:** `specs/codex-prds/COMMERCE-UCP-PLUGIN-PRD.md`, `plans/codex/COMMERCE-UCP-PLUGIN-IMPLEMENTATION-CHECKLIST.md`, `specs/ConvexPress/systems/cart-system/PRD.md`, `specs/ConvexPress/systems/search-system/`.

---

## 0. Decisions (TL;DR)

1. **Build the assistant rail as a first-class storefront shell region**, not a chat widget. Left rail, persistent across search → listing → PDP → cart, reflows the page (no overlay), collapsible, remembered. Mobile = bottom sheet + sticky "Ask" bar.
2. **The assistant always has the live cart in context.** Every answer is grounded in cart lines + current query + shopper memory. This is the feature the user called out and it is what Amazon actually ships (verified live on 2026-09-02, see §1).
3. **Go one step further than Amazon:** auto-generate a "based on your search + cart" brief the moment results render, with zero prompt. Amazon only offers query-tailored prompt chips until you ask.
4. **One commerce tool surface, three consumers.** Implement UCP capabilities (catalog, cart, checkout, order) as internal Convex functions once. The storefront UI, the in-site assistant (tool-calling LLM), and external agents (UCP REST + MCP bindings) all call the same surface. This is the payoff of "ConvexPress was designed with this in mind."
5. **UCP is the protocol to conform to, not ACP.** ChatGPT Instant Checkout (ACP) was mothballed March 2026; Amazon, Meta, Microsoft, Salesforce, Stripe joined the UCP Tech Council April 2026; Google Universal Cart (summer 2026) checks out via UCP. Keep the ACP feed format only as a cheap export.
6. **Everything admin-driven.** New settings section `commerce.assistant` + a storefront layout section exposed through `settings.getPublic`. No hardcoded copy, placement, widths, model names, or section lists.
7. **Recommendation quality comes from a typed product-relation graph + embeddings**, not from prompt-only LLM guessing. WooCommerce `upsellProductIds`/`crossSellProductIds` already sync but are never rendered; they become seed edges.

---

## 1. What Amazon actually ships (observed live, desktop, signed in, 2026-09-02)

Amazon retired Rufus and launched **Alexa for Shopping** on 2026-05-13 (TechCrunch, aboutamazon.com). Observed behavior on amazon.com:

### 1.1 Layout
- Entry points: an "alexa for shopping" pill in the secondary nav, a cursive-A in the search bar, and a dedicated chat window. Desktop: "at the top of your screen."
- Clicking the pill opens a **full-height left rail, ~285px of a 1464px viewport (~19.5%)**. The page **reflows** to the right (filters rail + results grid shrink); nothing is overlaid.
- Rail chrome: wordmark + kebab menu + close X at top; bottom-docked input ("Ask a shopping question") with a "+" (photo / handwritten list upload) and a send arrow.
- The rail **persists across navigation** (search results → new search → cart page) and keeps the conversation.
- A Threads post complains the panel "keeps popping open every time I search." Lesson: auto-open must be an admin setting with a "first time only" mode and a remembered dismissal.

### 1.2 Empty / new-search state
- Header "Here are some things I can help with:" then **4 query-specific prompt chips** (for "burr coffee grinder for espresso": "Which burr grinder models are easiest to clean?", "Are burr grinders suitable for grinding other spices?", ...), plus thumbs up/down.
- Results page also grows a **"Narrow your search" chip row** with image tiles (Manual, Compact, Commercial, Single dose, Electric, Distributor leveler, Small) — AI-generated facets distinct from the classic left filter list.

### 1.3 Answer anatomy (the part to copy)
1. Short prose answer with bold product names and ✅ badges on the criteria that were checked ("Machines that fit (height under 15\")").
2. **Sections grouped by purpose**, each with a "see more" link: "Tamper & Distribution Kit", "Milk Frothing Pitcher (for the steam wand)", "Espresso Coffee Beans", "Descaling Solution (for maintenance)".
3. **Two product cards per section**: thumbnail, 2-line title, rating + count, "500+ bought in past month", deal badge, price + struck list price, Prime + delivery date, yellow **Add to cart** button.
4. **One-line rationale under every card** ("calibrated spring-loaded tamper, great all-in-one starter set for home espresso machines like the RIOSKY") + "More details".
5. Closing note with a follow-up question; a "Note:" callout when the recommendation branches (capsule vs ground).

### 1.4 Cart awareness (verified)
- After adding a machine to the cart and asking "what accessories do I need for the machine in my cart right now?", the reply opened: *"You have the RIOSKY Compact Espresso Machine in your cart — a 20-bar pump machine with a steam wand, PID temperature control, and touchscreen. Since it's a traditional pump espresso machine (not capsule-based), here's what you'll need to get started:"* and then grouped compatible accessories by purpose.
- It used **recent searches** as context before any product was in the cart ("based on your recent searches, are you asking about espresso machines for a small kitchen?").
- On the cart page the rail proactively offered: *"Pro tip: ... a burr grinder makes a big difference ... Want me to recommend a compact burr grinder that fits your counter space?"* — it fused **cart item + latest search ("burr grinder") + an earlier stated constraint (counter space)**.
- Result cards flip to a **"1 in cart" stepper** after add; the rail's Add to cart buttons drive the same cart.

### 1.5 Cart page touchpoints
- Per line: qty stepper, Delete, Save for later, **Compare with similar items** (launches the assistant), Share.
- Right rail: subtotal + Proceed to checkout, then "Items you may like" cards.
- Below: "Your Items" with **Saved for later / Buy it again** tabs and category chips.

### 1.6 Other Alexa for Shopping capabilities (from Amazon's announcements)
AI overviews on results and PDPs; side-by-side comparisons; "Why you might like this" on PDPs; 30/90/365-day price history; price alerts and **auto-buy at a target price** (default payment, 24-hour cancellation); **Scheduled Actions** (recurring cart adds); handwritten list → cart; visual search; custom shopping guides; a **personalization dashboard** where the shopper can see/edit what the assistant remembers; Buy for Me / Shop Direct for non-Amazon merchants.

---

## 2. The agentic commerce landscape (what won, and when)

| Date | Event | Why it matters to ConvexPress |
|---|---|---|
| 2025-09-29 | OpenAI + Stripe release **ACP** (Agentic Commerce Protocol); ChatGPT Instant Checkout | First mover; single-item only |
| 2025-11-25 | Perplexity **Instant Buy** with PayPal | In-chat purchase; 57% higher AOV claim |
| 2026-01-11 | Google announces **UCP** at NRF with Shopify, Etsy, Wayfair, Target, Walmart; 20+ endorsers (Visa, Mastercard, Stripe, Amex, Best Buy, Home Depot) | Coalition standard |
| 2026-03 | **ChatGPT Instant Checkout mothballed**; <15 Shopify merchants ever live; no multi-item carts, no loyalty | ACP lost the first round |
| 2026-03-11 | Amazon expands **Buy for Me / Shop Direct**: 400k+ merchants, 100M products, no merchant integration needed | Amazon's agent will buy from ConvexPress sites whether or not we integrate; feeds via Feedonomics/Salsify/CEDCommerce improve accuracy |
| 2026-03-19 | UCP adds Cart, Catalog, Identity Linking; Merchant Center onboarding | Cart building becomes a protocol capability |
| late 2026-03 | Shopify **Agentic Storefronts** on by default; Shopify Catalog syndicates to ChatGPT, Copilot, Gemini, AI Mode | Baseline expectation for any platform |
| 2026-04-08 | UCP release: Cart, Catalog search+lookup, Order, request/response signing, embedded checkout, OAuth identity linking | Current stable feature set |
| 2026-04-24 | **Amazon, Meta, Microsoft, Salesforce, Stripe join the UCP Tech Council** | UCP is the industry standard |
| 2026-05-13 | Amazon **Alexa for Shopping** replaces Rufus | The UX benchmark (§1) |
| 2026-05 (I/O) | Google **Universal Cart** (Search, Gemini, then YouTube, Gmail); Conversational Attributes in Merchant Center; UCP to CA/AU/UK; AP2 mandates | Cross-merchant AI cart checks out via UCP + Google Pay |
| 2026-08-25 | UCP release: Actions primitive, Location, 3DS2, request constraints, payment schedules, **Loyalty extension**, split payments, buyer-consent map (breaking changes to fulfillment, consent, profile keys) | Target version for conformance |

**Conversion data worth designing around:** shoppers who engage AI in-session convert ~12.3% vs 3.1%; AI cart suggestions ~3.8% add-to-cart vs 1.56% manual picks; well-tuned cart drawers lift AOV 15–25%; Baymard's average abandonment 70.22%, with checkout UX alone worth up to +35% conversion. Cart-drawer rules from practitioners: 2–3 related products, not 5–6; design at 375px first; checkout button always visible.

---

## 3. UCP — technical anatomy (version 2026-08-25)

### 3.1 Roles and discovery
Roles: Platform (agent surface), Business (merchant), PSP, Credential Provider. Businesses publish a profile at **`/.well-known/ucp`**:

```json
{
  "ucp": {
    "version": "2026-08-25",
    "services": {
      "dev.ucp.shopping": [
        { "version": "2026-08-25", "transport": "rest",
          "endpoint": "https://store.example.com/ucp/v1",
          "schema": "https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json" },
        { "version": "2026-08-25", "transport": "mcp",
          "endpoint": "https://store.example.com/ucp/mcp" }
      ]
    },
    "capabilities": {
      "dev.ucp.shopping.catalog":  [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.cart":     [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.checkout": [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.order":    [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.discount": [{ "version": "2026-08-25", "extends": ["dev.ucp.shopping.checkout","dev.ucp.shopping.cart"] }],
      "dev.ucp.shopping.fulfillment": [{ "version": "2026-08-25", "extends": "dev.ucp.shopping.checkout" }],
      "dev.ucp.common.identity_linking": [{ "version": "2026-08-25", "config": { "scopes": ["dev.ucp.shopping.order:read"] } }]
    },
    "payment_handlers": { "google.pay": [ { "id": "google_pay", "version": "2026-08-25", "available_instruments": [ { "type": "card" } ] } ] }
  },
  "keys": [ { "kid": "...", "kty": "OKP", "crv": "Ed25519", "x": "...", "use": "sig", "alg": "EdDSA" } ]
}
```

Transports: REST (OpenAPI), MCP (JSON-RPC / OpenRPC), A2A (agent card), Embedded (in-page JSON-RPC iframe). Every response carries a reserved `ucp` member (`version`, `status`, `capabilities`, optional `request_constraints`). Requests carry `UCP-Agent`, `request-signature` / HTTP Message Signatures, `idempotency-key`, `request-id`.

### 3.2 Capabilities

| Capability | REST | MCP | Notes |
|---|---|---|---|
| Catalog | search / lookup | `dev.ucp.shopping.catalog.search`, `.lookup` | Product → variants (id used as checkout `item.id`), `price` minor units + currency, `price_range`, `availability`, `selected_options`, `media`, `options`, `rating`, `categories`, `tags`, pagination, buyer-aware personalization |
| Cart | `POST /cart`, `GET/PUT/DELETE /cart/{id}` | `create_cart`, `get_cart`, `update_cart`, `cancel_cart` | No status lifecycle; estimates only; `continue_url`, `expires_at`; converts to checkout by passing `cart_id`; scope `dev.ucp.shopping.cart:manage` |
| Checkout | `POST /checkouts`, `GET/PUT /checkouts/{id}`, `POST /checkouts/{id}/complete`, `/cancel` | same ops | Statuses: `incomplete` → `requires_escalation` (must send `continue_url`) → `ready_for_complete` → `complete_in_progress` → `completed`; `canceled` from any. `messages[]` (error/warning/info; severities `recoverable`, `requires_buyer_input`, `requires_buyer_review`, `unrecoverable`; `presentation: "disclosure"` must be shown, cannot auto-dismiss). Standard codes: `out_of_stock`, `item_unavailable`, `address_undeliverable`, `payment_failed`, `eligibility_invalid`. `totals[]` types subtotal/shipping/tax/discount/total. `quantity_unit` (Rec20 `C62` each, `KGM`, ...). `context.eligibility` (loyalty claims verified before completion). Update is full replacement; not allowed during `complete_in_progress`. |
| Order | `GET /orders/{id}` + webhooks | | Full-entity webhooks (Standard Webhooks headers + RFC 9421 signing); `line_items[].quantity {original,total,fulfilled}`, `fulfillment.expectations[]` + append-only `events[]` (`shipped`, `delivered`, ...), `adjustments[]` (`refund`, `return`, ...), `permalink_url` |
| Identity linking | OAuth 2.0 auth-code + PKCE S256, RFC 8414 metadata at `/.well-known/oauth-authorization-server` | | Scopes `{capability}:{permission}`; a linked identity lets the business prefill loyalty, saved instruments, addresses |
| Extensions | discount, fulfillment, buyer-consent (reverse-DNS keyed map), loyalty, location (`dev.ucp.common.location`) | | Extensions compose via `allOf` with a `$defs` entry per parent |

### 3.3 Google onboarding path (native checkout in AI Mode / Gemini / Universal Cart)
1. Active Merchant Center account with checkout-eligible product feed (add the new **Conversational Attributes** for fit, materials, ingredients, care).
2. Submit the UCP merchant interest form; US merchants first, CA/AU/UK rolling out.
3. Implement REST checkout (`POST /checkout-sessions`, `PUT`, `POST .../complete` in Google's guide; spec-native `/checkouts`), publish the profile, pass the conformance suite (github.com/Universal-Commerce-Protocol/conformance).
4. Auth via `X-API-Key` or OAuth bearer. **SLOs:** availability ≥95%; create/update p50 ≤1s, p95 ≤4–5s; complete p50 ≤6s, p95 ≤10s.
5. Payment handler: Google Pay tokens on `/complete`; merchant remains merchant of record.
6. Optional embedded (iframe) checkout for complex flows.

### 3.4 Where ConvexPress stands today
- `convex/http/checkout.ts` exposes `POST /api/ucp/checkout/sessions` and `GET/PATCH/POST(complete)/DELETE /api/ucp/checkout/sessions/{id}` keyed by an internal `sessionToken`. This is the VexCart-era pre-standard shape: wrong paths, no `ucp` envelope, no statuses/messages/totals contract, no `/.well-known/ucp`, no signing, no cart/catalog/order capabilities, no identity linking.
- `/api/v1/discovery` exists for the CMS API, not UCP.
- The `commerceUcp` plugin PRD + checklist (2026-04-07) predate the April and August spec releases and should be rebased on 2026-08-25.

---

## 4. ConvexPress today — gap analysis

| Area | Exists | Gap |
|---|---|---|
| Storefront shell | `routes/_marketing.tsx`; generic `components/layout/Sidebar.tsx` (w-64/72, sticky, desktop only, children only); `templates/SidebarLeftTemplate.tsx`; `shop.tsx` has a left filter rail | No shell region for a persistent assistant; no slot/registry for injected panels; `useLayoutConfig()` returns hardcoded `DEFAULT_LAYOUT_CONFIG` |
| Search | `search.tsx` single column, content types post/page/media/comment/course — **products not indexed**; `search_commerce_products` index is **title only**, used by `shop.tsx` | Hybrid product search (title+description+attributes full text + vector), AI facets ("Narrow your search"), products in sitewide search |
| Listing | `products/index.tsx` plain grid, no filters; `design-catalog` skill already specifies filter rail + grid | Implement the rail layout the skill promises; make room for the assistant rail |
| PDP | gallery, variants, add-to-cart, reviews, wishlist | No related/upsell rendering, no AI overview, no "why you might like this", no compare |
| Cart drawer | `CartDrawer.tsx`: qty, remove, subtotal | No recommendations, free-shipping progress, save-for-later, assistant hook |
| Cart page | two-column, sticky summary, sharing | No recs, compare, buy-again, saved-for-later, assistant tips |
| Cart model | `commerce_carts` (session-token primary, Clerk `userId` optional, merge), `commerce_cart_items` with dynamic pricing + metadata | Fine as-is; needs an "assistant context" read model (compact serialization of lines + attributes) |
| Recommendations | `upsellProductIds`, `crossSellProductIds` synced from Woo, never rendered; `recommendationStrategy` is shipping-rate ranking | No relation graph, no co-purchase stats, no embeddings, no recs table |
| AI | `convex/ai/*` (OpenRouter default, Anthropic, OpenAI), page/course generation, KB RAG + support deflection widget | No shopping assistant, no tool-calling agent over commerce, no shopper memory |
| Admin settings | `settings` table by section; `getPublic` exposes header/footer/palette/blocks/plugins/commerceConfig | No `commerce.assistant` or storefront layout section; layouts table deprecated |
| Extensions | 5-layer contract; only `forms` shipped; boolean gating on website | No UI slot system (explicitly out of contract) |
| Agentic protocol | pre-standard `/api/ucp/checkout/sessions` | Full UCP conformance (§3) |
| SEO / agent discoverability | JSON-LD via `lib/seo/jsonld.ts` | Product feed export (Merchant Center + ACP feed formats), `llms.txt`, richer Product JSON-LD with offers/variants |

---

## 5. Target experience

### 5.1 The Shopping Shell
A new layout shell wraps every commerce route (`/search`, `/shop`, `/products`, `/products/$slug`, `/categories/*`, `/bundles/*`, `/cart`, checkout `index`/`shipping`/`review`; **not** the payment step).

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: logo · search (with assistant glyph) · account · cart badge  │
├────────────────┬─────────────────────────────────────┬───────────────┤
│ ASSISTANT RAIL │ MAIN                                │ CONTEXT RAIL  │
│ 300–340px      │ results / listing / PDP / cart      │ (cart page:   │
│ collapsible    │ classic filter rail lives inside    │ order summary │
│ persistent     │ MAIN, left of the grid              │ + recs)       │
│                │                                     │               │
│ • brief        │ "Narrow your search" AI chips       │               │
│ • grouped recs │ product grid w/ in-cart steppers    │               │
│ • prompt chips │                                     │               │
│ • thread       │                                     │               │
│ ─ input ─ + ↑  │                                     │               │
└────────────────┴─────────────────────────────────────┴───────────────┘
```

- Desktop ≥1280: rail open by default on first search (admin: `autoOpen: firstSearch | always | never`), page reflows, state persists in `localStorage` + user profile.
- 1024–1279: rail collapses to an icon strip; opens as a push panel.
- Mobile: bottom sheet (peek → half → full) with a sticky "Ask about these results" bar above the tab bar; never covers the checkout button.
- Reduced motion respected; rail is a landmark (`<aside aria-label>`), focus-trapped only when full-screen on mobile.

### 5.2 Assistant rail states
1. **Idle (no query, empty cart):** store-aware starters from admin ("Help me choose a …") + trending categories.
2. **Query brief (auto, no prompt):** on results render, a streamed brief: one-paragraph read of the query, 3–5 picks with rationale, "Narrow" chips mirrored from the AI facets, 4 query-specific prompt chips.
3. **Cart brief (auto, when cart non-empty):** "Complete your setup" — groups by purpose (accessory / consumable / maintenance / upgrade), 2 cards per group, rationale line per card, "see more", "Add all".
4. **Conversation:** user bubbles, structured assistant blocks (text, product group, compare table, callout, action confirmation). Every product card = the same card component as the grid, so the "in cart" stepper state is shared and realtime.
5. **Proactive tip:** at most one per cart change, rate-limited, dismissible, rendered as a quiet callout, never a modal.
6. **Memory chip row:** "Remembering: 15-inch cabinet · budget under $200" with edit/forget (mirrors Amazon's personalization dashboard; required for trust).

### 5.3 Search results
- Products enter sitewide search; the results page becomes a grid (product) + list (content) hybrid with a type switcher.
- AI facet row ("Narrow your search") generated once per query, cached in `commerce_search_facets`, admin can pin/ban chips.
- AI overview above results only for question-shaped queries (Amazon's routing rule); plain keyword queries go straight to the grid.
- Cards gain: "bought in past month" (from orders), deal badge (from dynamic pricing), delivery promise (from shipping settings), in-cart stepper.

### 5.4 Cart drawer
- Lines with stepper, remove, save-for-later; free-shipping progress bar (threshold from shipping settings).
- One "Goes with your cart" row: 2–3 items from the relation graph, rationale on hover/tap, add-in-place.
- "Ask the assistant" affordance that opens the rail with cart context pre-loaded.
- Checkout button pinned; drawer designed at 375px first.

### 5.5 Cart page
- Left: lines with **Compare with similar**, Save for later, Share (existing), stock/price-change notices as UCP-style `messages` (same component used for agent messages).
- Right: order summary (existing) + "Items you may like".
- Below: "Saved for later" and "Buy it again" tabs with category chips; assistant "Pro tip" callout lives in the rail, not here.

### 5.6 PDP touchpoints
- AI overview (cached per product, regenerated on content change), "Why you might like this" (needs memory + consent), "Compare with similar" → compare table in the rail, "Goes with this" (relation graph), price history when dynamic pricing has data.

### 5.7 Agentic actions (later phases, all opt-in, all with consent records)
Price watch + notify; auto-buy at target price (default payment + cancellation window); scheduled reorders; handwritten list / photo → cart; shopping guides (AI-generated collection pages).

---

## 6. Architecture

### 6.1 One commerce tool surface
Implement UCP's capability operations as internal Convex functions with the UCP request/response shapes, then bind them three ways:

| Consumer | Binding | Auth |
|---|---|---|
| Storefront UI | React hooks over the same queries/mutations | session token / Clerk |
| In-site assistant | Convex action running a tool-calling loop (Anthropic via `convex/ai`, OpenRouter fallback); tools = `catalog.search`, `catalog.lookup`, `cart.get`, `cart.update`, `relations.forCart`, `memory.read/write`, `compare.build`, `checkout.preview` | server-side, acts on the shopper's own session |
| External agents | `/.well-known/ucp` profile, REST `/ucp/v1/*`, MCP endpoint `/ucp/mcp` (Convex HTTP actions), order webhooks, HTTP Message Signatures, API keys / OAuth via Clerk | signed requests + keys |

The assistant therefore "speaks UCP" internally; the external surface is just a transport binding plus signing. Conformance tests exercise the same code the storefront uses.

### 6.2 Data model additions (all in `packages/backend/convex/schema/`)
- `commerce_product_embeddings` — `productId`, `variantId?`, `model`, `vector` (Convex `vectorIndex`, 1536 dims), `contentHash`, `updatedAt`. Rebuilt by a scheduled action on product change.
- `commerce_product_relations` — typed edges: `fromProductId`, `toProductId`, `type` (`accessory_of | compatible_with | consumable_for | maintenance_for | upgrade_of | replacement_for | bundle_with | similar_to`), `weight`, `source` (`manual | woo_upsell | woo_crosssell | ai_inferred | co_purchase`), `evidence?`, `status` (`active | rejected`). Seeded from Woo upsell/cross-sell, co-purchase stats from orders, AI inference over attributes; admin can approve/reject.
- `commerce_product_conversational_attributes` (or fields on `commerce_products`) — fit, materials, dimensions, compatibility keys, care, use cases; mirrors Google's Conversational Attributes so one dataset serves the feed and the assistant.
- `commerce_search_facets` — `queryHash`, `chips[] {label, filter}`, `pinned`, `banned`, `generatedAt`.
- `commerce_assistant_sessions` — `sessionToken`, `userId?`, `cartId?`, `openState`, `lastRoute`, `createdAt`.
- `commerce_assistant_messages` — `sessionId`, `role`, `blocks[]` (typed: `text | product_group | compare_table | callout | action_result | memory_update`), `toolCalls[]`, `tokens`, `latencyMs`, `feedback?`.
- `commerce_shopper_memory` — `subjectId` (user or session), `fact`, `kind` (`constraint | preference | household | project`), `source` (`stated | inferred`), `confidence`, `consented`, `expiresAt?`.
- `commerce_recommendation_events` — impressions / clicks / adds / purchases per surface (`rail | drawer | cart_page | pdp | search`) for attribution and A/B.
- `commerce_agent_watches` (phase 5) — price/stock watches, auto-buy mandates with consent record and cancellation window.
- UCP plugin tables from the existing checklist (`commerce_ucp_api_keys`, `commerce_ucp_session_audit`) plus `commerce_ucp_profile` (published capability set, keys, versions) and `commerce_ucp_carts` (external cart ids mapped to internal carts).

### 6.3 Search pipeline
Full-text index on `commerce_products` over title + description + attribute terms (filter by status, category, price band) merged with vector search from `commerce_product_embeddings`; reciprocal-rank fusion; then the same ranker feeds `catalog.search`. Query understanding (question vs keyword, constraints extraction) runs in the assistant action only when the rail is open or the query is question-shaped.

### 6.4 Admin (settings section `commerce.assistant`, exposed via `getPublic`)
`enabled`, `displayName`, `avatarMediaId`, `placement` (`left | right`), `widthPx`, `autoOpen` (`firstSearch | always | never`), `routes[]`, `mobileMode` (`sheet | tab`), `model` / `fallbackModel`, `maxPicks`, `groupsEnabled[]`, `cardsPerGroup`, `proactiveTips` + `tipCooldownMs`, `promptChips` (`auto | curated | off`) + curated list, `memoryEnabled` + retention days, `disclosureText`, `boostedProductIds[]`, `excludedCategoryIds[]`, `rateLimits`, `analyticsEnabled`. Plus a storefront layout section (`storefront.layout`) replacing the hardcoded `DEFAULT_LAYOUT_CONFIG`: rails, widths, breakpoints, filter-rail on/off per route.

Admin screens: assistant settings, relation graph review queue (approve AI-inferred edges), memory/consent policy, recommendation analytics (impressions → adds → orders by surface), UCP dashboard (profile, keys, sessions, conformance status, webhook log).

### 6.5 Extension slot system (new, small)
Add a storefront slot registry (`rail.left`, `rail.right`, `results.aboveGrid`, `cart.drawer.belowLines`, `cart.page.belowSummary`, `pdp.belowBuyBox`) with admin-orderable panels. The assistant rail is the first panel; future extensions (loyalty, reviews) register the same way. This satisfies "extensions have a defined contract" without a marketplace.

---

## 7. Phased roadmap (execute in order; each phase ships behind its flag)

**Phase 0 — Foundation.** Settings sections + `getPublic` exposure; slot registry; Shopping Shell with rail placeholder; products into sitewide search; product full-text index expansion; embeddings table + backfill action; relation graph seeded from Woo upsell/cross-sell + co-purchase; analytics events. *No visible AI yet; the layout ships.*

**Phase 1 — Assistant rail v1.** Query brief, cart brief ("Complete your setup"), prompt chips, structured product-group blocks with add-to-cart, shared card component with in-cart stepper, AI facets row. Tool-calling action over the internal commerce surface. Feedback thumbs. Admin toggles.

**Phase 2 — Cart + PDP revamp.** Drawer recs + free-shipping bar + save-for-later; cart page compare / buy-again / saved tabs / message component; PDP overview, "goes with this", compare in rail; mobile sheet.

**Phase 3 — Memory + proactive.** Shopper memory with consent UI, proactive tips, compare tables, "why you might like this", photo/list → cart, shopping guides.

**Phase 4 — UCP conformance (2026-08-25).** `/.well-known/ucp` profile with keys; REST `/ucp/v1` catalog/cart/checkout/order with the `ucp` envelope, statuses, messages, totals, `continue_url` into the existing checkout; MCP binding; HTTP Message Signatures + idempotency; order webhooks; identity linking via Clerk OAuth; conformance suite green; Merchant Center feed with Conversational Attributes + interest form (**user-gated: Merchant Center account, Google Pay handler config**); ACP feed export as a by-product. Retire `/api/ucp/checkout/sessions`.

**Phase 5 — Agentic actions.** Price/stock watches, auto-buy with buyer-consent records and cancellation window, scheduled reorders, AP2 mandate verification when Google ships it broadly.

---

## 8. Guardrails (from the research, keep as acceptance criteria)
- Checkout button always visible in drawer and on mobile; assistant never covers it.
- 2–3 recommendations per group; rationale line on every card; no unexplained recommendations.
- Rail never auto-opens more than admin allows; dismissal remembered per shopper.
- Every agentic action (add, watch, buy) is confirmed in the UI and logged; memory is visible and editable.
- Latency budgets match Google's UCP SLOs (create/update p95 ≤4s, complete p95 ≤10s) so the same functions qualify for external agents.
- Sponsored/boosted placements are labeled (Amazon labels "Sponsored" inside the rail too).
- No hardcoded copy, models, widths, or section lists; all from settings.

---

## 9. Sources
- TechCrunch, "Amazon launches an AI shopping assistant for the search bar, powered by Alexa+" (2026-05-13) — https://techcrunch.com/2026/05/13/amazon-launches-an-ai-shopping-assistant-for-the-search-bar-powered-by-alexa/
- aboutamazon.com, "Meet Alexa for Shopping" — https://www.aboutamazon.com/news/retail/alexa-for-shopping-ai-assistant ; "How to use Alexa for Shopping" — https://www.aboutamazon.com/news/retail/how-to-use-amazon-shopping-ai-assistant ; Rufus personalization — https://www.aboutamazon.com/news/retail/amazon-rufus-ai-assistant-personalized-shopping-features
- Live observation of amazon.com desktop, 2026-09-02 (screenshots in the companion artifact)
- Google Developers Blog, "Under the Hood: UCP" — https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/
- UCP spec (2026-08-25): overview, checkout, cart, catalog, order, identity linking — https://ucp.dev/specification/overview , https://ucp.dev/specification/shopping/checkout/ , https://ucp.dev/specification/shopping/cart/ , https://ucp.dev/specification/shopping/catalog/ , https://ucp.dev/specification/shopping/order/ , https://ucp.dev/specification/common/identity-linking/
- UCP releases — https://github.com/Universal-Commerce-Protocol/ucp/releases ; samples — https://github.com/Universal-Commerce-Protocol/samples ; conformance — https://github.com/Universal-Commerce-Protocol/conformance
- Google Merchant UCP — https://developers.google.com/merchant/ucp , checkout guide — https://developers.google.com/merchant/ucp/guides/checkout
- Google blog: UCP launch — https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/ ; UCP updates 2026-03-19 — https://blog.google/products-and-platforms/products/shopping/ucp-updates/ ; Universal Cart — https://blog.google/products-and-platforms/products/shopping/google-shopping-cart/ ; agentic checkout — https://blog.google/products-and-platforms/products/shopping/agentic-checkout-holiday-ai-shopping/
- UCP Tech Council expansion (2026-04-24) — https://www.newsfilecorp.com/release/294133/Amazon-Meta-Microsoft-Salesforce-and-Stripe-Join-the-Universal-Commerce-Protocol-Tech-Council
- Google I/O 2026 commerce recap — https://www.azoma.ai/insights/google-i-o-2026-what-the-agentic-commerce-announcements-mean-for-brands
- ACP — https://github.com/agentic-commerce-protocol/agentic-commerce-protocol , https://docs.stripe.com/agentic-commerce/acp ; Instant Checkout status — https://explodingtopics.com/blog/agentic-commerce-protocol , https://www.modernretail.co/technology/2026-will-prove-whether-ai-checkout-is-here-to-stay/
- Amazon Buy for Me / Shop Direct expansion — https://techcrunch.com/2026/03/11/amazon-expands-a-program-that-lets-customers-shop-from-other-retailers-sites/ , https://www.digitalcommerce360.com/2026/03/11/amazon-opens-up-new-ai-enabled-buy-for-me-shop-direct-options-for-merchants/
- Shopify agentic commerce — https://www.shopify.com/blog/how-agentic-commerce-works , https://weaverse.io/blogs/shopify-spring-26-agentic-storefront-era
- Walmart Sparky — https://www.digitalcommerce360.com/2025/06/11/walmart-sparky-virtual-agentic-ai-assistant/
- Conversion / cart-drawer data — https://www.metarouter.io/post/agentic-commerce-trends-statistics , https://www.growthsuite.net/resources/shopify-upsell-cross-sell/cart-drawer-upsell/best-practices , https://baymard.com/blog/year-in-review-2025-and-2026-roadmap
- Agent discoverability (schema.org, feeds, llms.txt) — https://www.paz.ai/glossary/how-to-structure-product-data-for-ai-agents
