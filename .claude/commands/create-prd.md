# Create System PRD

You are a **PRD Expert** - a specialist in writing detailed Product Requirements Documents for CMS systems modeled after WordPress.

## Your Mission

Write a comprehensive, implementation-ready PRD for the system: **$ARGUMENTS**

## Context

ConvexPress is a WordPress replacement CMS. Every system is modeled after how WordPress implements it, but built with:
- **Convex** (real-time database, serverless functions)
- **TanStack Router + Vite** (admin SPA)
- **TanStack Start** (website SSR)
- **Convex Auth** (auth)
- **Base UI** (`@base-ui/react` - NOT Radix)
- **Tailwind CSS v4**

The admin UI mirrors WordPress's backend: left sidebar nav, full-page content management (no modals), WordPress-style list tables, metaboxes on edit screens, and matching terminology.

## Step 1: Gather System Data from Airtable

Query the Airtable blueprint (base `appqpJ8QQkoKsH02O`) to get all data for this system:

1. **System record** from Systems table (`tblmiSawf6mIf56V8`) - get dependencies, priority, complexity
2. **Routes** from Routes table (`tblgdxTFKRbmuQ2qx`) - filter by this system's linked records
3. **Actions** from Actions table (`tblQTSboBXFiXSP3O`) - filter by this system's linked records
4. **Events** from Events table (`tblDQOlXXJO1aQapT`) - filter by this system's linked records
5. **Email Notifications** from table `tbl5UW9iMJynfVUGG` - filter by this system
6. **Site Notifications** from table `tblAQZWvnLT4ygl0j` - filter by this system
7. **Roles** from table `tblquj6encuzq7p1f` - to understand capability assignments

## Step 2: Research WordPress's Implementation

You already know WordPress deeply. For this system, recall:

- **Database schema**: What tables does WordPress use? (e.g., `wp_posts`, `wp_postmeta`, `wp_comments`)
- **Core functions**: What are the key WordPress functions? (e.g., `wp_insert_post()`, `get_posts()`, `wp_update_post()`)
- **Hooks/filters**: What action and filter hooks does WordPress fire? (e.g., `save_post`, `publish_post`, `pre_get_posts`)
- **Admin screens**: How does the WordPress admin UI work for this feature?
- **REST API**: What endpoints does WordPress provide?
- **User capabilities**: What caps does WordPress check? (e.g., `edit_posts`, `publish_posts`, `delete_others_posts`)
- **Edge cases and gotchas**: What are the tricky parts WordPress handles?

This WordPress knowledge is your foundation. Then adapt it for Convex + TanStack.

## Step 3: Write the PRD

Write the PRD to the system's file at `specs/ConvexPress/systems/{system-slug}/PRD.md`.

### PRD Structure

```markdown
# {System Name} - Product Requirements Document

**Version:** 1.0
**Created:** {today's date}
**Status:** Complete
**Parent PRD:** [ConvexPress PRD](../PRD.md)
**WordPress Equivalent:** {WordPress feature/subsystem name}

---

## Overview

{What this system does. 2-3 paragraphs. Reference the WordPress equivalent and explain how ConvexPress's version works.}

---

## WordPress Reference

### Database Tables (WordPress)
{List the WP tables this maps to and their key columns}

### Core Functions (WordPress)
{List the key WP functions and what they do}

### Admin Screens (WordPress)
{Describe the WP admin UI for this feature}

### Hooks & Filters (WordPress)
{Key WordPress hooks that fire during this system's operations}

---

## Convex Schema

### Tables
{Define every Convex table this system needs, with full field definitions}

```typescript
// Example - adapt for the actual system
defineTable({
  field: v.string(),
  // ... all fields with types
})
.index("by_field", ["field"])
```

### Indexes
{List all indexes needed and why}

### Relationships
{How this system's tables relate to other systems' tables}

---

## Actions (Convex Functions)

For each action from the Airtable blueprint, define:

### {action.name}
- **Action Code:** `{action.code}`
- **Type:** {mutation | query | action}
- **Auth Required:** {yes/no}
- **Capabilities:** {which roles can do this}
- **Input Schema:**
  ```typescript
  args: {
    // Zod-validated input
  }
  ```
- **Behavior:**
  1. {Step-by-step logic}
  2. {Validation rules}
  3. {Side effects}
- **Events Emitted:** `{event.code}`
- **Error Cases:**
  - {error scenario} -> {how to handle}

---

## Events

For each event from the Airtable blueprint:

### {event.name} (`{event.code}`)
- **Triggered By:** `{action.code}`
- **Payload:**
  ```typescript
  {
    // typed payload
  }
  ```
- **Subscribers:**
  - Email: {which email notifications}
  - Site: {which site notifications}
  - Side Effects: {other things that happen}

---

## Routes & UI

### Admin Routes
For each admin route from the Airtable blueprint:

#### {route.name} (`{route.path}`)
- **Purpose:** {what this page does}
- **Layout:** WordPress-style {describe the layout}
- **Components:**
  - {component 1} - {what it does}
  - {component 2} - {what it does}
- **Data Requirements:** {what Convex queries power this page}
- **User Interactions:**
  - {interaction 1} -> {what happens}
  - {interaction 2} -> {what happens}

### Website Routes
{Same for any website-facing routes}

---

## Notifications

### Email Notifications
For each from Airtable:
- **{name}**: Sent when {event}. Template: {subject}. Recipients: {who}.

### Site Notifications
For each from Airtable:
- **{name}**: Shown when {event}. Type: {success|info|warning|error}. Persistent: {yes|no}.

---

## Role & Capability Matrix

| Action | Admin | Editor | Author | Contributor | Subscriber |
|--------|-------|--------|--------|-------------|-----------|
| {action} | {yes/no/own} | ... | ... | ... | ... |

---

## Dependencies

### Systems This Depends On
{List with explanation of what's needed from each}

### Systems That Depend On This
{List with explanation}

---

## Implementation Notes

### Convex-Specific Considerations
{How to handle real-time updates, optimistic UI, etc.}

### WordPress Differences
{Where ConvexPress deliberately differs from WordPress and why}

### Edge Cases
{Tricky scenarios to handle correctly}

### Performance Considerations
{Indexing strategy, pagination, caching}

---

## File Inventory (Planned)

### Backend (ConvexPress-Admin/packages/backend/)
- `convex/{system}/schema.ts` - Table definitions
- `convex/{system}/queries.ts` - Read operations
- `convex/{system}/mutations.ts` - Write operations
- `convex/{system}/actions.ts` - External integrations (if any)
- `convex/{system}/helpers.ts` - Shared logic

### Admin Frontend (ConvexPress-Admin/apps/web/)
- `src/routes/admin/{system}/` - Route files
- `src/components/{system}/` - System-specific components

### Website Frontend (ConvexPress-Website/apps/web/)
- `src/routes/{relevant-routes}/` - Public-facing routes
- `src/components/{system}/` - Public components
```

## Step 4: Update Airtable

After writing the PRD:
1. Update the System Expert record's Status to "Analyzing" in the System Experts table
2. Update the Last Analyzed date to today

## Quality Standards

- **Be exhaustive** - Every action, event, route, and notification must be fully specified
- **Be precise** - Include TypeScript types, exact field names, specific validation rules
- **Be WordPress-faithful** - If WordPress does it a certain way, follow that pattern unless there's a clear technical reason to deviate
- **Be implementation-ready** - An expert should be able to implement directly from this PRD without asking questions
- **Think about real-time** - Convex is reactive; describe how UI updates when data changes
- **Think about permissions** - Every operation must check capabilities
- **Think about events** - Every mutation must emit the appropriate events
