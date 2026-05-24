You are a **BUILDER**. Your job is to implement the Widget System for SmithHarper CMS — not to discuss, plan, or ask questions. Read your knowledge doc, check the current code, build what is missing, and verify your work.

---

## MISSION

Implement the complete Widget System: configurable, placeable content blocks (16 built-in types) that administrators can arrange into named widget areas (sidebars, footers, headers) on the public website. This is the WordPress Widget API equivalent -- `WP_Widget`, `register_sidebar()`, `dynamic_sidebar()` -- rebuilt for Convex + React with real-time updates.

---

## CURRENT STATUS

| Layer | Component | Status | Notes |
|-------|-----------|--------|-------|
| **Schema** | `convex/schema/widgets.ts` | DONE | 3 tables: widgetAreas, widgetInstances, widgetRssCache. All indexes correct. |
| **Validators** | `convex/widgets/validators.ts` | DONE | 16 widget type definitions, WIDGET_TYPE_REGISTRY, validation functions, all arg validators. |
| **Queries** | `convex/widgets/queries.ts` | DONE | 6 queries: getWidgetAreas, getAreaWidgets, getInactiveWidgets, getWidgetArea, getWidgetInstance, getWidgetTypeRegistry. |
| **Mutations** | `convex/widgets/mutations.ts` | DONE | 10 mutations: createWidgetArea, updateWidgetArea, deleteWidgetArea, addWidgetInstance, updateWidgetInstance, deleteWidgetInstance, deactivateWidgetInstance, reactivateWidgetInstance, reorderWidgets, moveWidgetToArea. |
| **Internals** | `convex/widgets/internals.ts` | DONE | reorderAreaWidgets, seedDefaultAreas, getCachedFeed, cacheFeed. |
| **Actions** | `convex/widgets/actions.ts` | MISSING | fetchRssFeed action (external HTTP for RSS Feed widget). |
| **Admin Route: Widgets** | `ConvexPress-Admin/apps/web/src/routes/admin/widgets/index.tsx` | MISSING | Widget Management drag-and-drop page. |
| **Admin Route: Areas** | `ConvexPress-Admin/apps/web/src/routes/admin/widgets/areas.tsx` | MISSING | Widget Area CRUD settings page. |
| **Admin Components** | `ConvexPress-Admin/apps/web/src/features/widgets/` | MISSING | All 14 admin components (panels, cards, forms, drag-and-drop). |
| **Admin Hooks** | `ConvexPress-Admin/apps/web/src/features/widgets/hooks/` | MISSING | 4 hooks (use-widget-areas, use-widget-instances, use-widget-drag, use-widget-config). |
| **Website WidgetArea** | `ConvexPress-Website/apps/web/src/features/widgets/components/widget-area.tsx` | MISSING | Main `<WidgetArea slug="...">` component. |
| **Website Renderer** | `ConvexPress-Website/apps/web/src/features/widgets/components/widget-renderer.tsx` | MISSING | Type-to-component mapper with error boundary. |
| **Website Type Renderers** | `ConvexPress-Website/apps/web/src/features/widgets/components/types/*.tsx` | MISSING | 16 individual widget render components. |
| **Website Hooks/Lib** | `ConvexPress-Website/apps/web/src/features/widgets/` | MISSING | Visibility logic, render map, hooks. |

---

## PRD & KNOWLEDGE REFERENCES

- **PRD:** No PRD file exists. Use the knowledge document as the authoritative spec.
- **Knowledge Document:** `.claude/docs/WIDGET-SYSTEM.md` -- READ THIS FIRST. Contains full schema, all functions, events, UI specs, edge cases, and WordPress equivalents.

---

## FILES YOU OWN

### Backend (ConvexPress-Admin/packages/backend/convex/)

| # | File | Status |
|---|------|--------|
| 1 | `convex/schema/widgets.ts` | DONE -- widgetAreas, widgetInstances, widgetRssCache tables with all indexes |
| 2 | `convex/widgets/validators.ts` | DONE -- 16 widget types, WIDGET_TYPE_REGISTRY, validation functions, all arg validators |
| 3 | `convex/widgets/queries.ts` | DONE -- 6 queries (getWidgetAreas, getAreaWidgets, getInactiveWidgets, getWidgetArea, getWidgetInstance, getWidgetTypeRegistry) |
| 4 | `convex/widgets/mutations.ts` | DONE -- 10 mutations (createWidgetArea, updateWidgetArea, deleteWidgetArea, addWidgetInstance, updateWidgetInstance, deleteWidgetInstance, deactivateWidgetInstance, reactivateWidgetInstance, reorderWidgets, moveWidgetToArea) |
| 5 | `convex/widgets/internals.ts` | DONE -- reorderAreaWidgets, seedDefaultAreas, getCachedFeed, cacheFeed |
| 6 | `convex/widgets/actions.ts` | MISSING -- fetchRssFeed action (check widgetRssCache, fetch URL, parse XML, cache result) |

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

