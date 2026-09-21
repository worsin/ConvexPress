# Native product routing and search repair

September 5, 2026. Worktree: `/Users/worsin/.codex/worktrees/convexpress-hardening`.

## Problem and change

Clicking Forest camp mug changed the Electron URL and breadcrumb to the product ID, but the product list stayed mounted. The generated router nested the detail and new routes under `commerce/products.tsx`, whose component never rendered an Outlet. The parent now owns the unchanged search validator and renders Outlet; the original list and integrity widget live in `products.index.tsx`. Detail and new routes retain their existing paths and behavior.

Native list acceptance then exposed a separate shared SearchBox bug. Immediate submit updated the URL, but its effect compared the old debounced value with the new controlled value and navigated back to the old search. This reproduced through both button and Enter. The actual mounted component regression failed with an empty input immediately after submitting `notebook`.

SearchBox now schedules debouncing from input events and cancels pending input on submit, clear, external value change and unmount. External URL changes synchronize the field without creating another search. The native form/search landmark and 300 ms typing debounce remain.

## Evidence

- Native existing product renders Edit Product, Forest camp mug, current stock 22 and its actual featured image. Back to products restores the three-record list.
- Button search for `notebook` leaves `?search=notebook` and only Field notebook. Enter search for `forest` leaves `?search=forest` and removes the notebook result. Clear restores the list.
- Add New Product opens the real Add Product form at `/commerce/products/new`, with an empty title. The operator returned without creating a product.
- `output/aster-house/product-route/acceptance.json` and three screenshots record those checks. No product create/save/repair/stock action was performed.
- The actual product Featured Image picker showed three complete media records, the notebook query showed one loaded notebook image, a single-token unmatched query showed No media found, and clearing restored three. Closing did not select or save anything. Evidence: `output/aster-house/media-pagination/product-picker-acceptance.json` and `product-picker-notebook.png`. This small library does not prove live multi-page picker behavior; bounded/split/overflow behavior remains covered by the earlier local tests.
- Actual SearchBox DOM regression covers immediate submit, settled debounce, cancelling on clear, external navigation and unmount. Red before the repair; green after. Combined route/search test invocation passes two subprocess tests with internal Node assertions.
- Full Admin TypeScript passed, `/tmp/convexpress-native-routes-search-types.log`. Scoped Biome lint passed five root-owned files; formatting and scoped diff-check passed.

The five other missing-Outlet parents and Support/KB redirects are documented in `admin-route-parent-outcome.md`. This does not establish that every reported mouse/scroll symptom has the same cause or that every screen is production accepted.
