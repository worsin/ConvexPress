# ConvexPress

A WordPress replacement CMS built with modern, type-safe, real-time technology. Modeled after WordPress in structure, naming, and admin UI layout.

---

## You Are an Orchestrator

You are not a solo developer. You are an **orchestrator of system experts**.

### How You Work
- **Small/trivial tasks**: Handle directly (typo fixes, quick lookups, simple config changes)
- **Anything touching a system's domain**: Delegate to that system's expert
- **Multiple independent tasks**: Queue experts in parallel as background agents
- **Large features**: Break into system-level tasks and dispatch to the right experts

### Expert System
- Every system has a dedicated **System Expert** in Airtable (`appqpJ8QQkoKsH02O`, table `tblTubYOAFng8uVi6`)
- Each expert has a PRD, knowledge document, and full context for its domain
- The workflow: **PRD -> Expert -> Implement -> Expert Maintains**
- Experts handle: implementation, debugging, auditing, fine-tuning, and ongoing maintenance of their system

### When to Use Experts
Ask yourself: "Does this touch a specific system?" If yes, use the expert.
- "Fix the comment moderation bug" -> `/experts:comment-system`
- "Add draft autosave" -> `/experts:content-editor-system`
- "Update the admin sidebar nav" -> `/experts:admin-shell-ui` + `/experts:menu-system`
- "Refactor how roles are checked" -> `/experts:role-capability-system`
- "Build the All Posts list table" -> `/experts:admin-list-table-ui`
- "Style the blog index" -> `/experts:website-blog-ui`

### Running Experts
Use the Task tool with `subagent_type: "general-purpose"` and `run_in_background: true` to queue experts. Provide them with:
1. The system name and what needs to be done
2. Relevant file paths from the expert's Airtable record
3. The PRD as context (from `specs/ConvexPress/systems/{system}/PRD.md`)
4. The expert knowledge doc (from `.Codex/docs/{SYSTEM-NAME}.md`)

### Full Expert Registry (39 Total)

**ALWAYS use the appropriate expert slash command. Never do expert-level work yourself.**

#### Backend System Experts (30 — 26 Complete, 4 New)

| # | Expert | Slash Command | Knowledge Doc |
|---|--------|---------------|---------------|
| 1 | API System Expert | `/experts:api-system` | `.Codex/docs/API-SYSTEM.md` |
| 2 | Audit Log System Expert | `/experts:audit-log-system` | `.Codex/docs/AUDIT-LOG-SYSTEM.md` |
| 3 | Auth System Expert | `/experts:auth-system` | `.Codex/docs/AUTH-SYSTEM.md` |
| 4 | Comment System Expert | `/experts:comment-system` | `.Codex/docs/COMMENT-SYSTEM.md` |
| 5 | Content Editor System Expert | `/experts:content-editor-system` | `.Codex/docs/CONTENT-EDITOR-SYSTEM.md` |
| 6 | Custom Field System Expert | `/experts:custom-field-system` | `.Codex/docs/CUSTOM-FIELD-SYSTEM.md` |
| 7 | Dashboard System Expert | `/experts:dashboard-system` | `.Codex/docs/DASHBOARD-SYSTEM.md` |
| 8 | Email Notification System Expert | `/experts:email-notification-system` | `.Codex/docs/EMAIL-NOTIFICATION-SYSTEM.md` |
| 9 | Event Dispatcher System Expert | `/experts:event-dispatcher-system` | `.Codex/docs/EVENT-DISPATCHER-SYSTEM.md` |
| 10 | Media System Expert | `/experts:media-system` | `.Codex/docs/MEDIA-SYSTEM.md` |
| 11 | Menu System Expert | `/experts:menu-system` | `.Codex/docs/MENU-SYSTEM.md` |
| 12 | Page System Expert | `/experts:page-system` | `.Codex/docs/PAGE-SYSTEM.md` |
| 13 | Password Management System Expert | `/experts:password-management-system` | `.Codex/docs/PASSWORD-MANAGEMENT-SYSTEM.md` |
| 14 | Post System Expert | `/experts:post-system` | `.Codex/docs/POST-SYSTEM.md` |
| 15 | Registration System Expert | `/experts:registration-system` | `.Codex/docs/REGISTRATION-SYSTEM.md` |
| 16 | Revision System Expert | `/experts:revision-system` | `.Codex/docs/REVISION-SYSTEM.md` |
| 17 | Role & Capability System Expert | `/experts:role-capability-system` | `.Codex/docs/ROLE-CAPABILITY-SYSTEM.md` |
| 18 | Routing System Expert | `/experts:routing-system` | `.Codex/docs/ROUTING-SYSTEM.md` |
| 19 | RSS/Feed System Expert | `/experts:rss-feed-system` | `.Codex/docs/RSS-FEED-SYSTEM.md` |
| 20 | Search System Expert | `/experts:search-system` | `.Codex/docs/SEARCH-SYSTEM.md` |
| 21 | SEO System Expert | `/experts:seo-system` | `.Codex/docs/SEO-SYSTEM.md` |
| 22 | Settings System Expert | `/experts:settings-system` | `.Codex/docs/SETTINGS-SYSTEM.md` |
| 23 | Site Notification System Expert | `/experts:site-notification-system` | `.Codex/docs/SITE-NOTIFICATION-SYSTEM.md` |
| 24 | Sitemap System Expert | `/experts:sitemap-system` | `.Codex/docs/SITEMAP-SYSTEM.md` |
| 25 | Taxonomy System Expert | `/experts:taxonomy-system` | `.Codex/docs/TAXONOMY-SYSTEM.md` |
| 26 | User Profile System Expert | `/experts:user-profile-system` | `.Codex/docs/USER-PROFILE-SYSTEM.md` |
| 27 | AI Content Generation Expert | `/experts:ai-content-generation` | `.Codex/docs/AI-CONTENT-GENERATION.md` |
| 28 | Analytics System Expert | `/experts:analytics-system` | `.Codex/docs/ANALYTICS-SYSTEM.md` |
| 29 | GA4 Integration System Expert | `/experts:ga4-integration-system` | `.Codex/docs/GA4-INTEGRATION-SYSTEM.md` |
| 30 | Tabbed Editor Shell Expert | `/experts:tabbed-editor-shell` | `.Codex/docs/TABBED-EDITOR-SHELL.md` |

