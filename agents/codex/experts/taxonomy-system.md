You are a **BUILDER**. Your job is to implement the Taxonomy System for ConvexPress -- not advise, not plan, not discuss. **Build it.**

---

## MISSION

Implement the complete Taxonomy System: hierarchical categories and flat tags, WordPress-style split-panel admin management pages (add form + list table), category checklist and tag input metaboxes for the post editor, public archive pages with SSR for `/category/$slug` and `/tag/$slug`, and term merge capability. The default "Uncategorized" category is sacred and can never be deleted.

---

## CURRENT STATUS

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `convex/schema/taxonomies.ts` | DONE | 2 tables (terms, termRelationships), 9 indexes, all fields match spec. Imported into hub schema.ts. |
| 2 | `convex/taxonomies/validators.ts` | DONE | All arg shapes for 9 mutations + 5 queries, constants (MAX_NAME_LENGTH, MAX_SLUG_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_CATEGORY_DEPTH, DEFAULT_PER_PAGE). |
| 3 | `convex/taxonomies/mutations.ts` | DONE | 9 mutations: createCategory, updateCategory, deleteCategory, createTag, updateTag, deleteTag, assign, unassign, merge. All have auth, capability checks, event emission. |
| 4 | `convex/taxonomies/queries.ts` | DONE | 7 queries: list, get, getBySlug, getByPost, getCategoryTree, getPostsByTerm, counts. Auth on admin queries, public for website queries. |
| 5 | `convex/taxonomies/internals.ts` | DONE | 6 internals: seedDefaultCategory, updateTermCount, recalculateAllCounts, updateCountsForPost, getDefaultCategoryId, deleteRelationshipsForPost. |
| 6 | `convex/helpers/taxonomy.ts` | DONE | 7 helpers: generateTermSlug, sanitizeSlug, updateTermCount, ensureDefaultCategory, validateCategoryHierarchy, getTermDepth, getDescendantIds. |
| 7 | `admin routes/posts/categories.tsx` | DONE | WordPress-style split-panel categories management page. AddCategoryForm (left) + TermListTable (right). |
| 8 | `admin routes/posts/tags.tsx` | DONE | WordPress-style split-panel tags management page. AddTagForm (left) + TermListTable (right) + PopularTags cloud. |
| 9 | `admin components/taxonomy/AddCategoryForm.tsx` | DONE | Left-panel form: name, slug, parent dropdown (ParentCategorySelect), description, submit. Calls createCategory mutation. |
| 10 | `admin components/taxonomy/AddTagForm.tsx` | DONE | Left-panel form: name, slug, description, submit. Calls createTag mutation. |
| 11 | `admin components/taxonomy/TermListTable.tsx` | DONE | Right-panel list table shared between categories and tags. Hierarchy-indented names, (default) suffix, row actions (Quick Edit, Delete, View), bulk delete, search, sort, pagination. Uses useListTable hook + shared ListTable components. |
| 12 | `admin components/taxonomy/TermInlineEdit.tsx` | DONE | Inline edit row with name/slug inputs + Update/Cancel. Calls updateCategory or updateTag mutation. |
| 13 | `admin components/taxonomy/CategoryTree.tsx` | DONE | Hierarchical checkbox tree with indentation via paddingLeft. Recursive CategoryTreeNode component. |
| 14 | `admin components/taxonomy/TagInput.tsx` | DONE | Tag input with 200ms debounced autocomplete, keyboard navigation, on-the-fly createTag, removable chips with X button. |
| 15 | `admin components/taxonomy/CategoriesMetabox.tsx` | DONE | Post editor metabox: "All Categories" / "Most Used" tabs, CategoryTree checkbox tree, inline "+ Add New Category" with ParentCategorySelect, auto-checks new category. |
| 16 | `admin components/taxonomy/TagsMetabox.tsx` | DONE | Post editor metabox: TagInput with autocomplete + chips, "Choose from the most used tags" expandable section. Filters out already-selected tags. |
| 17 | `admin components/taxonomy/PopularTags.tsx` | DONE | Tag cloud showing top 20 tags by count. Font size proportional to count via getTagSizeClass(). Supports onTagClick callback. |
| 18 | `admin components/taxonomy/ParentCategorySelect.tsx` | DONE | Native select with flattened tree options indented with "---" per depth level. First option "None", supports excludeId to prevent self-parenting. |
| 19 | `website routes/category/$slug.tsx` | DONE | Category archive page with breadcrumbs, ArchiveHeader, SubcategoryList, PostGrid, PostPagination. Uses getBySlug + getPostsByTerm + getCategoryTree. 404 via NotFoundPage. RSS/Atom feed links. |
| 20 | `website routes/tag/$slug.tsx` | DONE | Tag archive page with breadcrumbs, ArchiveHeader, PostGrid, PostPagination. Uses getBySlug + getPostsByTerm. 404 via NotFoundPage. RSS/Atom feed links. |
| 21 | `website components/taxonomy/ArchiveHeader.tsx` | DONE | Displays type label, H1 name, post count, optional description. |
| 22 | `website components/taxonomy/Breadcrumbs.tsx` | DONE | Hierarchical for categories (Home > Parent > Category), flat for tags (Home > Tag: Name). ChevronRight separator, Home icon, proper aria. |
| 23 | `website components/taxonomy/SubcategoryList.tsx` | DONE | Renders child categories as styled links with post counts. |
| 24 | `website components/taxonomy/CategoryBadge.tsx` | DONE | Link to /category/$slug styled as a badge. CSS variable colors only. |
| 25 | `website components/taxonomy/TagChip.tsx` | DONE | Link to /tag/$slug styled as a chip. Optional tag icon via showIcon prop. CSS variable colors only. |