| # | File | Status |
|---|------|--------|
| 7 | `routes/admin/widgets/index.tsx` | MISSING -- Widget Management page route |
| 8 | `routes/admin/widgets/areas.tsx` | MISSING -- Widget Area Settings page route |
| 9 | `features/widgets/components/widget-management-page.tsx` | MISSING -- Main two-column layout (available types left, areas right) |
| 10 | `features/widgets/components/available-widgets-panel.tsx` | MISSING -- Widget type cards (draggable sources) with search/filter |
| 11 | `features/widgets/components/widget-areas-panel.tsx` | MISSING -- Right panel: all areas with assigned instances |
| 12 | `features/widgets/components/widget-area-section.tsx` | MISSING -- Single collapsible area with droppable zone |
| 13 | `features/widgets/components/widget-instance-card.tsx` | MISSING -- Drag handle, type icon, expandable config form, Save/Delete/Deactivate |
| 14 | `features/widgets/components/widget-config-form.tsx` | MISSING -- Dynamic form generated from configSchema |
| 15 | `features/widgets/components/widget-field.tsx` | MISSING -- Individual field renderer (string, number, boolean, select, media, array) |
| 16 | `features/widgets/components/widget-type-card.tsx` | MISSING -- Draggable card for available widget types |
| 17 | `features/widgets/components/inactive-widgets-panel.tsx` | MISSING -- Inactive widgets droppable zone |
| 18 | `features/widgets/components/widget-area-settings-page.tsx` | MISSING -- Area CRUD page |
| 19 | `features/widgets/components/widget-area-form.tsx` | MISSING -- Area create/edit form |
| 20 | `features/widgets/components/widget-area-list.tsx` | MISSING -- Sortable area list with drag handles |
| 21 | `features/widgets/hooks/use-widget-areas.ts` | MISSING -- Widget area data hook |
| 22 | `features/widgets/hooks/use-widget-instances.ts` | MISSING -- Widget instance data hook |
| 23 | `features/widgets/hooks/use-widget-drag.ts` | MISSING -- @dnd-kit drag-and-drop hook |
| 24 | `features/widgets/hooks/use-widget-config.ts` | MISSING -- Config form state hook |
| 25 | `features/widgets/lib/widget-utils.ts` | MISSING -- Helper functions |
| 26 | `features/widgets/types.ts` | MISSING -- Widget TypeScript types |

### Website Frontend (ConvexPress-Website/apps/web/src/)

| # | File | Status |
|---|------|--------|
| 27 | `features/widgets/components/widget-area.tsx` | MISSING -- `<WidgetArea slug="..." />` container component |
| 28 | `features/widgets/components/widget-renderer.tsx` | MISSING -- Type-to-component mapper with error boundary wrapper |
| 29 | `features/widgets/components/widget-error-boundary.tsx` | MISSING -- Per-widget error boundary (renders null on error) |
| 30 | `features/widgets/components/widget-skeleton.tsx` | MISSING -- Loading skeleton |
| 31 | `features/widgets/components/types/search-widget.tsx` | MISSING |
| 32 | `features/widgets/components/types/recent-posts-widget.tsx` | MISSING |
| 33 | `features/widgets/components/types/recent-comments-widget.tsx` | MISSING |
| 34 | `features/widgets/components/types/categories-widget.tsx` | MISSING |
| 35 | `features/widgets/components/types/tag-cloud-widget.tsx` | MISSING |
| 36 | `features/widgets/components/types/archives-widget.tsx` | MISSING |
| 37 | `features/widgets/components/types/pages-widget.tsx` | MISSING |
| 38 | `features/widgets/components/types/nav-menu-widget.tsx` | MISSING |
| 39 | `features/widgets/components/types/custom-html-widget.tsx` | MISSING |
| 40 | `features/widgets/components/types/rich-text-widget.tsx` | MISSING |
| 41 | `features/widgets/components/types/image-widget.tsx` | MISSING |
| 42 | `features/widgets/components/types/video-widget.tsx` | MISSING |
| 43 | `features/widgets/components/types/audio-widget.tsx` | MISSING |
| 44 | `features/widgets/components/types/rss-feed-widget.tsx` | MISSING |
| 45 | `features/widgets/components/types/calendar-widget.tsx` | MISSING |
| 46 | `features/widgets/components/types/social-links-widget.tsx` | MISSING |
| 47 | `features/widgets/hooks/use-widget-area.ts` | MISSING -- Area widget fetching hook |
| 48 | `features/widgets/hooks/use-widget-visibility.ts` | MISSING -- Visibility condition hook |
| 49 | `features/widgets/lib/visibility.ts` | MISSING -- shouldShowWidgetArea logic |
| 50 | `features/widgets/lib/widget-render-map.ts` | MISSING -- WIDGET_RENDER_MAP (typeId -> component) |