#### Admin UI Experts (4)

| # | Expert | Slash Command | Status | Knowledge Doc |
|---|--------|---------------|--------|---------------|
| 29 | Admin Shell & Navigation UI Expert | `/experts:admin-shell-ui` | Complete | `.Codex/docs/ADMIN-SHELL-UI.md` |
| 30 | Admin List Table UI Expert | `/experts:admin-list-table-ui` | Complete | `.Codex/docs/ADMIN-LIST-TABLE-UI.md` |
| 31 | Admin Editor Layout UI Expert | `/experts:admin-editor-ui` | Complete | `.Codex/docs/ADMIN-EDITOR-UI.md` |
| 32 | Admin Settings & Forms UI Expert | `/experts:admin-settings-ui` | Complete | `.Codex/docs/ADMIN-SETTINGS-UI.md` |

#### Website UI Experts (4)

| # | Expert | Slash Command | Status | Knowledge Doc |
|---|--------|---------------|--------|---------------|
| 33 | Website Layout & Navigation UI Expert | `/experts:website-layout-ui` | Complete | `.Codex/docs/WEBSITE-LAYOUT-UI.md` |
| 34 | Website Blog & Content UI Expert | `/experts:website-blog-ui` | Complete | `.Codex/docs/WEBSITE-BLOG-UI.md` |
| 35 | Website Auth Pages UI Expert | `/experts:website-auth-ui` | Complete | `.Codex/docs/WEBSITE-AUTH-UI.md` |
| 36 | Website User Dashboard UI Expert | `/experts:website-dashboard-ui` | Complete | `.Codex/docs/WEBSITE-DASHBOARD-UI.md` |

#### Infrastructure Experts (1)

| # | Expert | Slash Command | Status | Knowledge Doc |
|---|--------|---------------|--------|---------------|
| 37 | Convex Deployment Expert | `/experts:convex-deployment` | Complete | `.Codex/docs/CONVEX-DEPLOYMENT.md` |

#### Meta Expert (1)

| # | Expert | Slash Command | Status |
|---|--------|---------------|--------|
| 38 | UI Expert Builder | `/experts:ui-expert-builder` | Complete |

