# Admin List Table UI - Expert Knowledge Document

**System:** Admin List Table UI
**Status:** Implementation Ready
**Priority:** P0 - Critical
**WordPress Equivalent:** `WP_List_Table` class, `edit.php`, `upload.php`, `edit-comments.php`, `users.php` - the reusable list table pattern across all WordPress admin listing screens
**Last Analyzed:** 2026-02-09

---

## Quick Reference

### What This System Does

The Admin List Table UI system provides the shared, reusable WordPress-style list table pattern used across 13+ admin pages in ConvexPress. It is a **UI-only** system -- it defines the generic table shell, column rendering, filtering, sorting, pagination, bulk selection, inline row actions, Quick Edit row expansion, and loading skeletons. Each entity page (Posts, Pages, Comments, Users, etc.) composes these shared components and supplies its own column definitions, data queries, and entity-specific actions.

This is the visual backbone of the admin backend. Every content listing screen uses this pattern.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Column Definition** | Declarative config describing each column: key, label, sortable, width, renderer, visibility |
| **Status Tabs** | Horizontal tab strip (All \| Published \| Draft \| Trash) with live count badges from Convex |
| **Bulk Selection** | Header checkbox selects all visible rows; individual checkboxes per row. Selection state held in React state. |
| **Bulk Actions** | Dropdown + "Apply" button. Actions: Trash, Delete Permanently, Edit (bulk edit panel), Publish, etc. |
| **Row Actions** | Inline links shown on row hover: Edit, Quick Edit, Trash, View. Positioned beneath the title column. |
| **Quick Edit** | Inline row expansion (NOT a modal). Replaces the row with an editable form. Only one row can be in Quick Edit mode at a time. |
| **URL-Driven State** | All filter, sort, pagination, and search state lives in TanStack Router URL search params. Enables shareable links and browser back/forward. |
| **Screen Options** | Collapsible panel at top of page for toggling column visibility and setting items per page. |
| **Empty State** | Friendly message when no items match current filters. Entity-specific (e.g., "No posts found.") |
| **Loading Skeleton** | Column-aware skeleton that matches the table layout while data loads. |
| **Confirmation Dialog** | The ONLY allowed popup. Used for destructive actions (Delete Permanently, Empty Trash). |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Implementation** | PHP `WP_List_Table` class | React composable components + hooks |
| **Data Fetching** | Server-rendered HTML | Convex reactive queries (real-time) |
| **State Management** | PHP `$_GET` query params | TanStack Router URL search params |
| **Sorting** | Server-side SQL ORDER BY | Convex index-based sorting |
| **Pagination** | Server-side LIMIT/OFFSET | Convex cursor-based pagination |
| **Bulk Actions** | Form POST with nonce | Convex mutations with optimistic updates |
| **Quick Edit** | AJAX inline form | React inline form with controlled state |
| **Real-Time** | No (page refresh) | Yes (Convex subscriptions update counts & rows live) |
| **Row Actions** | PHP-rendered links | React components with capability-gated visibility |
| **Column Visibility** | Screen Options (cookie-persisted) | Screen Options (localStorage-persisted) |
| **Search** | SQL LIKE query | Convex search index with debounced input (300ms) |

---

## Architecture Overview

### Data Flow

```
URL Search Params (source of truth)
  -> useListTable hook (parses params into filter/sort/page state)
  -> Convex useQuery(api.{entity}.list, filters)  -- real-time subscription
  -> Convex useQuery(api.{entity}.counts)           -- real-time subscription
  -> ListTable component renders rows
  -> User interaction (click sort, change tab, type search, paginate)
  -> TanStack Router navigate() updates URL search params
  -> Cycle repeats (reactive)
```

### Real-Time Behavior

- **Status counts:** `useQuery(api.{entity}.counts)` updates in real-time. When another admin trashes a post, the Trash count badge increments across all connected sessions.
- **Table rows:** `useQuery(api.{entity}.list, filters)` is reactive. New items appear, deleted items disappear, and status changes update in real-time.
- **Bulk selection:** Selection state is local React state. When a selected item is deleted by another user, the row disappears and the selection count adjusts.
- **Pagination total:** Total count updates reactively. If another user adds items, the total pages may change and the pagination adjusts.

### Component Hierarchy

```
<ListTablePage>                    // Entity-specific route component
  <PageHeader>                     // "All Posts" + "Add New" button
  <ScreenOptions>                  // Collapsible: column visibility + per-page
  <StatusTabs>                     // All | Published | Draft | Trash (with counts)
  <ListTableToolbar>               // BulkActions + FilterBar + SearchBox
    <BulkActions>                  // Select action + Apply
    <FilterBar>                    // Entity-specific dropdowns (date, category, etc.)
    <SearchBox>                    // Debounced search input
  <ListTable>                      // The table itself
    <ListTableHeader>              // Column headers with sort indicators
      <Checkbox>                   // Select-all checkbox
      <SortableColumnHeader>       // Per-column sort toggle
    <ListTableBody>                // Row container
      <ListTableRow>               // Individual row (or QuickEditRow)
        <Checkbox>                 // Row selection checkbox
        <Cell>                     // Per-column cell rendering
        <InlineActions>            // Edit | Quick Edit | Trash | View (on hover)
      <QuickEditRow>               // Inline edit form (replaces row when active)
    <EmptyState>                   // Shown when no results
  <Pagination>                     // Page nav + per-page selector
  <ConfirmDialog>                  // Delete confirmation (the ONLY allowed dialog)
```

### Component Responsibility Split

The system uses a **composition pattern** -- not deep inheritance:

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Shared components** | Generic table structure, selection, pagination, sorting | `<ListTable>`, `<Pagination>`, `<StatusTabs>` |
| **Entity components** | Column definitions, row rendering, entity-specific filters, Quick Edit form fields | `<PostListTable>`, `<PostQuickEdit>`, `<PostFilterBar>` |
| **Hooks** | URL state parsing, bulk selection logic, debounced search | `useListTable`, `useBulkSelection` |
| **Types** | Generic type parameters for column defs, filter state, row data | `ColumnDef<T>`, `ListTableConfig<T>` |

---

## TypeScript Types

### Core Types

