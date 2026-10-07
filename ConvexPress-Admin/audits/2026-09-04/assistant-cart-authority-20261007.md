# Assistant cart actions require the shopper's exact selection

Source `13a4a2f3`, with variant compatibility in `1bf909bf`. Final source is installed on original Alpha; strict deployment, real-provider smoke, cleanup and original preservation passed. This addresses E114, not the remaining catalog visibility/read-bound or full delivery gates.

## Failed workflow and causal repair

The previous original Alpha test asked only “How many Compact 15 machines are in my cart? Do not change my cart.” The provider called add_to_cart anyway, increasing two units to three while its answer claimed no change. The tool boundary checked that the product was known/public but trusted provider intent as write authority. The regression reproduces this with registered queries/mutations and a provider forced to emit that cart call.

Cart tools now prepare an immutable product/variant/quantity action in the persisted reply. They cannot mutate the cart. The shopper's labeled Add button calls a separate owner-bound mutation with message and proposal IDs; the client cannot substitute a product or quantity. The normal cart mutation revalidates publication, membership, options, inventory, currency/pricing and cart authority. The cart write and added receipt commit in one mutation transaction, so simultaneous clicks or retries after an unknown acknowledgement cannot add twice. A cleared conversation invalidates its action even before asynchronous deletion completes. Disabled Assistant settings refuse pending additions.

Prepared actions show the exact quantity and product/option label. An explicit nondefault variant retains its ID; an internal reader verifies that the option is public and belongs to the product. Variant proposals do not display the default option's price or use its stock flag as the selected option's availability. The normal cart writer resolves the selected option's current price and inventory when the shopper adds it. Existing product-card cart controls remain unchanged. The provider is told that preparation does not add anything; historical prepared/added state is included in grounding. Provider-authored JSON cannot forge executable proposals or completed action receipts.

The first source revision restricted nondefault variants. A failing variant regression exposed that compatibility gap before E114 closure; 1bf909bf restores exact-variant behavior. This is part of the same repair boundary, not an unrelated commerce redesign.

## Verification

- Full scoped commerce suite: 432 passed, zero failed, 2,101 assertions across 36 files.
- Forced unauthorized tool calls leave the basket unchanged. Exact confirmation, concurrent/lost-ack retries, foreign/missing actions, cleared/disabled/unpublished actions, guest adoption, forged model blocks and nondefault/private/mismatched variants are covered.
- Hook/composer/URL handoff wrappers pass. The actual cart-action component test has 14 assertions covering no automatic dispatch, exact quantity, busy/retry/added states and nondefault option labeling/price behavior.
- Strict backend and Website types, focused lint and production client/server builds pass. Writer coverage remains 1,493 classified writes / 30 owner tables / no bypass.

Original Website4201 acceptance at 13a4a2f3 used the configured provider and actual visible UI:

1. A request for two Compact15 machines generated an exact two-unit action while the cart remained empty.
2. Clicking Add produced two units. Three parallel confirmation replays kept two units and returned the saved result.
3. At 390×844, the original read-only quantity question answered two and left two units; it generated no pending cart action. Replaying the completed answer caused no write.
4. A new mobile one-unit action left the cart at two until clicked, then made three. Its retry left three.
5. Clearing the owned thread/cart/memory invalidated both action IDs and made all three original requests replay empty results. No page errors occurred. Desktop and mobile screenshots were inspected.

The final variant addition is verified through registered backend mutation tests and the rendered component test; no original customer product or variant was modified for a live variant fixture. Final-source real-provider smoke is recorded separately in `output/assistant-cart-authority-final-20261007/live.json`.

## Preservation and rollout

Each candidate uses 2,031 captured tracked Admin files. Original operator-session retention is checked during installs, and owned controller sessions sign out. The initial installed source has 1,785 modules; the final source receipt records the final module inventory and hash. Website source is locally merged with exact other-path preservation receipts. No push or protected runtime restart.

Baseline originals compare exactly: 17 users, 9 posts, 50 storage records, 14 settings documents, 15 emailQueue records, 12 Assistant sessions, 8 messages, 1 memory, 7 carts and 2 cart lines. Owned browser data was cleared and its browser closed. All 14 protected runtimes are alive. Request tombstones, empty owned cart/session records and normal private brief cache records remain; no original records or settings were changed. The final-source smoke passed: the requested one-unit action left zero items before confirmation; two concurrent confirmations produced one item; the read-only question left one item. Cleanup and exact original preservation passed again against the same baseline.

Evidence: `output/assistant-cart-authority-20261007/` and `output/assistant-cart-authority-final-20261007/`. Private originals/source snapshots stay outside the repository. Block inventory remains 137 / 134 Verified / 3 In progress. Next: bounded/public catalog grounding and readers, then selected-resource AI composition/style/promotion and final fleet parity. Claude audit65 is advisory; do not wait for another audit or repeat accepted migration/customer/E112/E113 work.