### Expert Dispatch Quick Reference

| Task Domain | Expert(s) to Use |
|-------------|-----------------|
| Post/page CRUD, status transitions | `post-system`, `page-system` |
| Editor UI, block editor, metaboxes | `admin-editor-ui`, `content-editor-system` |
| List tables, bulk actions, filters | `admin-list-table-ui` |
| Admin sidebar, admin bar, shell | `admin-shell-ui`, `menu-system` |
| Settings pages, form patterns | `admin-settings-ui`, `settings-system` |
| Auth, login, registration | `website-auth-ui`, `registration-system` |
| Blog, archives, search results | `website-blog-ui` |
| Site header, footer, navigation | `website-layout-ui` |
| User dashboard, profile, account | `website-dashboard-ui`, `user-profile-system` |
| Comments, moderation | `comment-system` |
| Roles, capabilities, permissions | `role-capability-system` |
| Media uploads, library | `media-system` |
| Categories, tags | `taxonomy-system` |
| SEO, meta tags, structured data | `seo-system` |
| Events, hooks, subscribers | `event-dispatcher-system` |
| Emails, transactional messages | `email-notification-system` |
| In-app notifications | `site-notification-system` |
| Audit trail, activity log | `audit-log-system` |
| RSS feeds | `rss-feed-system` |
| Sitemap generation | `sitemap-system` |
| URL routing, 404 handling | `routing-system` |
| API endpoints, external access | `api-system` |
| Custom fields, post meta | `custom-field-system` |
| Search indexing, search queries | `search-system` |
| Revisions, autosave | `revision-system` |
| Password reset, password policies | `password-management-system` |
| AI content generation, structured fields | `ai-content-generation` |
| Built-in page analytics, tracking | `analytics-system` |
| Google Analytics 4 integration | `ga4-integration-system` |
| Tabbed editor shell, per-page dashboards | `tabbed-editor-shell` |

---

## Architecture

### Two Apps, One Database

| App | Framework | Role | Path |
|-----|-----------|------|------|
| **Admin** | TanStack Router + Vite (SPA) | **Convex Owner** | `ConvexPress-Admin/` |
| **Website** | TanStack Start (SSR) | **Convex Consumer** | `ConvexPress-Website/` |

Both are Better-T-Stack Turborepo monorepos:
```
{app}/
├── apps/web/          # The frontend app
├── packages/backend/  # Convex functions & schema
├── packages/config/   # Shared config
└── packages/env/      # Environment variables
```

### Convex Ownership - CRITICAL

**Admin app OWNS the Convex database. Period.**

- Schema lives in `ConvexPress-Admin/packages/backend/`
- All mutations, queries, and actions are defined in admin's backend
- Website app is a **consumer** - it connects via `CONVEX_URL` but NEVER deploys
- There is ONE database serving both apps

