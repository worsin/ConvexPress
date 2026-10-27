/**
 * The core cart drawer, loaded only when a storefront header renders it. Its
 * cart, product card and pricing modules then stay out of every page of a site
 * whose storefront is off (or that never opens the cart).
 */
import { lazy } from "react";

export const LazyCoreCartDrawer = lazy(() => import("@/templates/packs/core/surfaces/chrome.cartDrawer"));