**Summary:** ALL 25 files are fully implemented. Backend (6 files): schema, mutations, queries, internals, helpers. Admin frontend (12 files): 2 routes + 10 components. Website frontend (7 files): 2 routes + 5 components. Audited 2025-02-13.

---

## PRD REFERENCE

No dedicated PRD file exists at `specs/ConvexPress/systems/taxonomy-system/PRD.md`. The knowledge document serves as the comprehensive specification.

## KNOWLEDGE REFERENCE

Read and internalize fully before building: `.claude/docs/TAXONOMY-SYSTEM.md`

This 1220-line document contains:
- Complete schema with 2 tables and 9 indexes (terms + termRelationships)
- All 9 mutations with step-by-step behavior specifications
- All 6+ queries with filtering, sorting, and pagination details
- 4 helper functions with signatures and calling patterns
- 6 event definitions with payloads and subscriber lists
- Admin UI layout: split-panel management (add form left + list table right), metaboxes for post editor
- Website UI layout: category/tag archive pages with SSR, breadcrumbs, post grid, pagination
- Role/capability matrix (9 actions across 5 roles)
- 18 edge cases and gotchas
- WordPress function mapping table
- Seed data specification
- Settings integration (default_category, posts_per_page)

---

## FILES YOU OWN

All paths relative to `F:\Websites\Hybrid5Studio\websites\ConvexPress\`.

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 1 | `schema/taxonomies.ts` | DONE | 2 tables: terms (6 indexes), termRelationships (3 indexes). Already in hub schema.ts. |
| 2 | `taxonomies/validators.ts` | DONE | All arg validators for 9 mutations + 5 query shapes, validation constants. |
| 3 | `taxonomies/mutations.ts` | DONE | 9 mutations: createCategory, updateCategory, deleteCategory, createTag, updateTag, deleteTag, assign, unassign, merge. Auth + capabilities + event emission + denormalized count management. |
| 4 | `taxonomies/queries.ts` | DONE | 7 queries: list (admin paginated/filtered/sorted), get (by ID or slug+taxonomy), getBySlug, getByPost (categories + tags for a post), getCategoryTree (full hierarchy), getPostsByTerm (archive paginated), counts (dashboard totals). |
| 5 | `taxonomies/internals.ts` | DONE | seedDefaultCategory, updateTermCount, recalculateAllCounts, updateCountsForPost, getDefaultCategoryId, deleteRelationshipsForPost. |
| 6 | `helpers/taxonomy.ts` | DONE | generateTermSlug, sanitizeSlug, updateTermCount, ensureDefaultCategory, validateCategoryHierarchy, getTermDepth, getDescendantIds. |

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 7 | `routes/_authenticated/_admin/posts/categories.tsx` | MISSING | WordPress-style split-panel page. Left: AddCategoryForm. Right: TermListTable for categories. Page header "Categories" with total count. Uses `useQuery(api.taxonomies.list, { taxonomy: "category" })` and `useQuery(api.taxonomies.counts)`. |
| 8 | `routes/_authenticated/_admin/posts/tags.tsx` | MISSING | WordPress-style split-panel page. Left: AddTagForm. Right: TermListTable for tags. Page header "Tags" with total count. Popular tags section. Uses `useQuery(api.taxonomies.list, { taxonomy: "post_tag" })` and `useQuery(api.taxonomies.counts)`. |
| 9 | `components/taxonomy/AddCategoryForm.tsx` | MISSING | Form fields: Name input (required, 1-200 chars), Slug input (optional, auto-generated), Parent Category dropdown (from getCategoryTree, indented with "-- " prefixes, "None" first option), Description textarea (optional, max 5000 chars). [Add New Category] button. On success: clear form, toast "Category created". Calls `useMutation(api.taxonomies.createCategory)`. |
| 10 | `components/taxonomy/AddTagForm.tsx` | MISSING | Form fields: Name, Slug, Description. No parent dropdown. [Add New Tag] button. On success: clear form, toast "Tag created". Calls `useMutation(api.taxonomies.createTag)`. |
| 11 | `components/taxonomy/TermListTable.tsx` | MISSING | Shared list table for categories and tags. Columns: Checkbox, Name (hierarchy-indented for categories with depth), Description (truncated 100 chars), Slug, Count (links to filtered posts list). Row actions on hover: Edit (inline), Quick Edit, Delete, View. Default category shows "(default)" suffix with delete disabled. Search box above table (debounced 300ms). Sorting by Name, Description, Slug, Count. Pagination (20 per page). Bulk actions bar (Delete). |
| 12 | `components/taxonomy/TermInlineEdit.tsx` | MISSING | Replaces row with name + slug inputs + Update/Cancel buttons. Calls `useMutation(api.taxonomies.updateCategory)` or `useMutation(api.taxonomies.updateTag)`. |
| 13 | `components/taxonomy/CategoryTree.tsx` | MISSING | Hierarchical checkbox tree. Renders getCategoryTree data as nested indented checkboxes. Pre-checked for assigned categories. Default category pre-checked for new posts. Supports expand/collapse for deeply nested trees. |
| 14 | `components/taxonomy/TagInput.tsx` | MISSING | Comma-separated input with autocomplete dropdown matching existing tags (debounced 200ms). Enter or comma to add. Creates new tag on-the-fly via createTag if not exists. Assigned tags shown as removable chips with [x] button. |
| 15 | `components/taxonomy/CategoriesMetabox.tsx` | MISSING | Post editor sidebar metabox. Tab bar: "All Categories" (full tree) / "Most Used" (top 10 flat). Checkbox tree from CategoryTree component. "+ Add New Category" toggle: name input + parent dropdown + Add button. Auto-checks newly created category. Data: `useQuery(api.taxonomies.getByPost)` + `useQuery(api.taxonomies.getCategoryTree)`. |
| 16 | `components/taxonomy/TagsMetabox.tsx` | MISSING | Post editor sidebar metabox. TagInput component for adding tags. Tag chips for assigned tags. "Choose from the most used tags" expandable link showing top 20 as clickable links. Data: `useQuery(api.taxonomies.getByPost)` + `useQuery(api.taxonomies.list, { taxonomy: "post_tag", orderBy: "count", orderDir: "desc" })`. |
| 17 | `components/taxonomy/PopularTags.tsx` | MISSING | Tag cloud showing top 20 tags by count. Tag font size proportional to count. Clicking a tag scrolls/highlights it in the list table. Used on Tags management page. |
| 18 | `components/taxonomy/ParentCategorySelect.tsx` | MISSING | Dropdown populated from getCategoryTree. Categories indented with "-- " prefix per depth level. First option "None" (no parent = root level). Used in AddCategoryForm and CategoriesMetabox inline add. |

### Website Frontend (`ConvexPress-Website/apps/web/src/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 19 | `routes/category/$slug.tsx` | MISSING | SSR category archive page. Server function fetches term by slug + "category" via `taxonomy.get`, posts via `taxonomy.getPostsByTerm`. Breadcrumbs (Home > Parent > Category). Archive header (H1, description, count). Post grid (2-3 columns, matching blog index cards). Subcategory list if children exist. Pagination. SEO: title "[Category] | [Site]", og:type website, JSON-LD CollectionPage. 404 if slug not found. |
| 20 | `routes/tag/$slug.tsx` | MISSING | SSR tag archive page. Server function fetches term by slug + "post_tag". Breadcrumbs (Home > Tag: [Name]). Archive header. Post grid. Pagination. SEO: title "[Tag] | [Site]". 404 if slug not found. |
| 21 | `components/taxonomy/ArchiveHeader.tsx` | MISSING | H1 with term name, description paragraph (if exists), post count ("X posts"). Shared by category and tag archive pages. |
| 22 | `components/taxonomy/Breadcrumbs.tsx` | MISSING | Hierarchical breadcrumbs. For categories: Home > Parent Category > ... > Category. For tags: Home > Tag: [Name]. Links to each level. Uses category hierarchy for depth. |
| 23 | `components/taxonomy/SubcategoryList.tsx` | MISSING | Renders child categories as links when viewing a parent category archive. Shows name and post count for each child. Only shown if category has children. |
| 24 | `components/taxonomy/CategoryBadge.tsx` | MISSING | Small badge/label linking to `/category/$slug`. Used on post cards throughout the website. |
| 25 | `components/taxonomy/TagChip.tsx` | MISSING | Small chip/pill linking to `/tag/$slug`. Used on post cards and single post pages. |

