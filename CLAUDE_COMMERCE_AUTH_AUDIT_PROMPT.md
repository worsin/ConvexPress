# Claude Prompt: Commerce Plugin Auth and Permission Audit

You are working in the ConvexPress repo at:

`/Users/worsin/Development/ConvexPress`

We need you to audit and fix the role and permission system across the app, with special focus on the recently added e-commerce, cart, subscription, membership, shipping, returns, reviews, bundles, wishlist, and digital goods plugins.

## Context

This repository contains two app monorepos:

- `ConvexPress-Admin/`: admin app plus the owning Convex backend
- `ConvexPress-Website/`: public website consuming the admin-owned Convex deployment

The admin app owns the Convex schema, functions, role system, capabilities, and deployment workflow. The public website must not define or deploy Convex schema/functions.

The real security boundary is the Convex backend. Frontend route guards are only convenience UX and must not be treated as sufficient security.

Use the existing role/capability patterns in the codebase. Prefer `requireCan(...)` / `requireCanOnResource(...)` or the local helper that matches the module. Do not invent a parallel auth system.

## Audit Findings To Address

1. The new commerce/plugin capabilities are not properly registered.

   Code uses capability strings like:

   - `commerce.bundles.create`
   - `commerce.bundles.edit`
   - `commerce.bundles.delete`
   - `commerce.bundles.view`
   - `commerce.returns.view`
   - `commerce.returns.review`
   - `commerce.returns.receive`
   - `commerce.returns.refund`
   - `commerce.returns.manage`
   - `commerce.reviews.view`
   - `commerce.reviews.moderate`
   - `commerce.reviews.delete`
   - `commerce.wishlists.manage`

   But these are not present in the capability registry or deployed role/capability data.

   Start by checking:

   - `ConvexPress-Admin/packages/backend/convex/types/capabilities.ts`
   - `ConvexPress-Admin/packages/backend/convex/seed/roles.ts`

   Add a proper commerce capability taxonomy and ensure built-in roles, especially Administrator, receive the right capabilities.

2. Admin route page access is missing for the new plugins.

   The admin UI guards require access to routes like:

   - `/admin/commerce`
   - `/admin/membership`

   But seeded/deployed roles do not include those page access entries.

   Check and update:

   - `ConvexPress-Admin/packages/backend/convex/seed/roles.ts`
   - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce.tsx`
   - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership.tsx`
   - `ConvexPress-Admin/apps/web/src/lib/route-permission-guard.tsx`
   - `ConvexPress-Admin/apps/web/src/lib/auth-context.tsx`

   Ensure admin route access aligns with the page access model.

3. Too many commerce admin modules still use broad `manage_options`.

   This is technically restrictive, but too coarse for plugin-level roles. Products, orders, shipping, subscriptions, membership, digital goods, discounts, customers, reviews, returns, bundles, and settings should not all collapse into one site-settings permission.

   Audit commerce modules and replace broad `manage_options` where appropriate with granular commerce capabilities.

   Areas to check include:

   - `ConvexPress-Admin/packages/backend/convex/commerce`
   - `ConvexPress-Admin/packages/backend/convex/commerceBundles`
   - `ConvexPress-Admin/packages/backend/convex/commerceDigital`
   - `ConvexPress-Admin/packages/backend/convex/commerceReturns`
   - `ConvexPress-Admin/packages/backend/convex/commerceReviews`
   - `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions`
   - `ConvexPress-Admin/packages/backend/convex/commerceWishlists`
   - `ConvexPress-Admin/packages/backend/convex/membership`
   - `ConvexPress-Admin/packages/backend/convex/shipping`

4. Cart item mutations have raw-ID ownership gaps.

   In `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts`, check:

   - `updateItemQuantity`
   - `removeItem`

   These operate by `cartItemId` and need to prove the caller owns or controls the cart, either by current user ownership or matching session token. Do not allow mutation by raw cart item ID alone.

5. Returns expose private order/user/return data.

   In `ConvexPress-Admin/packages/backend/convex/commerceReturns/queries.ts`, check queries like:

   - `getById`
   - `getByReturnNumber`
   - `getWithDetails`
   - `getByOrder`
   - `getUserReturns`

   These need owner/admin checks or a secure token-based access model. Do not expose arbitrary return/order/user data by ID.

   Also inspect `ConvexPress-Admin/packages/backend/convex/commerceReturns/mutations.ts` for `requestReturn`. Guest return creation looks too permissive. If guest returns are supported, require a strong proof such as order access token, return token, email verification token, or equivalent.

