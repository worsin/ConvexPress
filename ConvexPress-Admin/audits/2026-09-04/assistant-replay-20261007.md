# Assistant request replay and composer preservation

Backend source `acb12699`; Website composer follow-up `8556eaf7`. E113 is accepted for request replay on original Alpha. Full Assistant acceptance is **not** complete: the real provider exposed E114, an unintended cart write on a read-only question.

## Repair and validation

A failing registered-path regression proved that repeating one request could repeat the cart action. Stable client request IDs now claim an owner-bound ledger entry and user turn atomically. Completed requests replay a stored message reference; concurrent requests return REQUEST_IN_PROGRESS without executing another turn. Cleared results return an empty receipt rather than resurrecting history or rerunning tools. Guest adoption follows existing ownership rules. An interrupted request is never reclaimed for execution; an 11-minute watchdog records interruption. Repeated provider tool IDs reuse their receipt, and an unknown cart acknowledgement stops the tool loop. Older clients without a request ID must refresh before any action runs.

The Website preserves the same ID for an uncertain explicit retry and allocates a new ID after success or for a different question/shopper. A mobile attempt initially cleared the composer without dispatching. The exact transient guard responsible was not captured; a later instrumented attempt was ready and succeeded. Source inspection proved the composer cleared before checking send availability. The follow-up returns an explicit success result, preserves unavailable/failed/busy drafts, disables submission until ready and preserves newer edits while an earlier request finishes.

- Backend commerce suite: 427 pass, zero failures, 2,081 assertions across 36 files; strict backend types and frozen deployment pass.
- Hook tests after composer follow-up: 13 pass, 44 assertions. Composer regression: 1 pass, 10 assertions. Isolated wrappers and existing URL handoff tests pass.
- Website strict types, focused lint and client/server production build pass.
- Writer coverage: 1,492 writes, 30 owner tables, no bypass; block-kit check passes.

## Installed evidence

Original Alpha received backend acb12699 from 2,030 captured tracked files / 1,784 installed modules. Dry run and install passed, adding the request index. Existing operator session survived; owned controller session closed. Matching Website source merged locally; composer follow-up merged as d481ad88, preserving 8,043 other tracked paths. No push or runtime replacement.

On actual original Website4201:

1. Desktop explicit add: one item, two messages. Three completed-request replays returned identical receipts and left the cart unchanged.
2. Mobile deliberate second add: a different request ID, quantity two, four messages. Completed replay left quantity two.
3. Updated mobile composer retained the question while pending and cleared only after success. A concurrent replay returned REQUEST_IN_PROGRESS. A completed replay returned the same message and did not change the cart.
4. Clearing all owned memory/thread/cart then replaying all three IDs returned empty receipts, zero messages and an empty cart. Tombstone ledger entries remain to prevent repeated effects.

The third *original execution* failed its separate cart-intent requirement: “How many Compact 15 machines are in my cart? Do not change my cart.” increased quantity two to three. Its response included a successful cart_add receipt while claiming no cart change. This is preserved in mobile-final.json and mobile.png as **failed overall Assistant acceptance**, not counted as a replay failure or hidden by the successful duplicate checks. The add_to_cart boundary currently checks known/public product availability but delegates authorization entirely to provider instructions. E114 must establish a concrete shopper-authorized cart-change boundary; strengthening wording alone is not sufficient evidence.

## Preservation and next work

Exact baseline comparison passed for all selected originals: 17 users, 9 posts, 50 storage records, 14 settings, 15 emailQueue records, 11 Assistant sessions, 8 messages, 1 memory, 6 carts and 2 cart lines. Owned guest data cleared; private token removed; owned browser closed. All 14 protected runtimes remain alive. Small ledger receipts, empty owned session/cart records and normal private brief cache records remain; no original data was removed.

Raw evidence: output/assistant-replay-20261007/. Private snapshots stay outside the repository. Inventory stays 137 / 134 Verified / 3 In progress. Next: E114 cart-action authority, then remaining catalog bounds/visibility and selected-resource AI composition/style/promotion. Do not repeat accepted migration, customer adoption or E112. Claude audit65 is advisory and does not block work.