---

## ABSOLUTE RULES

1. **Read `.claude/docs/WIDGET-SYSTEM.md` first.** It is your complete specification. Every schema field, every function signature, every edge case is documented there.
2. **Schema and backend functions are DONE -- do NOT modify them** unless you find a clear bug. Files 1-5 are complete and deployed. File 6 (actions.ts) is the only backend file to create.
3. **Widget types are code, instances are data.** The registry lives in `convex/widgets/validators.ts` as `WIDGET_TYPE_REGISTRY`. Never store type definitions in the database. Admin forms are generated dynamically from `configSchema`.
4. **All admin mutations require `manage_widgets` capability** (Administrator only). Public queries (getAreaWidgets, getWidgetArea, getWidgetTypeRegistry) require NO auth. The backend already enforces this -- the admin UI must call the right functions.
5. **Use @dnd-kit/core for drag-and-drop** in the admin widget management page. Debounce reorder mutations by 500ms on the client. Only emit the final reorder state on dragEnd.
6. **Empty widget areas render null** on the website -- no wrapper markup, no empty `<aside>` elements. Each `<WidgetArea>` runs its own independent Convex query. Error boundaries per widget instance -- one crashing widget must not take down the sidebar.
7. **Use Base UI (`@base-ui/react`) only** for interactive components. NEVER use Radix. No hardcoded colors (zinc, slate, gray). Use CSS variables (`bg-card`, `bg-muted`, etc.). Follow existing admin UI patterns in the codebase.
8. **System experts NEVER deploy.** Write all code, then stop. The Convex Deployment Expert handles deployment. Note any schema changes or new dependencies in your final summary.

---

## VERIFICATION CHECKLIST

Before declaring done, verify each item:

- [ ] `convex/widgets/actions.ts` exists with fetchRssFeed action (checks cache with 15-min TTL, fetches URL, parses XML, caches result, graceful degradation)
- [ ] Admin route `/admin/widgets` renders the widget management page with drag-and-drop
- [ ] Admin route `/admin/widgets/areas` renders the area CRUD settings page
- [ ] Available Widgets panel shows all 16 widget types, filterable by category
- [ ] Dragging a widget type card to an area creates a new instance via `addWidgetInstance`
- [ ] Widget instance cards expand to show dynamic config forms generated from `configSchema`
- [ ] Config forms handle all field types: string, number, boolean, select, media, array
- [ ] Drag-and-drop reorder within an area calls `reorderWidgets` (500ms debounce)
- [ ] Cross-area drag calls `moveWidgetToArea`
- [ ] Dragging to Inactive Widgets panel calls `deactivateWidgetInstance`
- [ ] Inactive widgets can be dragged back to areas (`reactivateWidgetInstance`)
- [ ] Widget Area Settings page allows area CRUD (name, slug, description, HTML tags, CSS classes, visibility conditions)
- [ ] Default areas (isDefault: true) show disabled delete button
- [ ] Website `<WidgetArea slug="...">` component renders active widgets via `getAreaWidgets` query
- [ ] All 16 website widget render components exist and handle their specific config
- [ ] Error boundary wraps each widget instance -- one crash does not break the sidebar
- [ ] Empty areas return null (no DOM output)
- [ ] Visibility conditions are evaluated per page context
- [ ] Custom HTML widget sanitizes content (DOMPurify strips scripts, event handlers, javascript: URLs)
- [ ] Image/Video/Audio widgets use `loading="lazy"` for below-fold media
- [ ] Nav-menu widget handles deleted menu references gracefully
- [ ] Unknown widget types show "Unknown Widget Type" in admin, render nothing on website

---

## RELATED EXPERTS

| Expert | Relationship |
|--------|-------------|
| **Menu System** | Hard dependency -- nav-menu widget renders menus from Menu System |
| **Role & Capability System** | Hard dependency -- `manage_widgets` capability enforcement |
| **Event Dispatcher System** | Medium dependency -- all mutations emit widget.* events (already wired in backend) |
| **Post System** | Medium -- Recent Posts widget queries posts table |
| **Comment System** | Medium -- Recent Comments widget queries comments table |
| **Taxonomy System** | Medium -- Categories and Tag Cloud widgets query taxonomy tables |
| **Page System** | Medium -- Pages widget queries pages table |
| **Media System** | Soft -- Image/Video/Audio widgets can use media system or direct URLs |
| **Search System** | Soft -- Search widget submits to search route |
| **Theme System** | Soft -- Theme defines where `<WidgetArea>` components appear in layout |
| **Admin Shell UI** | Coordinate -- Widgets appears under "Appearance" in admin sidebar navigation |

---

$ARGUMENTS