```typescript
// ConvexPress-Admin/apps/web/src/types/list-table.ts

import type { Id } from "@backend/convex/_generated/dataModel";

// --- Column Definition ---

export type SortDirection = "asc" | "desc";

export interface ColumnDef<TRow> {
  /** Unique key for this column. Used in URL params and localStorage. */
  key: string;
  /** Display label in the column header. */
  label: string;
  /** Whether this column supports sorting. */
  sortable?: boolean;
  /** Default sort direction when first clicked. Default: "asc". */
  defaultSortDir?: SortDirection;
  /** Whether this column is visible by default. Default: true. */
  defaultVisible?: boolean;
  /** Whether this column can be hidden via Screen Options. Default: true. */
  hideable?: boolean;
  /** Tailwind width class (e.g., "w-[40%]", "w-32", "min-w-48"). */
  width?: string;
  /** Column header alignment. Default: "left". */
  align?: "left" | "center" | "right";
  /** Render function for cell content. */
  render: (row: TRow, index: number) => React.ReactNode;
  /** Optional render for the column header (overrides default label). */
  renderHeader?: () => React.ReactNode;
}

// --- Filter & Sort State ---

export interface ListTableSortState {
  /** Column key to sort by. */
  orderBy: string;
  /** Sort direction. */
  orderDir: SortDirection;
}

export interface ListTablePaginationState {
  /** Current page (1-based). */
  page: number;
  /** Items per page. */
  perPage: number;
}

export interface ListTableSearchState {
  /** Current search query (debounced). */
  search: string;
}

/** Combined URL search params state for any list table. */
export interface ListTableSearchParams {
  /** Active status tab filter (entity-specific). */
  status?: string;
  /** Search query. */
  search?: string;
  /** Sort column key. */
  orderBy?: string;
  /** Sort direction. */
  orderDir?: SortDirection;
  /** Current page (1-based). */
  page?: number;
  /** Items per page. */
  perPage?: number;
  /** Entity-specific extra filters (e.g., authorId, categoryId, dateRange). */
  [key: string]: string | number | undefined;
}

// --- Status Tab ---

export interface StatusTab {
  /** Unique key matching a status value (e.g., "publish", "draft", "trash"). */
  key: string;
  /** Display label (e.g., "Published", "Drafts", "Trash"). */
  label: string;
  /** Live count from Convex query. undefined = still loading. */
  count?: number;
}

// --- Bulk Action ---

export interface BulkAction {
  /** Unique key (e.g., "trash", "delete", "publish"). */
  key: string;
  /** Display label (e.g., "Move to Trash", "Delete Permanently"). */
  label: string;
  /** Whether this action requires a confirmation dialog. */
  requiresConfirmation?: boolean;
  /** Confirmation dialog message. */
  confirmMessage?: string;
  /** Whether this action is destructive (affects styling). */
  destructive?: boolean;
  /** Required capability to see this action. Checked against current user role. */
  capability?: string;
  /** Only show this action when a specific status tab is active. */
  visibleOnStatus?: string[];
}

// --- Row Action ---

export interface RowAction<TRow> {
  /** Unique key (e.g., "edit", "quick-edit", "trash", "view"). */
  key: string;
  /** Display label. */
  label: string;
  /** Action type: "link" navigates, "button" calls a handler. */
  type: "link" | "button";
  /** For "link" type: generates the href from the row data. */
  href?: (row: TRow) => string;
  /** For "button" type: click handler. */
  onClick?: (row: TRow) => void;
  /** Whether this action is destructive (red text). */
  destructive?: boolean;
  /** Required capability. */
  capability?: string;
  /** Condition to show this action (e.g., only show "Restore" for trashed items). */
  visible?: (row: TRow) => boolean;
  /** Separator before this action (visual pipe character). */
  separator?: boolean;
}

// --- List Table Config ---

export interface ListTableConfig<TRow> {
  /** Entity name for display (e.g., "post", "page", "user"). */
  entityName: string;
  /** Plural entity name (e.g., "posts", "pages", "users"). */
  entityNamePlural: string;
  /** localStorage key prefix for screen options persistence. */
  storageKey: string;
  /** Column definitions. */
  columns: ColumnDef<TRow>[];
  /** Status tabs. */
  statusTabs: StatusTab[];
  /** Available bulk actions. */
  bulkActions: BulkAction[];
  /** Row-level actions (shown on hover). */
  rowActions: RowAction<TRow>[];
  /** Default sort state. */
  defaultSort: ListTableSortState;
  /** Default items per page. */
  defaultPerPage: number;
  /** Items per page options for the dropdown. */
  perPageOptions: number[];
  /** Row key extractor (returns unique ID). */
  getRowId: (row: TRow) => string;
  /** Optional: Primary column key (the column that shows row actions on hover). Default: first column. */
  primaryColumn?: string;
  /** Optional: Whether to show the checkbox column. Default: true. */
  showCheckboxes?: boolean;
  /** Optional: Empty state content per status tab. */
  emptyStates?: Record<string, { title: string; description: string; action?: React.ReactNode }>;
}

// --- Paginated Result (matches Convex query return shape) ---

export interface PaginatedResult<TRow> {
  items: TRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// --- Screen Options ---

export interface ScreenOptionsState {
  /** Map of column key -> visibility boolean. */
  visibleColumns: Record<string, boolean>;
  /** Items per page setting. */
  perPage: number;
}
```

---

## Component Inventory

### Shared Components

All shared components live in `ConvexPress-Admin/apps/web/src/components/shared/`.

---

#### `ListTable`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/ListTable.tsx`

**Purpose:** The core table component. Renders a `<table>` with header row and body rows. Handles column visibility, sort state, and delegates cell rendering to column definitions.

**Props:**
```typescript
interface ListTableProps<TRow> {
  /** Column definitions (already filtered by visibility). */
  columns: ColumnDef<TRow>[];
  /** Row data from Convex query. */
  rows: TRow[];
  /** Current sort state. */
  sort: ListTableSortState;
  /** Sort change handler. */
  onSortChange: (sort: ListTableSortState) => void;
  /** Row key extractor. */
  getRowId: (row: TRow) => string;
  /** Bulk selection state. */
  selection: BulkSelectionState;
  /** Selection handlers. */
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  /** Row actions. */
  rowActions: RowAction<TRow>[];
  /** Primary column key (where row actions render). */
  primaryColumn: string;
  /** Whether checkboxes are shown. */
  showCheckboxes: boolean;
  /** Whether table is loading (show skeleton). */
  isLoading: boolean;
  /** Number of skeleton rows to show while loading. */
  skeletonRows?: number;
  /** Active Quick Edit row ID (only one at a time). */
  quickEditId?: string | null;
  /** Quick Edit form component. */
  quickEditRender?: (row: TRow, onClose: () => void) => React.ReactNode;
  /** Empty state content. */
  emptyState?: React.ReactNode;
}
```

**Base UI Dependencies:** None directly (uses native `<table>` elements). Relies on `Checkbox` from UI library.

