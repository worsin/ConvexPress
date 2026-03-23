/**
 * Admin Shell layout constants.
 * Centralized dimensions, localStorage keys, and z-index values.
 */

// ─── Layout Dimensions ──────────────────────────────────────────────────────

/** Sidebar expanded width in pixels */
export const SIDEBAR_EXPANDED_WIDTH = 240;

/** Sidebar collapsed (icon-only) width in pixels */
export const SIDEBAR_COLLAPSED_WIDTH = 64;

/** Admin bar height in pixels */
export const ADMIN_BAR_HEIGHT = 48;

/** Admin footer height in pixels */
export const ADMIN_FOOTER_HEIGHT = 40;

/** Sidebar collapse/expand transition duration in ms */
export const SIDEBAR_TRANSITION_MS = 300;

// ─── Responsive Breakpoints ─────────────────────────────────────────────────

/** Below this breakpoint, sidebar becomes an overlay */
export const MOBILE_BREAKPOINT = 768;

/** Below this breakpoint, sidebar auto-collapses to icons */
export const TABLET_BREAKPOINT = 1024;

// ─── localStorage Keys ──────────────────────────────────────────────────────

/** Key for persisting sidebar collapsed state */
export const LS_KEY_SIDEBAR_COLLAPSED = "admin-sidebar-collapsed";

/** Prefix for screen options per route */
export const LS_KEY_SCREEN_OPTIONS_PREFIX = "screen-options:";

// ─── Z-Index Stack ──────────────────────────────────────────────────────────

/** Sidebar z-index */
export const Z_SIDEBAR = 30;

/** Admin bar z-index */
export const Z_ADMIN_BAR = 40;

/** Mobile overlay z-index (backdrop + panel) */
export const Z_MOBILE_OVERLAY = 50;

/** Dropdown menus z-index */
export const Z_DROPDOWN = 50;

/** Skip-to-content link z-index */
export const Z_SKIP_LINK = 100;