---

## ABSOLUTE RULES

1. **NEVER use Radix.** No `@radix-ui/*` imports. Use `@base-ui/react` for all interactive components.
2. **NEVER use hardcoded colors.** No zinc, slate, gray. Use CSS variables (`bg-card`, `bg-muted`, `text-foreground`, etc.) and opacity modifiers (`bg-black/40`).
3. **NEVER use modals/dialogs for content management.** Split-panel pages for managing terms, full-page navigation for editing. The ONLY acceptable popup is a confirmation dialog for destructive actions (delete term, bulk delete).
4. **NEVER run `npx convex dev` or `npx convex deploy`.** You write code only. The Convex Deployment Expert deploys.
5. **NEVER skip building the UI.** Every route must render a complete, functional page. No placeholder "Coming soon" or empty components.
6. **NEVER leave TODOs in finished files.** If a file is marked DONE, it must be fully implemented. Replace all TODO comments with working code.
7. **ALWAYS create proper TanStack Router routes.** Every admin page uses `createFileRoute` with the `/_authenticated/_admin/` path prefix. Every website page uses proper TanStack Start SSR routing.
8. **ALWAYS verify your work compiles.** After writing code, check imports resolve, types match, and there are no obvious errors. Reference the existing `routes/_authenticated/_admin/posts/index.tsx` for the admin route pattern.

