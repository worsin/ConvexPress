# ConvexPress Admin Route Inventory

**Generated:** 2026-05-12
**Source:** `apps/web/src/routeTree.gen.ts` (authoritative)
**Total routes:** 195

## Criticality definitions

- **P0** — Auth flows, root dashboard, revenue-critical pages (orders, payments, checkout). Outage = nobody can use the app.
- **P1** — Core CRUD lists/details (posts, pages, products, users, comments, media, customers). Outage = primary workflow broken.
- **P2** — Settings, tools, integrations, analytics, edge utilities. Outage = friction but workable.

## Summary

| Criticality | Count |
|-------------|-------|
| P0          | 8 |
| P1          | 70 |
| P2          | 117 |
| **Total**   | **195** |

## P0 — Critical paths

| Route | Auth Required |
|-------|---------------|
| `/` | N |
| `/commerce` | Y |
| `/commerce/customers` | Y |
| `/commerce/orders` | Y |
| `/commerce/orders/abandoned` | Y |
| `/commerce/payments` | Y |
| `/commerce/products` | Y |
| `/dashboard` | Y |

## P1 — Core CRUD

| Route | Auth Required |
|-------|---------------|
| `/comments` | Y |
| `/comments/$commentId/edit` | Y |
| `/comments/pending` | Y |
| `/commerce/attributes` | Y |
| `/commerce/attributes/$attributeId` | Y |
| `/commerce/bundles` | Y |
| `/commerce/categories` | Y |
| `/commerce/customers/$userId/store-credit` | Y |
| `/commerce/digital` | Y |
| `/commerce/discounts` | Y |
| `/commerce/orders/$orderId` | Y |
| `/commerce/products/$productId` | Y |
| `/commerce/products/new` | Y |
| `/commerce/returns` | Y |
| `/commerce/returns/$returnId` | Y |
| `/commerce/returns/reasons` | Y |
| `/commerce/reviews` | Y |
| `/commerce/subscriptions/contracts` | Y |
| `/commerce/subscriptions/contracts/$contractId` | Y |
| `/commerce/subscriptions/coupons` | Y |
| `/commerce/subscriptions/coupons/$couponId/edit` | Y |
| `/commerce/subscriptions/coupons/new` | Y |
| `/commerce/subscriptions/dunning` | Y |
| `/commerce/subscriptions/form-submissions` | Y |
| `/commerce/subscriptions/form-submissions/$submissionId` | Y |
| `/commerce/subscriptions/invoices` | Y |
| `/commerce/subscriptions/invoices/$invoiceId` | Y |
| `/commerce/subscriptions/offers` | Y |
| `/commerce/subscriptions/offers/$offerId/edit` | Y |
| `/commerce/subscriptions/offers/new` | Y |
| `/commerce/subscriptions/order-forms` | Y |
| `/commerce/subscriptions/order-forms/$formId` | Y |
| `/commerce/subscriptions/order-forms/new` | Y |
| `/commerce/subscriptions/pricing-cards` | Y |
| `/commerce/subscriptions/templates` | Y |
| `/commerce/subscriptions/templates/$templateId/edit` | Y |
| `/commerce/subscriptions/templates/new` | Y |
| `/commerce/wishlists` | Y |
| `/gallery` | Y |
| `/kb` | Y |
| `/layouts` | Y |
| `/media` | Y |
| `/media/$mediaId/edit` | Y |
| `/media/upload` | Y |
| `/membership` | Y |
| `/menus` | Y |
| `/pages` | Y |
| `/pages/$pageId` | Y |
| `/pages/$pageId/edit` | Y |
| `/pages/$pageId/engagement` | Y |
| `/pages/$pageId/revisions` | Y |
| `/pages/$pageId/seo` | Y |
| `/pages/$pageId/traffic` | Y |
| `/pages/new` | Y |
| `/posts` | Y |
| `/posts/$postId` | Y |
| `/posts/$postId/edit` | Y |
| `/posts/$postId/engagement` | Y |
| `/posts/$postId/revisions` | Y |
| `/posts/$postId/seo` | Y |
| `/posts/$postId/traffic` | Y |
| `/posts/categories` | Y |
| `/posts/new` | Y |
| `/posts/tags` | Y |
| `/recipes` | Y |
| `/seo` | Y |
| `/tickets` | Y |
| `/users` | Y |
| `/users/$userId/edit` | Y |
| `/users/new` | Y |

## P2 — Settings / Tools / Edge