6. Digital goods expose order download/license data.

   In `ConvexPress-Admin/packages/backend/convex/commerceDigital/queries.ts`, check:

   - `getFilesByProduct`
   - `getFile`
   - `getDownloadTokensByOrder`
   - `getLicenseKeysByOrder`
   - `getAvailableLicenseKeyCount`

   Admin-only digital file/license queries should require admin capability. Customer download/license queries should require order ownership or a secure download token. Do not expose all tokens/licenses by order ID alone.

7. Subscription entitlement queries are too broad.

   In `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts`, check:

   - `listEntitlements`
   - `checkEntitlement`

   These currently appear able to list/check entitlements for arbitrary users/subscriptions. Lock them down so callers can only access their own entitlements unless they have the appropriate admin capability. If server-side/internal checks need broader access, split those into internal functions.

8. Wishlist has ownership gaps.

   In `ConvexPress-Admin/packages/backend/convex/commerceWishlists/queries.ts`, check:

   - `getWishlist`
   - `getSharedWishlist`

   `getWishlist` should not return private wishlists by raw wishlist ID. It should require owner/admin or only expose public shared wishlists through the share-token flow.

   In `ConvexPress-Admin/packages/backend/convex/commerceWishlists/mutations.ts`, check:

   - `addItem`
   - `moveToCart`

   When a caller supplies a wishlist ID or wishlist item ID, verify ownership before adding, moving, or deleting items.

9. Shipping label/tracking actions need admin checks.

   In `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts`, admin verification actions already call `requireShippingAdminAction`, but these exported actions need review:

   - `createShipStationLabelForOrder`
   - `createShippingLabelForOrder`
   - `syncShipStationTracking`
   - `syncShipmentTracking`

   They appear to call internals without an admin capability check at the public action boundary. Label purchase and shipment tracking sync should require shipping/order admin capability.

   Checkout rate quote actions may remain session-token based, but make sure the session token proves access to the checkout/cart and consider rate limiting or abuse controls if supported by the existing system.

10. Themes are a non-commerce auth gap.

   If time permits, also inspect:

   - `ConvexPress-Admin/packages/backend/convex/themes/mutations.ts`

   Theme create/update/duplicate/remove appear under-protected, and activate may only require login rather than a capability. Lock this down using the existing capability model.

## Implementation Expectations

1. Do not rely on frontend guards for security.
2. Add missing capabilities to the canonical capability registry.
3. Update role seed data and page access defaults.
4. Keep Administrator fully capable of all admin/plugin operations.
5. Add or update a commerce/shop manager style role only if it fits existing role seed conventions.
6. Replace broad `manage_options` with granular capabilities where the existing plugin domain makes that appropriate.
7. Preserve public storefront access where genuinely public:
   - product browsing
   - public bundle/product views
   - public review listing if already intended
   - checkout flows protected by strong session tokens
8. Add owner/admin checks for customer-specific data.
9. Split internal/server-only functions from public functions if a public query/action cannot safely support both use cases.
10. Add tests or an audit script if the repo has a suitable test pattern. At minimum, add a static check that fails when a `requireCan(ctx, "...")` capability string is not present in `ALL_CAPABILITIES`.

## Suggested Validation

Run the relevant type checks/tests for the backend and admin app. Also run targeted searches such as:

```bash
rg 'requireCan\\(ctx, "commerce\\.' ConvexPress-Admin/packages/backend/convex
rg 'manage_options' ConvexPress-Admin/packages/backend/convex/commerce ConvexPress-Admin/packages/backend/convex/commerceBundles ConvexPress-Admin/packages/backend/convex/commerceDigital ConvexPress-Admin/packages/backend/convex/commerceReturns ConvexPress-Admin/packages/backend/convex/commerceReviews ConvexPress-Admin/packages/backend/convex/commerceSubscriptions ConvexPress-Admin/packages/backend/convex/commerceWishlists ConvexPress-Admin/packages/backend/convex/membership ConvexPress-Admin/packages/backend/convex/shipping
rg 'getCurrentUser|requireCan|requireAuth|getUserIdentity' ConvexPress-Admin/packages/backend/convex/commerceReturns ConvexPress-Admin/packages/backend/convex/commerceDigital ConvexPress-Admin/packages/backend/convex/commerceSubscriptions ConvexPress-Admin/packages/backend/convex/commerceWishlists
```

Also verify seeded/deployed role data includes the new capabilities and admin page access entries:

- `/admin/commerce`
- `/admin/membership`

## Desired Outcome

The final state should have:

- A complete capability taxonomy for commerce and membership plugins.
- Seeded and deployed roles that can actually access the new admin plugin pages.
- Admin APIs protected by granular capabilities instead of missing strings or overly broad `manage_options`.
- Customer/order data protected by owner/admin checks or secure bearer tokens.
- Shipping label/tracking actions protected at the public action boundary.
- A small automated guard against future missing capability strings.