**NEVER do these in ConvexPress-Website:**
- `npx convex dev` or `npx convex deploy`
- Create or modify schema files
- Write mutations/queries (they live in admin's backend)

### Authentication

Each app uses its own auth solution:

- **Admin app**: Uses **Convex Auth** (built-in Convex authentication)
- **Website app**: Uses **Clerk** (managed authentication service)

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Admin Frontend** | TanStack Router + Vite | SPA, no SSR needed (behind auth) |
| **Website Frontend** | TanStack Start | SSR for SEO, public pages |
| **Database** | Convex | Real-time, reactive, owned by admin |
| **Auth (Admin)** | Convex Auth | Built-in Convex authentication |
| **Auth (Website)** | Clerk | Managed authentication service |
| **UI Components** | Base UI (`@base-ui/react`) | See UI Rules below |
| **Styling** | Tailwind CSS v4 | With cva, clsx, tailwind-merge |
| **Icons** | Lucide React | |
| **Toasts** | Sonner | |
| **Forms** | TanStack Form | With Zod validation |
| **Email** | Resend | Transactional emails |
| **Package Manager** | Bun | |
| **Monorepo** | Turborepo | |

---

## Convex Backend Conventions - CRITICAL

### Modular Schema System

The Convex schema is **modular**. Each system owns its own schema file. The main `schema.ts` only imports and spreads.

**Directory structure:**
```
ConvexPress-Admin/packages/backend/convex/
├── schema.ts              # Hub file - imports and composes all system schemas
├── schema/                # One file per system
│   ├── users.ts           # users table (User Profile System)
│   ├── roles.ts           # roles table (Role & Capability System)
│   ├── events.ts          # events, eventListeners, eventListenerExecutions (Event Dispatcher)
│   ├── settings.ts        # settings table (Settings System)
│   ├── posts.ts           # posts table (Post System)
│   └── ...                # Each system adds its own file here
```

**How to add a new system's tables:**

1. Create `convex/schema/{system-name}.ts`:
```typescript
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const mySystemTables = {
  myTable: defineTable({
    field: v.string(),
  }).index("by_field", ["field"]),
};
```

2. Add one import + spread to `convex/schema.ts`:
```typescript
import { mySystemTables } from "./schema/mySystem";

export default defineSchema({
  ...existingTables,
  ...mySystemTables,
});
```

**Rules:**
- Each system ONLY creates/modifies its own schema file in `convex/schema/`
- The exported object name follows the pattern `{system}Tables` (e.g., `eventsTables`, `rolesTables`)
- Table names must be globally unique across all systems
- Cross-system references use `v.id("tableName")` - the referenced table may be defined in another system's schema file
- NEVER put table definitions directly in `schema.ts` - always in a modular file
- **System experts NEVER deploy.** They write schema files, write functions, and note gaps. The Convex Deployment Expert (`/experts:convex-deployment`) handles all deployment after experts finish.

### System Function Organization

Each system organizes its Convex functions in a dedicated directory:

```
ConvexPress-Admin/packages/backend/convex/
├── {system}/              # System directory
│   ├── mutations.ts       # Public mutations
│   ├── queries.ts         # Public queries
│   ├── internals.ts       # Internal functions (not client-callable)
│   └── validators.ts      # Shared argument validators
├── helpers/               # Shared helpers (cross-system)
│   ├── auth.ts            # Auth helpers (getCurrentUser, requireAuth)
│   ├── permissions.ts     # Permission helpers (requireCan, currentUserCan)
│   ├── events.ts          # Event emission helper (emitEvent)
│   └── ...
```

### Deployment Strategy

**During incremental development**, deploy with TypeScript checking disabled:
```bash
npx convex deploy --typecheck=disable
```

This is necessary because:
- System A's schema may reference System B's table before System B's functions exist
- Helper imports may reference functions not yet written
- This is a known Convex development pattern during incremental builds

**For production**, always deploy with full type checking enabled.

### Convex Function Patterns

**Mutations** (write operations):
```typescript
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.create");
    // ... implementation
  },
});
```

**Queries** (read operations):
```typescript
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    // ... implementation
  },
});
```

**Internal functions** (system-to-system, not client-callable):
```typescript
import { internalMutation, internalQuery } from "../_generated/server";

export const processEvent = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // ... implementation
  },
});
```

---

## UI Rules - CRITICAL

### Base UI Only
- Use `@base-ui/react` for all interactive components
- **NEVER use Radix** - no `@radix-ui/*` packages, ever
- A specific Base UI template will be provided before implementation begins
- Adhere strictly to that template's patterns and component structure

### No Popups for Content Management
- **NEVER use modals/dialogs/popups** for managing content (editing posts, users, comments, etc.)
- Everything opens as a **full page**
- Click "Edit Post" -> navigates to `/admin/posts/$postId/edit` (a full page)
- Click "Add New User" -> navigates to `/admin/users/new` (a full page)
- Confirmation dialogs for destructive actions (delete, trash) are the ONLY acceptable popup

### WordPress-Modeled Admin UI
The admin backend mirrors WordPress's layout and structure:
- **Left sidebar navigation** with collapsible sections
- **Top admin bar** with user menu, notifications
- Page names and navigation labels match WordPress conventions:
  - "All Posts", "Add New Post", "Categories", "Tags"
  - "Media Library", "Add New"
  - "All Pages", "Add New Page"
  - "Comments" (with pending count badge)
  - "Users", "Add New User", "Your Profile"
  - "Settings" with sub-pages (General, Reading, Writing, Discussion, Permalinks, Privacy)
- WordPress-style list tables for content listings (bulk actions, filters, pagination)
- WordPress-style metaboxes on edit screens (publish box, categories, tags, featured image)

### No Hardcoded Colors
Never use zinc, slate, gray, or any hardcoded Tailwind color names.
- Use CSS variables (`bg-card`, `bg-muted`, etc.)
- Use opacity modifiers (`bg-black/40`)
- Match existing patterns in the codebase

---

## Airtable Blueprint

The complete system architecture is stored in Airtable base `appqpJ8QQkoKsH02O`:

| Table | ID | Records |
|-------|----|---------|
| Systems | `tblmiSawf6mIf56V8` | 28 |
| System Experts | `tblTubYOAFng8uVi6` | 28 |
| Roles | `tblquj6encuzq7p1f` | 5 |
| Routes | `tblgdxTFKRbmuQ2qx` | 70 |
| Actions | `tblQTSboBXFiXSP3O` | 137 |
| Events | `tblDQOlXXJO1aQapT` | 63 |
| Action Types | `tblTSUt0pggw74Xt6` | 12 |
| Event Types | `tbl2RMo2n83E31o5q` | 8 |
| Email Notifications | `tbl5UW9iMJynfVUGG` | 25 |
| Site Notifications | `tblAQZWvnLT4ygl0j` | 30 |

This is the **source of truth** for all systems, capabilities, routes, events, and notifications.

---

## Project Structure

```
ConvexPress/
├── .Codex/
│   ├── AGENTS.md              # This file
│   ├── docs/                  # Expert knowledge documents (28 systems)
│   └── commands/              # Slash commands (experts, PRD creator, etc.)
├── ConvexPress-Admin/                 # Admin SPA (Convex OWNER)
│   ├── apps/web/              # TanStack Router frontend
│   │   └── src/
│   │       ├── routes/        # TanStack Router file-based routes
│   │       ├── components/    # UI components
│   │       ├── hooks/         # React hooks
│   │       └── lib/           # Utilities, context providers
│   └── packages/backend/      # Convex schema + functions
│       └── convex/
│           ├── schema.ts      # Hub - imports and spreads all system schemas
│           ├── schema/        # Modular schema files (one per system)
│           │   ├── users.ts
│           │   ├── roles.ts
│           │   └── ...
│           ├── helpers/       # Shared helpers (auth, permissions, events)
│           ├── {system}/      # Per-system function directories
│           │   ├── mutations.ts
│           │   ├── queries.ts
│           │   └── internals.ts
│           └── _generated/    # Auto-generated by Convex (never edit)
├── ConvexPress-Website/               # Website SSR (Convex CONSUMER)
│   ├── apps/web/              # TanStack Start frontend
│   └── packages/backend/      # Type generation only
└── specs/ConvexPress/
    ├── PRD.md                 # Master PRD
    └── systems/               # Per-system PRDs (28 folders)
```

---

## Roles (WordPress-Standard)

| Role | Level | Can Do |
|------|-------|--------|
| Administrator | 100 | Everything |
| Editor | 80 | All content + moderation, no settings/users |
| Author | 60 | Own posts + media, publish own |
| Contributor | 40 | Own drafts only, no publish/upload |
| Subscriber | 20 | Read + profile + comments |

---

## Development Workflow

### The Expert Pipeline
1. **PRD Phase**: Write detailed system PRD (modeled after WordPress, adapted for our stack)
2. **Expert Phase**: Build system expert from PRD + code analysis
3. **Implementation Phase**: Expert implements the system
4. **Maintenance Phase**: Expert maintains, debugs, audits the system ongoing

### Commands
- `/create-prd {system-name}` - Generate a detailed PRD for a system
- More commands will be added as the expert system grows

---

## Critical Reminders

1. **Admin owns Convex** - Never deploy from ConvexPress-Website
2. **Base UI only** - Never import from @radix-ui
3. **Full pages, not popups** - Content management is always full-page navigation
4. **WordPress patterns** - When in doubt, do it the way WordPress does it
5. **Use your experts** - Don't do expert-level work yourself; delegate
6. **Airtable is truth** - The blueprint in Airtable defines what exists and how it connects
7. **System experts NEVER deploy** - They write code only. The Convex Deployment Expert deploys after each phase.
8. **Modular schema** - Every system's tables go in `convex/schema/{system}.ts`, never directly in `schema.ts`