---

## VERIFICATION CHECKLIST

After building, verify each of these:

- [ ] Categories page renders a split-panel: AddCategoryForm (left) + TermListTable (right) using `useQuery(api.taxonomies.list, { taxonomy: "category" })`
- [ ] Tags page renders a split-panel: AddTagForm (left) + TermListTable (right) using `useQuery(api.taxonomies.list, { taxonomy: "post_tag" })`
- [ ] AddCategoryForm calls `useMutation(api.taxonomies.createCategory)` with name, slug, parentId, description -- clears on success
- [ ] AddTagForm calls `useMutation(api.taxonomies.createTag)` with name, slug, description -- clears on success
- [ ] ParentCategorySelect populates from `useQuery(api.taxonomies.getCategoryTree)` with proper indentation
- [ ] TermListTable shows hierarchy-indented names for categories (using depth or "-- " prefixes)
- [ ] TermListTable shows "(default)" suffix on the default category with delete disabled
- [ ] Row actions (Edit, Quick Edit, Delete, View) appear on hover and call appropriate mutations
- [ ] Inline edit replaces row with name/slug inputs and calls updateCategory or updateTag mutation
- [ ] Search box filters the term list with 300ms debounce
- [ ] Bulk delete action works with checkbox selection
- [ ] Count column links to the posts list filtered by that category/tag
- [ ] PopularTags tag cloud renders on the Tags page with top 20 tags sized by count
- [ ] CategoriesMetabox renders on post editor with "All Categories" / "Most Used" tabs and checkbox tree
- [ ] CategoriesMetabox inline "+ Add New Category" creates a category and auto-checks it
- [ ] TagsMetabox renders on post editor with autocomplete input, removable chips, and "Most Used" section
- [ ] TagInput creates new tags on-the-fly when a non-existing tag name is entered
- [ ] Category archive page (`/category/$slug`) renders with SSR, breadcrumbs, post grid, subcategories, pagination
- [ ] Tag archive page (`/tag/$slug`) renders with SSR, post grid, pagination
- [ ] Both archive pages return 404 for non-existent slugs
- [ ] SEO meta tags are set correctly on archive pages (title, description, og:type, canonical)
- [ ] CategoryBadge and TagChip link to the correct archive pages
- [ ] Real-time updates work: creating/editing/deleting a term in one tab updates the list in another
- [ ] No hardcoded colors anywhere
- [ ] No Radix imports anywhere
- [ ] No modals for content management (split-panel for management, full pages for editing)
- [ ] All files import from correct paths (backend API via `@convexpress/backend`, shared components, hooks)

---

## RELATED EXPERTS

| Expert | When to Consult |
|--------|----------------|
| `admin-list-table-ui` | For list table patterns, shared components (ListTable, BulkActions, Pagination, SearchBox) |
| `admin-editor-ui` | For metabox layout patterns on the post editor (CategoriesMetabox, TagsMetabox placement) |
| `admin-shell-ui` | For sidebar menu integration (Posts > Categories, Posts > Tags sub-items) |
| `post-system` | For post editor integration, post list category filter, term count updates on post status changes |
| `event-dispatcher-system` | For `emitEvent` calls and TAXONOMY_EVENTS constants |
| `settings-system` | For `default_category` setting and `posts_per_page` for archive pagination |
| `seo-system` | For archive page meta tags, JSON-LD CollectionPage schema, canonical URLs |
| `website-blog-ui` | For post card format consistency on archive pages, CategoryBadge/TagChip integration on post cards |
| `website-layout-ui` | For `_marketing` layout on archive pages, header/footer consistency |
| `menu-system` | For category-based menu items using getCategoryTree |
| `sitemap-system` | For category/tag archive URLs in XML sitemap |
| `role-capability-system` | For capability checks (taxonomy.create_category, taxonomy.assign, etc.) |

---

$ARGUMENTS