**Styling:**
- Table uses `w-full border-collapse` layout
- Header row: `bg-muted/50 border-b border-border`
- Body rows: `border-b border-border hover:bg-muted/30 transition-colors`
- Selected rows: `bg-primary/5`
- Striped rows: Not used (WordPress doesn't use striping in modern admin)

---

#### `StatusTabs`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/StatusTabs.tsx`

**Purpose:** Horizontal tab strip for status filtering. Displays clickable status labels with count badges. The active tab is bold/underlined. Clicking a tab updates the URL search params.

**Props:**
```typescript
interface StatusTabsProps {
  /** Tab definitions with counts. */
  tabs: StatusTab[];
  /** Currently active tab key. Empty string or undefined = "all". */
  activeTab?: string;
  /** Tab change handler (updates URL params). */
  onTabChange: (tabKey: string) => void;
}
```

**Rendering:**
```
All (42) | Published (28) | Drafts (10) | Pending (2) | Trash (1)
```

**Styling:**
- Active tab: `text-foreground font-semibold` (not underlined -- WordPress uses bold)
- Inactive tab: `text-muted-foreground hover:text-foreground`
- Count: `text-muted-foreground` in parentheses after label
- Separator: `text-muted-foreground/50` pipe character between tabs
- Count of 0: Tab still shown (except "Mine" tab which hides at 0)

**Base UI Dependencies:** None (plain `<button>` elements styled with Tailwind).

---

#### `BulkActions`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/BulkActions.tsx`

**Purpose:** Dropdown select + "Apply" button for performing actions on selected rows. Disabled when no rows are selected. Shows confirmation dialog for destructive actions.

**Props:**
```typescript
interface BulkActionsProps {
  /** Available bulk actions. */
  actions: BulkAction[];
  /** Number of selected items. */
  selectedCount: number;
  /** Handler called with the action key when Apply is clicked. */
  onApply: (actionKey: string) => void;
  /** Whether a bulk action is currently executing. */
  isExecuting?: boolean;
  /** Current user capabilities (to filter visible actions). */
  userCapabilities?: string[];
}
```

**Rendering:**
```
[Bulk Actions v] [Apply]
```

**Behavior:**
- Dropdown defaults to "Bulk Actions" placeholder
- "Apply" button disabled when: no action selected OR no rows selected OR action is executing
- Destructive actions show a `ConfirmDialog` before executing
- After successful execution: clear selection, show success toast via Sonner
- Dropdown resets to placeholder after Apply

**Base UI Dependencies:** Uses `Select` from `@base-ui/react/select` for the dropdown.

---

#### `SearchBox`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/SearchBox.tsx`

**Purpose:** Search input with debounced value. Updates URL search params after 300ms of no typing.

**Props:**
```typescript
interface SearchBoxProps {
  /** Current search value (from URL params). */
  value: string;
  /** Search change handler (updates URL params). */
  onChange: (value: string) => void;
  /** Placeholder text. Default: "Search {entityName}...". */
  placeholder?: string;
}
```

**Rendering:**
```
Search [________________] [Search Posts]
```

**Behavior:**
- WordPress-style: text label "Search", text input, submit button labeled "Search {Entity}"
- Debounce: 300ms after typing stops
- On submit (Enter or button click): immediately apply (bypass debounce)
- Clearing the input removes the `search` param from URL
- Shows clear (X) button inside input when value is non-empty
- Resets pagination to page 1 when search changes

**Base UI Dependencies:** Uses `Input` from `@base-ui/react/input` (already in project).

---

#### `Pagination`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/Pagination.tsx`

**Purpose:** WordPress-style pagination with total count, page navigation, and per-page selector.

**Props:**
```typescript
interface PaginationProps {
  /** Total number of items across all pages. */
  total: number;
  /** Current page (1-based). */
  page: number;
  /** Items per page. */
  perPage: number;
  /** Total pages. */
  totalPages: number;
  /** Page change handler. */
  onPageChange: (page: number) => void;
  /** Per-page change handler. */
  onPerPageChange: (perPage: number) => void;
  /** Per-page options. */
  perPageOptions: number[];
  /** Entity name plural for display. */
  entityNamePlural: string;
}
```

**Rendering:**
```
42 items | [<] [<] Page [1] of 3 [>] [>] | [20 v] items per page
```

**Behavior:**
- Shows total item count on the left
- First/Previous/Next/Last page buttons with disabled state at boundaries
- Current page input (editable -- user can type a page number and press Enter)
- "of X" total pages label
- Per-page selector dropdown on the right
- Changing per-page resets to page 1
- Hidden entirely when total is 0

**Styling:**
- `text-xs text-muted-foreground`
- Navigation buttons: icon buttons (`ChevronLeft`, `ChevronRight`, `ChevronsLeft`, `ChevronsRight`)
- Disabled buttons: `opacity-50 pointer-events-none`

**Base UI Dependencies:** Uses `Select` from `@base-ui/react/select` for per-page dropdown.

---

#### `InlineActions`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/InlineActions.tsx`

**Purpose:** Row-level action links shown on hover beneath the primary column. Mimics WordPress's inline row actions.

**Props:**
```typescript
interface InlineActionsProps<TRow> {
  /** Row data. */
  row: TRow;
  /** Action definitions. */
  actions: RowAction<TRow>[];
  /** Current user capabilities. */
  userCapabilities?: string[];
}
```

**Rendering:**
```
Edit | Quick Edit | Trash | View
```

**Behavior:**
- Shown on row hover (`opacity-0 group-hover/row:opacity-100 transition-opacity`)
- Actions separated by `|` pipe character
- Link actions render as `<Link>` from TanStack Router
- Button actions render as `<button>` with click handler
- Destructive actions styled with `text-destructive hover:text-destructive/80`
- Actions filtered by `capability` and `visible()` condition
- "Quick Edit" toggles the inline Quick Edit row

**Base UI Dependencies:** None (plain links and buttons).

---

#### `EmptyState`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/EmptyState.tsx`

**Purpose:** Friendly empty state shown when the table has no data for the current filters.

**Props:**
```typescript
interface EmptyStateProps {
  /** Heading text (e.g., "No posts found."). */
  title: string;
  /** Descriptive text (e.g., "Try adjusting your search or filters."). */
  description?: string;
  /** Optional action button (e.g., "Add New Post" link). */
  action?: React.ReactNode;
  /** Optional icon. Default: search icon for filtered results, document icon for empty collection. */
  icon?: React.ReactNode;
}
```

**Rendering:**
```
   [Icon]
   No posts found.
   Try adjusting your search or filters.
   [Add New Post]
```

**Styling:**
- Centered vertically and horizontally within the table body
- `text-muted-foreground` for all text
- Icon: `size-12 text-muted-foreground/50`
- Spans the full column width via `colspan`

**Base UI Dependencies:** None.

---

#### `TableSkeleton`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/TableSkeleton.tsx`

**Purpose:** Loading skeleton that matches the table column layout. Shows while Convex queries are loading (data === undefined).

**Props:**
```typescript
interface TableSkeletonProps {
  /** Number of columns (including checkbox). */
  columnCount: number;
  /** Number of skeleton rows. Default: 5. */
  rowCount?: number;
  /** Column widths to match (for realistic skeleton proportions). */
  columnWidths?: string[];
  /** Whether to show checkbox column skeleton. */
  showCheckboxes?: boolean;
}
```

**Rendering:**
- Uses the existing `Skeleton` component from `ConvexPress-Admin/apps/web/src/components/ui/skeleton.tsx`
- Each skeleton row matches the height of a real table row
- Checkbox column shows a small square skeleton
- Other columns show rectangles of varying widths (60-90% of cell width)

**Base UI Dependencies:** Uses `Skeleton` component already in the project.

---

#### `ScreenOptions`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/ScreenOptions.tsx`

**Purpose:** Collapsible panel at the top of the page for configuring column visibility and items per page. Mirrors WordPress's Screen Options tab.

**Props:**
```typescript
interface ScreenOptionsProps {
  /** All column definitions (even hidden ones). */
  columns: ColumnDef<any>[];
  /** Current screen options state. */
  state: ScreenOptionsState;
  /** State change handler. */
  onChange: (state: ScreenOptionsState) => void;
  /** Per-page options for the dropdown. */
  perPageOptions: number[];
  /** Entity name for labeling. */
  entityName: string;
}
```

**Rendering:**
```
[Screen Options v]
+-------------------------------------------------------+
| Columns:                                               |
| [x] Author  [x] Categories  [x] Tags  [ ] Comments   |
|                                                        |
| Pagination:                                            |
| Number of items per page: [20]                         |
|                                    [Apply]             |
+-------------------------------------------------------+
```

**Behavior:**
- Toggle button in the top-right corner of the page (below admin bar)
- Panel slides down with animation
- Column checkboxes: non-hideable columns (like Title) are always checked and disabled
- Per-page input: number field with Apply button
- State persisted to `localStorage` under the config's `storageKey`
- Changes apply immediately for column visibility; per-page requires Apply

**Base UI Dependencies:** Uses `Collapsible` from `@base-ui/react/collapsible`, `Checkbox` from UI library.

---

#### `ConfirmDialog`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/ConfirmDialog.tsx`

**Purpose:** The ONLY allowed dialog in the system. Used exclusively for destructive action confirmations (Delete Permanently, Empty Trash).

**Props:**
```typescript
interface ConfirmDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** Confirm handler. */
  onConfirm: () => void;
  /** Dialog title (e.g., "Delete permanently?"). */
  title: string;
  /** Dialog message. */
  message: string;
  /** Confirm button label. Default: "Confirm". */
  confirmLabel?: string;
  /** Whether the confirm action is destructive. Default: false. */
  destructive?: boolean;
  /** Whether the action is currently executing (shows spinner). */
  isExecuting?: boolean;
}
```

**Rendering:**
```
+-----------------------------------------+
|  Delete permanently?                     |
|                                          |
|  This will permanently delete 3 posts.   |
|  This action cannot be undone.           |
|                                          |
|            [Cancel]  [Delete]            |
+-----------------------------------------+
```

**Base UI Dependencies:** Uses `Dialog` from `@base-ui/react/dialog`.

---

#### `ListTableToolbar`

**Path:** `ConvexPress-Admin/apps/web/src/components/shared/ListTableToolbar.tsx`

**Purpose:** Horizontal bar containing bulk actions on the left and filters + search on the right. Wraps BulkActions, entity-specific FilterBar, and SearchBox.

**Props:**
```typescript
interface ListTableToolbarProps {
  /** Left side content (BulkActions). */
  bulkActionsSlot: React.ReactNode;
  /** Center/right content (entity-specific filters). */
  filtersSlot?: React.ReactNode;
  /** Right side content (SearchBox). */
  searchSlot: React.ReactNode;
}
```

**Rendering:**
```
[Bulk Actions v] [Apply]  |  [All Dates v] [All Categories v] [Filter]  |  Search [________]
```

**Styling:**
- Flexbox row with `items-center justify-between gap-4 flex-wrap`
- Below Status Tabs, above the table

---

### Entity-Specific Components (Per-Page)

Each entity page builds its own components that compose the shared ones. These are NOT shared -- they live in entity-specific folders.

**Example for Posts (`ConvexPress-Admin/apps/web/src/components/posts/`):**

| Component | Purpose |
|-----------|---------|
| `PostListTable.tsx` | Configures `ListTable` with post-specific columns (Title, Author, Categories, Tags, Comments, Date) |
| `PostListRow.tsx` | Custom row rendering if needed (e.g., draft indicator, sticky badge) |
| `PostQuickEdit.tsx` | Inline Quick Edit form: title, slug, date, author, categories, tags, status, sticky, comment status |
| `PostBulkEdit.tsx` | Bulk edit panel for changing categories, tags, author, status across selected posts |
| `PostFilterBar.tsx` | Date dropdown + category dropdown + "Filter" button |
| `PostStatusTabs.tsx` | Configures `StatusTabs` with post-specific statuses |
| `PostBulkActions.tsx` | Configures `BulkActions` with post-specific actions (Trash, Publish, Edit) |

**Other Entities Follow the Same Pattern:**
- `components/pages/PageListTable.tsx`, `PageQuickEdit.tsx`, etc.
- `components/comments/CommentListTable.tsx`, `CommentQuickEdit.tsx`, etc.
- `components/users/UserListTable.tsx`, etc.
- `components/media/MediaListTable.tsx`, `MediaGrid.tsx` (grid/list toggle variant)
- `components/menus/MenuListTable.tsx`
- `components/custom-fields/CustomFieldListTable.tsx`
- `components/api-keys/ApiKeyListTable.tsx`
- `components/webhooks/WebhookListTable.tsx`
- `components/audit-log/AuditLogTable.tsx` (timeline variant -- no Quick Edit)
- `components/activity/ActivityLogTable.tsx` (timeline variant -- no Quick Edit)

---

## Hooks

### `useListTable`

**Path:** `ConvexPress-Admin/apps/web/src/hooks/useListTable.ts`

**Purpose:** Central hook that parses URL search params into filter/sort/pagination state and provides updater functions that write back to the URL.

**Signature:**
```typescript
interface UseListTableOptions<TRow> {
  /** The list table configuration. */
  config: ListTableConfig<TRow>;
  /** Convex query result for the list. undefined = loading. */
  data: PaginatedResult<TRow> | undefined;
  /** Convex query result for status counts. undefined = loading. */
  counts: Record<string, number> | undefined;
}

interface UseListTableReturn<TRow> {
  // --- State ---
  /** Parsed filter/sort/pagination state from URL. */
  sort: ListTableSortState;
  pagination: ListTablePaginationState;
  search: string;
  activeStatus: string | undefined;
  /** Visible columns (filtered by Screen Options). */
  visibleColumns: ColumnDef<TRow>[];
  /** Screen options state (persisted to localStorage). */
  screenOptions: ScreenOptionsState;
  /** Status tabs with live counts merged. */
  statusTabs: StatusTab[];
  /** Whether data is loading (data === undefined). */
  isLoading: boolean;
  /** Rows from query result. */
  rows: TRow[];
  /** Total items count. */
  total: number;
  /** Total pages. */
  totalPages: number;

  // --- Updaters (write to URL) ---
  setSort: (sort: ListTableSortState) => void;
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  setSearch: (search: string) => void;
  setStatus: (status: string | undefined) => void;
  setScreenOptions: (options: ScreenOptionsState) => void;

  // --- Bulk Selection (delegates to useBulkSelection) ---
  selection: BulkSelectionState;
  toggleRow: (id: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;
  selectedRows: TRow[];
}

function useListTable<TRow>(options: UseListTableOptions<TRow>): UseListTableReturn<TRow>;
```

**Behavior:**
1. Reads URL search params via TanStack Router's `useSearch()` hook.
2. Applies defaults from `config` for any missing params (sort, perPage, etc.).
3. Merges `counts` data into `config.statusTabs` to produce tabs with live counts.
4. Filters `config.columns` by `screenOptions.visibleColumns` to produce `visibleColumns`.
5. Reads/writes `screenOptions` from `localStorage` using `config.storageKey`.
6. All setter functions call TanStack Router's `navigate()` to update URL search params.
7. `setSearch` resets `page` to 1. `setStatus` resets `page` to 1 and clears `search`.
8. Delegates bulk selection to `useBulkSelection` internally.

**URL Search Params Format:**
```
/admin/posts?status=draft&search=hello&orderBy=title&orderDir=asc&page=2&perPage=20
```

---

### `useBulkSelection`

**Path:** `ConvexPress-Admin/apps/web/src/hooks/useBulkSelection.ts`

**Purpose:** Manages checkbox selection state for bulk actions. Handles select-all, individual toggle, and clearing.

**Signature:**
```typescript
interface BulkSelectionState {
  /** Set of selected row IDs. */
  selectedIds: Set<string>;
  /** Whether all visible rows are selected. */
  isAllSelected: boolean;
  /** Whether some (but not all) visible rows are selected (indeterminate checkbox). */
  isIndeterminate: boolean;
  /** Number of selected items. */
  count: number;
}

interface UseBulkSelectionOptions {
  /** IDs of all visible rows. */
  rowIds: string[];
}

interface UseBulkSelectionReturn {
  /** Current selection state. */
  state: BulkSelectionState;
  /** Toggle a single row. */
  toggleRow: (id: string) => void;
  /** Toggle all visible rows (select all / deselect all). */
  toggleAll: () => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Check if a specific row is selected. */
  isSelected: (id: string) => boolean;
}

function useBulkSelection(options: UseBulkSelectionOptions): UseBulkSelectionReturn;
```

**Behavior:**
- Selection state is React local state (`useState` with a `Set<string>`).
- `toggleAll`: If all visible rows are selected, deselect all. Otherwise, select all visible rows.
- When the visible rows change (due to pagination, filtering), selected IDs that are no longer visible remain selected (WordPress behavior -- selection persists across pages).
- `isIndeterminate` is true when `selectedIds.size > 0 && selectedIds.size < rowIds.length`.
- The header checkbox shows indeterminate state using the `indeterminate` prop on `Checkbox`.

---

### `useDebounce`

**Path:** `ConvexPress-Admin/apps/web/src/hooks/useDebounce.ts`

**Purpose:** Generic debounce hook used by SearchBox.

**Signature:**
```typescript
function useDebounce<T>(value: T, delay: number): T;
```

**Behavior:**
- Returns the debounced value after `delay` ms of no changes.
- Cleans up timeout on unmount.

---

### `useScreenOptions`

**Path:** `ConvexPress-Admin/apps/web/src/hooks/useScreenOptions.ts`

**Purpose:** Reads/writes Screen Options state (column visibility, per-page) from localStorage.

**Signature:**
```typescript
interface UseScreenOptionsOptions {
  /** localStorage key. */
  storageKey: string;
  /** Column definitions (to derive defaults). */
  columns: ColumnDef<any>[];
  /** Default per-page value. */
  defaultPerPage: number;
}

interface UseScreenOptionsReturn {
  state: ScreenOptionsState;
  setState: (state: ScreenOptionsState) => void;
  resetDefaults: () => void;
}

function useScreenOptions(options: UseScreenOptionsOptions): UseScreenOptionsReturn;
```

**Behavior:**
- On mount, reads from `localStorage.getItem(storageKey)`.
- If nothing stored, derives defaults from column definitions (`defaultVisible`).
- `setState` writes to localStorage and updates React state.
- `resetDefaults` clears localStorage and resets to column defaults.

---

## Routes

### Admin Routes Using List Table Pattern

| Route | Entity | Status Tabs | Sortable Columns | Quick Edit | Bulk Actions |
|-------|--------|-------------|-------------------|------------|--------------|
| `/admin/posts` | Posts | All, Published, Drafts, Pending, Scheduled, Private, Trash, Mine | Title, Author, Comments, Date | Yes | Trash, Delete, Publish, Edit |
| `/admin/pages` | Pages | All, Published, Drafts, Pending, Trash | Title, Author, Comments, Date | Yes | Trash, Delete, Publish, Edit |
| `/admin/media` | Media | All, Images, Audio, Video, Documents, Unattached, Mine, Trash | Title, Author, Uploaded To, Date | No (uses grid/list toggle) | Trash, Delete |
| `/admin/comments` | Comments | All, Pending, Approved, Spam, Trash | Author, Comment, In Response To, Submitted On | Yes | Approve, Unapprove, Spam, Trash, Delete |
| `/admin/comments/pending` | Comments | Same as above (pre-filtered to Pending) | Same | Yes | Same |
| `/admin/users` | Users | All, Administrator, Editor, Author, Contributor, Subscriber | Username, Name, Email, Role, Posts | No | Change Role, Delete |
| `/admin/roles` | Roles | None (flat list) | Role Name, Users | No | None |
| `/admin/custom-fields` | Custom Fields | All, Active, Inactive | Title, Field Type, Location, Status | No | Activate, Deactivate, Delete |
| `/admin/menus` | Menus | None (flat list) | Menu Name, Locations, Items Count | No | Delete |
| `/admin/api-keys` | API Keys | All, Active, Revoked | Name, Key (masked), Permissions, Last Used, Created | No | Revoke, Delete |
| `/admin/webhooks` | Webhooks | All, Active, Inactive | URL, Events, Status, Last Triggered | No | Activate, Deactivate, Delete |
| `/admin/activity` | Activity Log | None (timeline) | Timestamp (desc only) | No | None |
| `/admin/audit-log` | Audit Log | None (timeline) | User, Action, Entity, Timestamp | No | None |

### Route File Locations

```
ConvexPress-Admin/apps/web/src/routes/admin/
  posts/
    index.tsx           -> /admin/posts
  pages/
    index.tsx           -> /admin/pages
  media/
    index.tsx           -> /admin/media
  comments/
    index.tsx           -> /admin/comments
    pending.tsx         -> /admin/comments/pending
  users/
    index.tsx           -> /admin/users
  roles/
    index.tsx           -> /admin/roles
  custom-fields/
    index.tsx           -> /admin/custom-fields
  menus/
    index.tsx           -> /admin/menus
  api-keys/
    index.tsx           -> /admin/api-keys
  webhooks/
    index.tsx           -> /admin/webhooks
  activity/
    index.tsx           -> /admin/activity
  audit-log/
    index.tsx           -> /admin/audit-log
```

### TanStack Router Search Params Validation

Each route that uses the list table pattern should define validated search params using TanStack Router's `validateSearch`:

```typescript
// Example: admin/posts/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const postSearchSchema = z.object({
  status: z.enum(["publish", "draft", "pending", "future", "private", "trash", "mine"]).optional(),
  search: z.string().optional(),
  orderBy: z.enum(["title", "publishedAt", "updatedAt", "commentCount"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  authorId: z.string().optional(),
  categoryId: z.string().optional(),
  dateRange: z.string().optional(),
});

export const Route = createFileRoute("/admin/posts/")({
  validateSearch: postSearchSchema,
});
```

---

## Backend Integration

This expert does NOT define Convex functions. Each entity's backend system provides the queries. The list table UI simply calls them.

### Convex Query Patterns Per Entity

| Entity | List Query | Counts Query | Bulk Mutations |
|--------|-----------|--------------|----------------|
| Posts | `api.posts.list` | `api.posts.counts` | `api.posts.bulkTrash`, `api.posts.bulkDelete`, `api.posts.bulkPublish`, `api.posts.bulkRestore` |
| Pages | `api.pages.list` | `api.pages.counts` | `api.pages.bulkTrash`, `api.pages.bulkDelete`, `api.pages.bulkPublish` |
| Media | `api.media.list` | `api.media.counts` | `api.media.bulkTrash`, `api.media.bulkDelete` |
| Comments | `api.comments.list` | `api.comments.counts` | `api.comments.bulkApprove`, `api.comments.bulkUnapprove`, `api.comments.bulkSpam`, `api.comments.bulkTrash`, `api.comments.bulkDelete` |
| Users | `api.users.list` | `api.users.counts` | `api.users.bulkChangeRole`, `api.users.bulkDelete` |
| Custom Fields | `api.customFields.list` | `api.customFields.counts` | `api.customFields.bulkActivate`, `api.customFields.bulkDeactivate`, `api.customFields.bulkDelete` |
| API Keys | `api.apiKeys.list` | `api.apiKeys.counts` | `api.apiKeys.bulkRevoke`, `api.apiKeys.bulkDelete` |
| Webhooks | `api.webhooks.list` | `api.webhooks.counts` | `api.webhooks.bulkActivate`, `api.webhooks.bulkDeactivate`, `api.webhooks.bulkDelete` |
| Audit Log | `api.auditLog.list` | None | None |
| Activity Log | `api.activity.list` | None | None |
| Menus | `api.menus.list` | None | `api.menus.bulkDelete` |
| Roles | `api.roles.list` | None | None |

### Expected Query Signatures

All list queries follow a consistent shape that the `useListTable` hook expects:

```typescript
// Return shape (PaginatedResult<T>)
{
  items: T[];      // The rows for the current page
  total: number;   // Total count matching current filters
  page: number;    // Current page (1-based)
  perPage: number; // Items per page
  totalPages: number;
}

// Counts return shape
{
  all: number;
  [statusKey: string]: number;
  // e.g., publish: 28, draft: 10, trash: 1
}
```

---

## Quick Edit Pattern

Quick Edit is a critical component that deserves detailed specification since it must be inline (NOT a modal).

### How Quick Edit Works

1. User clicks "Quick Edit" in row actions.
2. The current row is replaced with an inline form that spans all columns.
3. The form shows editable fields relevant to the entity (title, slug, status, categories, etc.).
4. Only ONE row can be in Quick Edit mode at a time.
5. The form has "Update" and "Cancel" buttons.
6. "Cancel" collapses the form and restores the row.
7. "Update" calls the entity's update mutation, then collapses the form.

### Layout

```
+-----------------------------------------------------------------------+
| [ ] Quick Edit                                                         |
|                                                                        |
|  Title: [________________________]  Slug: [______________]            |
|                                                                        |
|  Date:  [Month v] [DD] [YYYY] @ [HH]:[MM]                           |
|                                                                        |
|  Author: [Select... v]    Status: [Draft v]                           |
|                                                                        |
|  Categories:              Tags:                                        |
|  [x] News                 [react, typescript, ...]                    |
|  [ ] Tech                                                              |
|  [x] Updates                                                           |
|                                                                        |
|  [x] Allow Comments   [ ] Sticky                                      |
|                                                                        |
|                                       [Cancel]  [Update]              |
+-----------------------------------------------------------------------+
```

### Entity-Specific Quick Edit Fields

| Entity | Quick Edit Fields |
|--------|-------------------|
| Posts | Title, Slug, Date, Author, Status, Categories, Tags, Allow Comments, Sticky |
| Pages | Title, Slug, Date, Author, Status, Parent Page, Template, Allow Comments |
| Comments | Author Name, Author Email, Author URL, Comment Text, Status |
| Media | Title, Alt Text, Caption, Description |

### Implementation

- The Quick Edit form is entity-specific (not generic).
- The `ListTable` component accepts `quickEditId` and `quickEditRender` props.
- When `quickEditId` matches a row ID, the form is rendered instead of the row.
- The form uses TanStack Form for controlled state and Zod for validation.
- On submit, calls the entity's update mutation. On success: toast + collapse.
- On error: inline error message within the form (not a toast).

---

## Accessibility

### Keyboard Navigation

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Table | Moves focus through interactive elements: checkboxes, sort headers, row action links |
| `Space` | Checkbox focused | Toggles checkbox selection |
| `Enter` | Sort header focused | Toggles sort direction |
| `Enter` | Row action link focused | Activates the action |
| `Escape` | Quick Edit open | Cancels Quick Edit and restores the row |
| `ArrowUp/Down` | Pagination input focused | Increments/decrements page number |

### ARIA Attributes

| Element | Attribute | Value |
|---------|-----------|-------|
| Table | `role` | `table` (native `<table>`) |
| Header checkbox | `aria-label` | `"Select all items"` |
| Row checkbox | `aria-label` | `"Select {item title}"` |
| Sort header | `aria-sort` | `"ascending"`, `"descending"`, or `"none"` |
| Status tabs | `role` | `tablist` with `tab` children |
| Active tab | `aria-selected` | `true` |
| Count badge | `aria-label` | `"{count} items"` |
| Pagination | `nav` with `aria-label` | `"Pagination"` |
| Page input | `aria-label` | `"Current page"` |
| Bulk action select | `aria-label` | `"Bulk actions"` |
| Empty state | `role` | `status` with `aria-live="polite"` |
| Search input | `role` | `search` (wrapping `<form>`) |
| Confirm dialog | `role` | `alertdialog` (via Base UI Dialog) |

### Focus Management

- After bulk action execution: focus moves to the status message / toast.
- After Quick Edit cancel: focus returns to the "Quick Edit" action link of that row.
- After Quick Edit save: focus moves to the row's primary cell.
- After page change: focus moves to the first row of the new page.
- After search: focus remains in the search input.

---

## Dependencies

### Depends On (UI Components)

| Component | Source | Purpose |
|-----------|--------|---------|
| `Checkbox` | `@base-ui/react/checkbox` (project UI) | Row and header selection checkboxes |
| `Select` | `@base-ui/react/select` | Bulk action dropdown, per-page dropdown, filter dropdowns |
| `Collapsible` | `@base-ui/react/collapsible` | Screen Options panel |
| `Dialog` | `@base-ui/react/dialog` | Confirmation dialog for destructive actions |
| `Input` | `@base-ui/react/input` (project UI) | Search input, Quick Edit form fields |
| `Button` | `@base-ui/react/button` (project UI) | Apply, Filter, Cancel, Update buttons |
| `Skeleton` | Project UI | Loading skeletons |

### Depends On (Libraries)

| Library | Purpose |
|---------|---------|
| `@tanstack/react-router` | URL search params (useSearch, navigate), Link component |
| `convex/react` | `useQuery` for reactive data, `useMutation` for actions |
| `sonner` | Toast notifications after bulk actions |
| `lucide-react` | Icons (ChevronLeft, ChevronRight, Search, X, ArrowUpDown, ArrowUp, ArrowDown, etc.) |
| `class-variance-authority` | `cva` for variant-based styling (buttons already use this) |
| `clsx` + `tailwind-merge` | `cn()` utility for merging class names |
| `zod` | Search param validation, Quick Edit form validation |
| `@tanstack/react-form` | Quick Edit form state management |

### Depends On (Backend Systems)

| System | Type | Details |
|--------|------|---------|
| **Post System** | Hard | Provides `posts.list`, `posts.counts`, all post bulk mutations |
| **Page System** | Hard | Provides `pages.list`, `pages.counts`, all page bulk mutations |
| **Media System** | Hard | Provides `media.list`, `media.counts`, media bulk mutations |
| **Comment System** | Hard | Provides `comments.list`, `comments.counts`, comment bulk mutations |
| **User Profile System** | Hard | Provides `users.list`, `users.counts` |
| **Role & Capability System** | Medium | Capability checks for showing/hiding actions and columns |
| **Custom Field System** | Medium | Provides `customFields.list`, `customFields.counts` |
| **Menu System** | Medium | Provides `menus.list` |
| **API System** | Medium | Provides `apiKeys.list`, `webhooks.list` |
| **Audit Log System** | Medium | Provides `auditLog.list` |

### Depended On By

This is a pure UI system. No backend systems depend on it. However, all 13+ admin listing pages depend on its shared components.

---

## Implementation Checklist

### Shared Components (`ConvexPress-Admin/apps/web/src/components/shared/`)

- [ ] `ListTable.tsx` - Core table with header, body, row rendering, sort, selection
- [ ] `StatusTabs.tsx` - Horizontal status filter tabs with count badges
- [ ] `BulkActions.tsx` - Bulk action dropdown + Apply button
- [ ] `SearchBox.tsx` - Debounced search input with clear button
- [ ] `Pagination.tsx` - Page navigation + per-page selector
- [ ] `InlineActions.tsx` - Row hover actions (Edit, Quick Edit, Trash, View)
- [ ] `EmptyState.tsx` - No-results message with optional action
- [ ] `TableSkeleton.tsx` - Column-aware loading skeleton
- [ ] `ScreenOptions.tsx` - Collapsible column visibility + per-page settings
- [ ] `ConfirmDialog.tsx` - Destructive action confirmation (ONLY dialog)
- [ ] `ListTableToolbar.tsx` - Toolbar wrapping bulk actions, filters, search

### Hooks (`ConvexPress-Admin/apps/web/src/hooks/`)

- [ ] `useListTable.ts` - Central hook: URL state, columns, sort, pagination, search, selection
- [ ] `useBulkSelection.ts` - Checkbox selection state management
- [ ] `useDebounce.ts` - Generic debounce hook
- [ ] `useScreenOptions.ts` - localStorage-persisted screen options

### Types (`ConvexPress-Admin/apps/web/src/types/`)

- [ ] `list-table.ts` - All shared TypeScript types (ColumnDef, ListTableConfig, etc.)

### Entity-Specific Components (first implementations)

- [ ] `components/posts/PostListTable.tsx` - Posts column config + row rendering
- [ ] `components/posts/PostQuickEdit.tsx` - Post inline Quick Edit form
- [ ] `components/posts/PostFilterBar.tsx` - Date + category filter dropdowns
- [ ] `components/pages/PageListTable.tsx` - Pages column config
- [ ] `components/comments/CommentListTable.tsx` - Comments column config
- [ ] `components/users/UserListTable.tsx` - Users column config

### Routes (TanStack Router search param validation)

- [ ] `routes/admin/posts/index.tsx` - Post list with validated search params
- [ ] `routes/admin/pages/index.tsx` - Page list
- [ ] `routes/admin/media/index.tsx` - Media list (grid/list toggle)
- [ ] `routes/admin/comments/index.tsx` - Comment list
- [ ] `routes/admin/comments/pending.tsx` - Pre-filtered pending comments
- [ ] `routes/admin/users/index.tsx` - User list
- [ ] `routes/admin/roles/index.tsx` - Roles list
- [ ] `routes/admin/custom-fields/index.tsx` - Custom fields list
- [ ] `routes/admin/menus/index.tsx` - Menus list
- [ ] `routes/admin/api-keys/index.tsx` - API keys list
- [ ] `routes/admin/webhooks/index.tsx` - Webhooks list
- [ ] `routes/admin/activity/index.tsx` - Activity log
- [ ] `routes/admin/audit-log/index.tsx` - Audit log

---

## Known Gaps & Open Decisions

### 1. Generic `<ListTable>` vs Per-Entity Table Components

**Decision:** Use a **generic `<ListTable>`** component with column definitions passed as config. Entity pages compose it with their specific column defs and data. This avoids duplicating table structure across 13+ pages while keeping entity-specific rendering fully customizable via the `render` function on each `ColumnDef`.

**Rationale:** WordPress's `WP_List_Table` is a PHP class that each entity subclasses. ConvexPress's React equivalent is composition via props/config rather than class inheritance.

### 2. Quick Edit Inline Form (Accordion Row vs Modal)

**Decision:** Inline row expansion (accordion style). Per CLAUDE.md rules, content editing NEVER uses modals. The Quick Edit form replaces the row content within the table, spanning all columns via `colspan`. Only one row can be in Quick Edit mode at a time.

### 3. Bulk Action Confirmation Pattern

**Decision:** Destructive bulk actions (Delete Permanently, Empty Trash) show a `ConfirmDialog` -- the ONLY allowed dialog/popup in the system. Non-destructive bulk actions (Trash, Publish, Change Role) execute immediately with an undo toast.

### 4. Mobile Responsive Strategy

**Decision: Open.** Options under consideration:
- **A) Horizontal scroll:** Table stays as-is with `overflow-x-auto`. Simple but less usable.
- **B) Card layout:** Below a breakpoint (e.g., `md`), each row becomes a stacked card. Better UX but more complex.
- **C) Priority columns:** Hide low-priority columns on mobile, show only Title + primary action columns.

