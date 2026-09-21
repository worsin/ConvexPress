# D01 — Website caller correction batch

The commerce agent owns the compact API declaration generator and backend DTO projections. This file records the Website consumer changes in the shared hardening worktree. No deployment or browser was run by this agent.

## Corrected behavior and contracts

- Consumer `generated/dataModel.d.ts` uses Convex's real `GenericId<T>` alias. Branded IDs remain intact in cart items/actions, current-user models, notifications, support tickets and KB article/category actions. IDs are no longer silently accepted as any table through an optional brand.
- `NewTicketForm` extracts `sessionId` from `useSessionId()`. Previously the entire `{sessionId,isReady}` object was sent to the AI deflection and analytics handlers expecting a string. Category prefill is validated against the actual ticket enum; invalid URL/prefill strings cannot become unsupported API categories.
- Ticket upload results validate the HTTP response contains a nonempty storage ID before building the mutation attachment. The opaque HTTP storage ID receives its Convex brand at that boundary; no server authorization or content validator is bypassed. A regression test uses mocked HTTP responses and does not upload any files externally.
- Homepage rich text is parsed with the existing TipTap schema before being passed as a document. Previously serialized JSON was cast directly to the document type, so the reader received a string rather than the expected document shape.
- Search filters and click analytics accept only the actual supported content-type union, and the recorded query ID stays branded. Invalid strings are not cast into the API union.
- Menu DTO mapping includes heading, separator and dashboard item kinds that the backend actually returns. Widget position uses an explicit supported-value fallback. Optional taxonomy results, null custom-field results and nullable author avatars are handled consistently.
- Membership decision plan keys remain strings, matching the pure membership evaluator. They are only compared with public plan IDs to resolve a pricing slug; they are not asserted into branded mutation IDs.
- Knowledge-base category article requests now use the handler's required cursor pagination arguments instead of unsupported page/perPage. Private Customizer draft restoration and preview messages validate object-valued modules before replacing current state; malformed saved data leaves the current draft intact with a visible error.
- Removed an obsolete query `@ts-expect-error`, missing required AI source field assumption, and some obsolete API-any casts in cart callers. No new any/ts-ignore escape was introduced to silence the compact contract errors.

## Evidence and remaining integration

Website source suite: **492 pass / 1206 assertions /34 files**. Targeted support/notifications/upload tests: **20 pass /84 assertions**. Website lint and `git diff --check` pass.

Final Website typecheck **passes (exit 0)** after the coordinated backend DTO refresh. The backend agent restored safe public media sizes, typed settings/plugin flags and LMS/gallery/product projections, and fixed the taxonomy archive privacy boundary while preserving safe author/image card enrichment. The public membership plan return now carries a concrete validator. Full compile log: `/tmp/d01-website-final-types.log`.

Browser/live acceptance remains with root; no browser or deployment was performed by this agent.