| Route | Auth Required |
|-------|---------------|
| `/api-keys` | Y |
| `/appearance` | Y |
| `/appearance/colors` | Y |
| `/appearance/footer` | Y |
| `/appearance/header` | Y |
| `/appearance/themes` | Y |
| `/commerce/returns/settings` | Y |
| `/commerce/settings` | Y |
| `/commerce/settings/shipping` | Y |
| `/commerce/settings/shipping/classes` | Y |
| `/commerce/settings/shipping/locations` | Y |
| `/commerce/settings/shipping/packages` | Y |
| `/commerce/settings/shipping/rules` | Y |
| `/commerce/settings/shipping/test-rates` | Y |
| `/commerce/settings/shipping/zones` | Y |
| `/commerce/settings/shipping/zones/$zoneId` | Y |
| `/commerce/settings/shipping/zones/$zoneId/methods/$methodType/$methodId` | Y |
| `/commerce/settings/tax` | Y |
| `/commerce/settings/tax/classes` | Y |
| `/commerce/shipping/manifests` | Y |
| `/commerce/shipping/tracking` | Y |
| `/commerce/subscriptions` | Y |
| `/custom-fields` | Y |
| `/custom-fields/$groupId/edit` | Y |
| `/custom-fields/new` | Y |
| `/gallery/$albumId/edit` | Y |
| `/gallery/categories` | Y |
| `/gallery/new` | Y |
| `/gallery/settings` | Y |
| `/kb/$articleId` | Y |
| `/kb/$articleId/edit` | Y |
| `/kb/analytics` | Y |
| `/kb/categories` | Y |
| `/kb/collections` | Y |
| `/kb/new` | Y |
| `/kb/settings` | Y |
| `/kb/tags` | Y |
| `/kb/templates` | Y |
| `/kb/workflows` | Y |
| `/layouts/$layoutId` | Y |
| `/layouts/assign` | Y |
| `/layouts/new` | Y |
| `/membership/grants` | Y |
| `/membership/grants/$grantId` | Y |
| `/membership/grants/new` | Y |
| `/membership/plans` | Y |
| `/membership/plans/$planId/edit` | Y |
| `/membership/restrictions` | Y |
| `/membership/restrictions/$ruleId/edit` | Y |
| `/membership/restrictions/new` | Y |
| `/membership/settings` | Y |
| `/menus/$menuId/edit` | Y |
| `/menus/locations` | Y |
| `/plugins` | Y |
| `/profile` | Y |
| `/recipes/$recipeId/edit` | Y |
| `/recipes/categories` | Y |
| `/recipes/new` | Y |
| `/roles` | Y |
| `/roles/$roleId/edit` | Y |
| `/roles/new` | Y |
| `/seo/settings` | Y |
| `/seo/sitemap` | Y |
| `/settings` | Y |
| `/settings/ai` | Y |
| `/settings/analytics` | Y |
| `/settings/analytics/ga4` | Y |
| `/settings/discussion` | Y |
| `/settings/email` | Y |
| `/settings/email/queue/$queueId` | Y |
| `/settings/email/templates/$templateSlug` | Y |
| `/settings/general` | Y |
| `/settings/integrations` | Y |
| `/settings/integrations/clerk` | Y |
| `/settings/integrations/google` | Y |
| `/settings/integrations/paypal` | Y |
| `/settings/integrations/shipping` | Y |
| `/settings/integrations/shipping/dhl` | Y |
| `/settings/integrations/shipping/fedex` | Y |
| `/settings/integrations/shipping/shipstation` | Y |
| `/settings/integrations/shipping/ups` | Y |
| `/settings/integrations/shipping/usps` | Y |
| `/settings/integrations/stripe` | Y |
| `/settings/media` | Y |
| `/settings/notifications` | Y |
| `/settings/permalinks` | Y |
| `/settings/privacy` | Y |
| `/settings/reading` | Y |
| `/settings/search` | Y |
| `/settings/tools` | Y |
| `/settings/writing` | Y |
| `/support/analytics` | Y |
| `/support/settings` | Y |
| `/tickets/$ticketId` | Y |
| `/tickets/analytics` | Y |
| `/tickets/canned-responses` | Y |
| `/tickets/settings` | Y |
| `/tools` | Y |
| `/tools/404-log` | Y |
| `/tools/activity` | Y |
| `/tools/audit-log` | Y |
| `/tools/audit-log/$entryId` | Y |
| `/tools/capabilities` | Y |
| `/tools/email-notifications` | Y |
| `/tools/events` | Y |
| `/tools/redirects` | Y |
| `/tools/redirects/$redirectId/edit` | Y |
| `/tools/redirects/new` | Y |
| `/tools/roles` | Y |
| `/tools/routes` | Y |
| `/tools/site-notifications` | Y |
| `/tools/website-import` | Y |
| `/tools/website-import/$siteId` | Y |
| `/tools/wordpress-sync` | Y |
| `/tools/wordpress-sync/$siteId` | Y |
| `/updates` | Y |
| `/webhooks` | Y |