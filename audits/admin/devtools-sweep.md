# Chrome DevTools Sweep — Admin

**Date:** 2026-05-12
**App:** ConvexPress-Admin (running at http://localhost:4105)
**Auditor:** chrome-devtools-mcp automated sweep
**Scope:** All P0 routes after smoke suite turned green

## Methodology

For each P0 route, with an authenticated admin session:
1. Navigate to the route
2. Wait for content to paint
3. Take a11y snapshot (verify content renders, primary controls present)
4. Read console messages, filter to `error` + `warn`
5. Record findings

## P0 results

| Route | Console | Primary content | Findings |
|---|---|---|---|
| `/dashboard` | clean | At-a-glance widgets, Activity, Quick Draft, Moderation, System Health all rendered | ✅ Clean |
| `/commerce` | clean | Commerce hub overview | ✅ Clean |
| `/commerce/orders` | clean | Orders list | ✅ Clean |
| `/commerce/orders/abandoned` | clean | Abandoned carts list | ✅ Clean |
| `/commerce/payments` | clean | Payments view | ✅ Clean |
| `/commerce/products` | clean | Products list | ✅ Clean |
| `/commerce/customers` | clean | 7,950 customers, tabs (All/With Orders/No Orders/Guests/Registered), search, pagination all working | ✅ Clean |

**Result: 7/7 P0 routes pass DevTools sweep with zero console errors or warnings.**

## What this DOES catch

- Console.error / console.warn during page load
- 5xx and failed network calls (per smoke helper)
- Missing primary content (empty render, broken layout)
- Crashes caught by React error boundary

## What this does NOT catch (not yet swept)

- Click-time bugs — open a modal, submit a form, trigger a save
- Hydration mismatches that only show after JS rehydrates
- Race conditions on Convex subscription churn
- Mobile-viewport rendering (sweep was desktop only)
- Accessibility issues (use `chrome-devtools-mcp:a11y-debugging` for that)

## Next-pass recommendations

When you want deeper coverage, escalate to per-route interactive sweeps:

1. **P0 + P1 forms** — open `/commerce/products/new`, `/posts/new`, `/users/new`, `/pages/new`. Fill required fields, hit Save. Watch for validation errors that crash, network 5xx on submit, infinite save spinners.
2. **Destructive flows** — trigger delete confirmation dialogs and accept them on disposable records. Watch for stale-cache regressions after delete.
3. **Bulk actions on list tables** — select multiple rows, run "Bulk Edit" / "Move to Trash". This exercises the most error-prone code paths.
4. **Mobile viewport** — re-run all P0 at 375px width. Sidebar collapse, table overflow, modal positioning are common failure modes.

These are higher effort (each interactive flow is several clicks + assertions). Recommend doing them only when you're ready to harden specific systems — e.g. before opening commerce to live customers.

## How to re-run this sweep

```bash
# Start dev server
cd ConvexPress-Admin/apps/web && bun run dev

# In a separate process, via chrome-devtools-mcp:
# - new_page http://localhost:4105/dashboard (uses your existing cookies)
# - navigate_page each route
# - list_console_messages with types: ["error", "warn"]
```