**Recommendation:** Option C (priority columns) as the default, with horizontal scroll as a fallback. The `ColumnDef` already has `hideable` -- add a `priority` field (1-5) and hide columns below a threshold on small screens.

### 5. Virtual Scrolling vs Traditional Pagination

**Decision:** Traditional pagination. WordPress uses pagination, Convex supports cursor-based pagination natively, and virtual scrolling adds significant complexity. Most admin tables display 20-100 rows per page, which is well within DOM performance limits.

### 6. Column Resize Persistence

**Decision: Deferred.** Column resizing is a nice-to-have but not part of the WordPress pattern. If implemented later, resize values would be persisted alongside column visibility in `ScreenOptions` (localStorage).

### 7. Media Library Grid/List Toggle

**Decision:** The Media page is a special case. It supports TWO view modes:
- **List mode:** Uses the standard `ListTable` pattern.
- **Grid mode:** Uses a custom `MediaGrid` component with thumbnail cards.

A toggle switch in the toolbar switches between views. The active view mode is stored in URL search params (`view=grid|list`) and persisted in `ScreenOptions`.

### 8. Activity/Audit Log Timeline Variant

**Decision:** Activity Log and Audit Log pages use a simplified variant of the list table:
- No checkboxes, no bulk actions, no Quick Edit.
- Timeline-style rows with timestamp, user avatar, action description.
- Filtering by date range, user, action type.
- Still uses `StatusTabs` for action type filtering (if applicable) and `Pagination`.
- Uses the same `useListTable` hook with `showCheckboxes: false`.

