# Aster UI acceptance repairs

Root observed the Explore target under a 136px sticky header, an unnamed image-less product link, and a closed support dialog in the staging accessibility tree.

## Changes

- Core, Journal, Depot and Aster headers now share `useStickyHeaderOffset`. It measures the actual border-box height and sticky top inset, updates `--site-header-offset` through ResizeObserver/window resize, and clears its value on unmount. This accounts for optional tagline/top bars and responsive layout. Aster's Explore target uses that shared offset plus 1rem breathing room. Static headers contribute zero obstruction; no business-specific dimensions or copy were added.
- Closed support panels now render no DOM, guaranteeing no hidden dialog or focusable descendants even in accessibility tooling that does not model native `inert`. The previous source already set `inert`; therefore the observation alone did not prove native-browser focus exposure. Opening moves focus into the panel and closing restores its trigger. The dialog is nonmodal because the surrounding page remains interactive. The removed closed panel animation does not affect parent widget navigation state, which already resets to Home on reopen.
- Current ProductMiniCard source already includes `aria-label={product.title}` on the image link. An isolated test renders the actual component both with and without media and confirms its named product destination. No speculative product change was made. Root should identify the rendered component/bundle if the live accessible name remains absent.

## Verification

- Three focused tests pass: actual header measurement updates (136px to rounded 185px), static-header zero offset, observer cleanup; actual ProductMiniCard image/missing-image markup; actual WidgetPanel closed/open/close DOM lifecycle, focus restoration and Escape; server-rendered dialog semantics. The DOM integration runs in an isolated subprocess so its hook mocks cannot affect other tests.
- Website TypeScript and lint pass. No backend API/schema change; requires a Website rebuild and publication for live acceptance.
- Root browser acceptance remains: Explore heading visible below the configured sticky header at desktop/mobile sizes, image-less product link name, closed support dialog absent, keyboard open/close and trigger-focus restoration. This agent performed no browser, native, provider or live actions.

Related Events live reactivity acceptance is recorded in `hc3-events-reactivity-outcome.md`: root observed an existing homepage update without reload/resave, empty browser error logs, and restored the original Event description. Route/dashboard pagination runtime acceptance remains pending.