### 9. Optimistic Updates for Bulk Actions

**Decision:** Use Convex optimistic updates where practical. For simple status changes (trash, publish, approve), apply the change immediately in the UI and let Convex confirm. For permanent deletes, wait for server confirmation (destructive, irreversible). Show error toasts if the server rejects the optimistic update.

### 10. Empty Trash Button

**Decision:** When viewing the Trash status tab, a prominent "Empty Trash" button appears next to the status tabs. Clicking it triggers a `ConfirmDialog` with the message: "You are about to permanently delete all items in the Trash. This action cannot be undone." On confirm, calls the entity's bulk delete mutation with all trashed item IDs.

---

## Styling Reference

### CSS Variable Usage (No Hardcoded Colors)

All list table styling uses CSS variables and opacity modifiers. Never hardcoded colors.

```
/* Backgrounds */
bg-card            -> Table container background
bg-muted/50        -> Table header row
bg-muted/30        -> Row hover state
bg-primary/5       -> Selected row highlight
bg-destructive/10  -> Destructive action hover

/* Text */
text-foreground            -> Primary text (titles, data)
text-muted-foreground      -> Secondary text (counts, labels, dates)
text-muted-foreground/50   -> Tertiary text (separators, pipe characters)
text-primary               -> Links, active tab
text-destructive           -> Destructive action labels

/* Borders */
border-border       -> Table borders, row dividers
border-input        -> Form input borders (Quick Edit)
border-ring         -> Focus ring borders

/* Opacity Modifiers */
bg-black/40         -> Overlay behind confirm dialog
hover:bg-muted/50   -> Subtle hover states
```

### Design Tokens (from existing components)

Based on the existing Button, Input, Checkbox, DropdownMenu, and Skeleton components in the project:

- **Border radius:** `rounded-none` (square corners throughout)
- **Font size:** `text-xs` (12px, the standard for admin UI in this project)
- **Heights:** `h-8` (buttons, inputs), `h-6` (xs buttons)
- **Focus rings:** `focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:border-ring`
- **Transitions:** `transition-colors`, `transition-opacity`
- **Disabled state:** `disabled:pointer-events-none disabled:opacity-50`

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `WP_List_Table` class | `<ListTable>` component + `useListTable` hook | Composition instead of inheritance |
| `WP_List_Table::get_columns()` | `ColumnDef[]` array in config | Declarative column definitions |
| `WP_List_Table::get_sortable_columns()` | `sortable: true` on ColumnDef | Per-column sortable flag |
| `WP_List_Table::column_default()` | `render()` on ColumnDef | Custom cell renderer per column |
| `WP_List_Table::get_bulk_actions()` | `BulkAction[]` array in config | Declarative bulk action definitions |
| `WP_List_Table::row_actions()` | `<InlineActions>` component | Row hover action links |
| `WP_List_Table::inline_edit()` | Entity-specific `QuickEdit` component | Inline row expansion form |
| `WP_List_Table::pagination()` | `<Pagination>` component | Page nav + per-page |
| `WP_List_Table::search_box()` | `<SearchBox>` component | Debounced search input |
| `WP_List_Table::views()` | `<StatusTabs>` component | Status filter tabs with counts |
| `WP_List_Table::no_items()` | `<EmptyState>` component | Empty state message |
| Screen Options (WP core) | `<ScreenOptions>` + `useScreenOptions` | Column visibility + per-page |
| `wp_nonce_field()` | Convex Auth JWT auth | CSRF protection via auth tokens, not nonces |
| `check_ajax_referer()` | Convex auth middleware | Server-side auth verification |
