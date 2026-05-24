# Knowledge Base, Ticket System & Support Bridge — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Three new ConvexPress systems — Knowledge Base, Ticket System, and Support Bridge

---

## Overview

ConvexPress gains two enterprise-grade systems as default template features: a full-featured Knowledge Base for documentation/help content and a production-quality Ticket System for user support. A thin Support Bridge layer connects them via AI-powered deflection and a floating support widget, without coupling either system.

### Design Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full enterprise (Option B) | Template should be best-in-class out of the box |
| KB source | modSanctum (rebuilt, not copied) | Richest feature set; strip game-mod specifics, unify naming |
| Ticket source | EasyEntity (foundation) + modSanctum QoL | Cleanest general-purpose architecture |
| Architecture | Independent systems + bridge (Option C) | Matches ConvexPress modular pattern; each system stands alone |
| Search | Full stack — Convex + Meilisearch + RAG | Convex-native works by default; Meilisearch and RAG are opt-in |
| AI deflection | On by default, toggleable in settings | Reduces ticket volume; respects operator choice |
| Content editor | Shared TipTap editor (Option A) | Same editor as posts/pages; switch to independent config if needed |
| Editorial workflows | Yes | Differentiator over WordPress (needs plugins there) |
| Collections/learning paths | Yes | Separates a real KB from a blog with categories |
| Article templates | Yes | Low effort, high value for authors |
| Floating support widget | Yes | Killer UX tying KB + tickets together |
| Localization | No | Massive complexity; can be added as a future dedicated system |
| KB-specific API/webhooks | No | ConvexPress API System already handles external access |

### Reference Projects

- **modSanctum** (`/Users/worsin/Development/modSanctum`) — KB: 37 tables, 125+ functions, enterprise-grade. Ticket: multi-tiered, mod-specific.
- **EasyEntity** (`/Users/worsin/Development/EZ-Entity-Setup`) — KB: clean with Meilisearch + RAG. Ticket: general-purpose, production-ready with AI deflection and support widget.

---

## System 1: Knowledge Base

### Schema (`convex/schema/kb.ts`)

19 tables, all prefixed `kb_`. Exports `kbTables` object for spreading into `schema.ts`.

#### Core Content

**`kb_articles`**
```
Fields:
  title: string
  slug: string (unique)
  excerpt: string
  content: string (TipTap JSON)
  contentPlainText: string (extracted for search)
  status: "draft" | "review" | "published" | "archived"
  authorId: Id<"users">
  contributors: array of Id<"users">
  categoryId: optional Id<"kb_categories">
  parentArticleId: optional Id<"kb_articles">
  metaTitle: optional string
  metaDescription: optional string
  keywords: array of string
  featuredImageId: optional Id<"media">
  scheduledAt: optional number
  publishedAt: optional number
  viewCount: number (denormalized)
  uniqueViewCount: number (denormalized)
  helpfulVotes: number (denormalized)
  notHelpfulVotes: number (denormalized)
  readingTimeMinutes: number
  version: number
  lastMajorUpdate: optional number
  isFeatured: boolean
  sortOrder: number
  meilisearchSynced: boolean
  meilisearchSyncedAt: optional number
  ragSynced: boolean
  ragSyncedAt: optional number
  createdAt: number
  updatedAt: number

Indexes:
  by_slug: [slug]
  by_status: [status]
  by_author: [authorId]
  by_category: [categoryId]
  by_parent: [parentArticleId]
  by_published: [publishedAt]
  by_scheduled: [scheduledAt]
  by_featured: [isFeatured]
  by_views: [viewCount]
  by_status_updated: [status, updatedAt]
  by_meilisearch_sync: [meilisearchSynced]
  by_rag_sync: [ragSynced]
  search_articles: searchIndex on [contentPlainText]
```

**`kb_articleVersions`**
```
Fields:
  articleId: Id<"kb_articles">
  version: number
  title: string
  content: string (TipTap JSON)
  changeSummary: string
  authorId: Id<"users">
  createdAt: number

Indexes:
  by_article: [articleId]
  by_article_version: [articleId, version]
```

**`kb_categories`**
```
Fields:
  name: string
  slug: string
  description: optional string
  icon: optional string
  parentId: optional Id<"kb_categories">
  order: number
  isActive: boolean
  isPublished: boolean
  articleCount: number (denormalized)
  createdAt: number
  updatedAt: number

Indexes:
  by_slug: [slug]
  by_parent: [parentId]
  by_order: [order]
  by_published: [isPublished]
  by_published_order: [isPublished, order]
```

**`kb_tags`**
```
Fields:
  name: string
  slug: string
  description: optional string
  color: optional string
  articleCount: number (denormalized)
  createdAt: number
  updatedAt: number

Indexes:
  by_slug: [slug]
  by_count: [articleCount]
```

#### Relationships

**`kb_articleTags`**
```
Fields:
  articleId: Id<"kb_articles">
  tagId: Id<"kb_tags">
  createdAt: number

Indexes:
  by_article: [articleId]
  by_tag: [tagId]
  by_article_tag: [articleId, tagId]
```

**`kb_relatedArticles`**
```
Fields:
  sourceArticleId: Id<"kb_articles">
  relatedArticleId: Id<"kb_articles">
  relationType: "related" | "prerequisite" | "followUp" | "alternative"
  createdAt: number

Indexes:
  by_source: [sourceArticleId]
  by_related: [relatedArticleId]
  by_source_related: [sourceArticleId, relatedArticleId]
```

**`kb_collectionArticles`**
```
Fields:
  collectionId: Id<"kb_collections">
  articleId: Id<"kb_articles">
  order: number
  addedBy: Id<"users">
  addedAt: number

Indexes:
  by_collection: [collectionId]
  by_article: [articleId]
  by_collection_order: [collectionId, order]
```

#### Collections & Templates

**`kb_collections`**
```
Fields:
  name: string
  slug: string
  description: optional string
  coverImageId: optional Id<"media">
  type: "manual" | "series" | "learningPath"
  isPublic: boolean
  articleCount: number (denormalized)
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number

Indexes:
  by_slug: [slug]
  by_type: [type]
  by_public: [isPublic]
```

**`kb_templates`**
```
Fields:
  name: string
  slug: string
  description: optional string
  content: string (TipTap JSON)
  category: "article" | "faq" | "tutorial" | "howTo" | "troubleshooting" | "changelog"
  isDefault: boolean
  isActive: boolean
  usageCount: number
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number

Indexes:
  by_slug: [slug]
  by_category: [category]
  by_active: [isActive]
```

#### User Engagement

**`kb_articleFeedback`**
```
Fields:
  articleId: Id<"kb_articles">
  userId: optional Id<"users">
  sessionId: string
  isHelpful: boolean
  rating: optional number (1-5)
  comment: optional string
  createdAt: number

Indexes:
  by_article: [articleId]
  by_user: [userId]
  by_session_article: [sessionId, articleId]
```

**`kb_bookmarks`**
```
Fields:
  userId: Id<"users">
  articleId: Id<"kb_articles">
  notes: optional string
  createdAt: number

Indexes:
  by_user: [userId]
  by_article: [articleId]
  by_user_article: [userId, articleId]
```

**`kb_userProgress`**
```
Fields:
  userId: Id<"users">
  articleId: Id<"kb_articles">
  progressPercent: number
  scrollPosition: number
  lastReadAt: number
  readTime: number (seconds)
  completedRead: boolean

Indexes:
  by_user: [userId]
  by_article: [articleId]
  by_user_article: [userId, articleId]
  by_user_recent: [userId, lastReadAt]
```

#### Analytics

**`kb_pageViews`**
```
Fields:
  articleId: Id<"kb_articles">
  userId: optional Id<"users">
  sessionId: string
  referrer: optional string
  userAgent: optional string
  duration: optional number (seconds)
  createdAt: number

Indexes:
  by_article: [articleId]
  by_user: [userId]
  by_session: [sessionId]
  by_date: [createdAt]
```

**`kb_searchQueries`**
```
Fields:
  query: string
  resultCount: number
  userId: optional Id<"users">
  clickedArticleId: optional Id<"kb_articles">
  source: "convex" | "meilisearch" | "rag"
  createdAt: number

Indexes:
  by_date: [createdAt]
  by_user: [userId]
  by_article: [clickedArticleId]
```

#### Editorial Workflows

**`kb_workflows`**
```
Fields:
  name: string
  description: optional string
  steps: array of {
    name: string
    type: "approval" | "review" | "auto"
    assigneeRole: optional string
    assigneeId: optional Id<"users">
    requiredApprovals: number
  }
  isDefault: boolean
  isActive: boolean
  createdAt: number
  updatedAt: number

Indexes:
  by_default: [isDefault]
  by_active: [isActive]
```

**`kb_articleWorkflows`**
```
Fields:
  articleId: Id<"kb_articles">
  workflowId: Id<"kb_workflows">
  currentStep: number
  status: "inProgress" | "pendingReview" | "approved" | "rejected"
  assigneeId: optional Id<"users">
  dueDate: optional number
  approvals: array of Id<"users">
  createdAt: number
  updatedAt: number

Indexes:
  by_article: [articleId]
  by_assignee: [assigneeId]
  by_status: [status]
  by_due_date: [dueDate]
```

#### Moderation

**`kb_comments`**
```
Fields:
  articleId: Id<"kb_articles">
  userId: Id<"users">
  parentId: optional Id<"kb_comments"> (2-level nesting max)
  content: string
  isApproved: boolean
  isEdited: boolean
  isDeleted: boolean
  upvotes: number (denormalized)
  downvotes: number (denormalized)
  createdAt: number
  updatedAt: number

Indexes:
  by_article: [articleId]
  by_parent: [parentId]
  by_user: [userId]
  by_approved: [isApproved]
```

**`kb_commentVotes`**
```
Fields:
  commentId: Id<"kb_comments">
  userId: Id<"users">
  voteType: "up" | "down"
  createdAt: number

Indexes:
  by_comment: [commentId]
  by_user: [userId]
  by_user_comment: [userId, commentId]
```

#### Search Infrastructure

**`kb_ragChunks`**
```
Fields:
  articleId: Id<"kb_articles">
  articleSlug: string
  content: string (chunk text)
  chunkIndex: number
  embedding: array of number (vector)
  metadata: object (cached article info: title, categorySlug, excerpt)
  createdAt: number
  updatedAt: number

Indexes:
  by_article: [articleId]
  by_article_slug: [articleSlug]
```

### Backend Functions (`convex/kb/`)

```
convex/kb/
  articles.ts       — CRUD, publish, archive, version, feature toggle
  categories.ts     — CRUD, reorder, hierarchy queries
  tags.ts           — CRUD, article tagging/untagging
  collections.ts    — CRUD, article ordering, type management
  templates.ts      — CRUD, usage tracking
  comments.ts       — CRUD, threading, voting, moderation
  feedback.ts       — Submit helpful/not-helpful, star ratings
  bookmarks.ts      — Toggle, list with article details
  progress.ts       — Track reading progress, history
  workflows.ts      — CRUD, start/advance/approve/reject workflow steps
  analytics.ts      — Page views, search logging, dashboard stats
  search.ts         — Convex-native search, Meilisearch proxy, RAG search
  settings.ts       — KB-specific settings (registered in Settings System)
  validators.ts     — Shared argument validators
  internals.ts      — Internal functions (sync triggers, cleanup jobs)
  helpers/
    auth.ts         — KB permission checks (wraps existing requireCan)
    utils.ts        — Slug generation, plaintext extraction, reading time calc
```

### Key Function Patterns

**Article lifecycle:**
```
Create (draft) → Edit/Version → Submit for review (workflow) → Approve → Publish → Archive
                                                              → Reject → Back to draft
```

**Search cascade (graceful degradation):**
```
1. Always: Convex searchIndex on contentPlainText
2. If Meilisearch configured: typo-tolerant keyword search (better relevance)
3. If RAG configured: semantic search (conceptual matching)
Results merged and deduplicated, best source wins per article.
```

**View tracking (session-debounced):**
```
User visits article → Check sessionId+articleId in recent views
  → If not seen in last 30 min: record view, increment viewCount
  → If seen: skip (prevents refresh inflation)
```

### Admin Routes

```
/admin/kb                          → Article list (WordPress-style list table)
/admin/kb/new                      → New article (template picker → shared TipTap editor)
/admin/kb/$articleId/edit          → Edit article
/admin/kb/categories               → Category management (tree view)
/admin/kb/tags                     → Tag management
/admin/kb/collections              → Collections/learning paths
/admin/kb/templates                → Article template management
/admin/kb/workflows                → Editorial workflow configuration
/admin/kb/analytics                → KB analytics dashboard
/admin/kb/settings                 → KB-specific settings
```

### Website Routes

```
/help                              → KB homepage (search bar + categories + featured articles)
/help/$categorySlug                → Category article listing
/help/$categorySlug/$articleSlug   → Article reader (with feedback, comments, progress, bookmarks)
/help/search                       → Search results page
/help/collections/$slug            → Collection/learning path view (ordered articles)
```

---

## System 2: Ticket System

### Schema (`convex/schema/tickets.ts`)

6 tables, all prefixed `ticket_`. Exports `ticketTables` object for spreading into `schema.ts`.

#### Core

**`ticket_tickets`**
```
Fields:
  ticketNumber: string ("TKT-YYYYMM-XXXXX")
  userId: Id<"users">
  userEmailSnapshot: string
  userNameSnapshot: string
  subject: string
  description: string
  category: "billing" | "technical" | "account" | "featureRequest" | "general" | "other"
  status: "open" | "awaitingResponse" | "inProgress" | "resolved" | "closed"
  priority: "low" | "medium" | "high" | "urgent"
  assignedTo: optional Id<"users">
  assignedAt: optional number
  source: "widget" | "email" | "dashboard" | "api"
  tags: array of string
  aiAttempted: boolean
  aiQuery: optional string
  aiResponse: optional string
  kbArticlesShown: optional array of string (article IDs stored as strings for schema independence)
  rating: optional number (1-5)
  ratingComment: optional string
  messageCount: number (denormalized)
  lastMessageAt: optional number
  firstResponseAt: optional number
  resolvedAt: optional number
  closedAt: optional number
  createdAt: number
  updatedAt: number

Indexes:
  by_user: [userId]
  by_status: [status]
  by_priority: [priority]
  by_assigned: [assignedTo]
  by_category: [category]
  by_ticket_number: [ticketNumber]
  by_status_priority: [status, priority]
  by_assigned_status: [assignedTo, status, priority]
  by_status_priority_created: [status, priority, createdAt]
  by_created: [createdAt]
  by_first_response: [firstResponseAt, status]
  by_last_message: [lastMessageAt]
```

**`ticket_messages`**
```
Fields:
  ticketId: Id<"ticket_tickets">
  sequence: number (guaranteed ordering)
  senderType: "user" | "admin" | "system" | "ai"
  senderId: optional Id<"users">
  senderName: string
  senderEmail: optional string
  content: string (markdown)
  isInternal: boolean (hidden from ticket owner)
  attachments: optional array of {
    name: string
    storageId: Id<"_storage">
    mimeType: string
    size: number
  }
  createdAt: number
  editedAt: optional number

Indexes:
  by_ticket: [ticketId]
  by_ticket_time: [ticketId, createdAt]
  by_ticket_sequence: [ticketId, sequence]
  by_sender: [senderId]
```

**`ticket_counters`**
```
Fields:
  year: number
  month: number
  counter: number

Indexes:
  by_year_month: [year, month]
```

#### Admin Tools

**`ticket_cannedResponses`**
```
Fields:
  title: string
  shortcut: string (e.g., "/refund")
  content: string (supports {{variable}} substitution)
  category: string
  usageCount: number
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number

Indexes:
  by_shortcut: [shortcut]
  by_category: [category]
```

#### Security

**`ticket_sessions`**
```
Fields:
  sessionId: string (crypto-random)
  userId: optional Id<"users">
  createdAt: number
  expiresAt: number (24hr TTL)
  lastActivityAt: number

Indexes:
  by_session_id: [sessionId]
  by_expires: [expiresAt]
  by_user: [userId]
```

**`ticket_rateLimits`**
```
Fields:
  sessionId: string
  action: "aiQuery" | "ticketCreate" | "search"
  userId: optional string
  createdAt: number

Indexes:
  by_session_action: [sessionId, action]
  by_action_time: [action, createdAt]
  by_created: [createdAt]
```

### Backend Functions (`convex/tickets/`)

```
convex/tickets/
  tickets.ts         — Create, reply, update status/priority, assign, close, reopen
  messages.ts        — Thread management, edit, delete, internal notes, system messages
  cannedResponses.ts — CRUD, search, template variable substitution, usage tracking
  sessions.ts        — Create, validate, touch, associate user, cleanup
  rateLimit.ts       — Check, record, cleanup, global stats
  analytics.ts       — Stats dashboard (counts by status/priority, avg response time, SLA)
  settings.ts        — Ticket-specific settings
  validators.ts      — Shared argument validators
  internals.ts       — Internal functions (counter increment, session cleanup cron)
```

### Key Function Patterns

**Ticket creation with sequential numbering:**
```
1. Atomic counter increment: ticket_counters[year][month].counter++
2. Format: TKT-{YYYYMM}-{counter padded to 5 digits}
3. Create ticket with snapshot of user email/name at creation time
```

**Auto-status transitions:**
```
User replies to "awaitingResponse" ticket → status becomes "open"
Admin replies to "open" ticket → status becomes "awaitingResponse"
Admin explicitly resolves → status becomes "resolved"
Auto-close resolved tickets after N days (configurable) → "closed"
```

**Message sequence ordering:**
```
Each message gets an incrementing sequence number per ticket.
Query by ticket_sequence index, not createdAt.
Avoids timestamp collision issues in real-time systems.
```

**Internal notes:**
```
Messages with isInternal=true are filtered out of all user-facing queries.
Only visible to users with ticket.viewInternalNotes capability.
```

**Canned responses:**
```
Admin types "/refund" → matches shortcut → inserts template content
Template supports {{variables}}: {{userName}}, {{ticketNumber}}, {{category}}
Usage count incremented on each insertion for analytics.
```

### Admin Routes

```
/admin/tickets                     → Ticket queue (filterable by status, priority, category, assignee)
/admin/tickets/$ticketId           → Ticket detail + message thread + sidebar metadata
/admin/tickets/canned-responses    → Manage canned response templates
/admin/tickets/analytics           → Ticket analytics dashboard
/admin/tickets/settings            → Categories, SLA targets, auto-close config
```

### Website Routes

```
/support                           → Support landing page
/support/tickets                   → My tickets list
/support/tickets/$ticketId         → Ticket thread view
/support/new                       → Create ticket (with AI deflection flow if enabled)
```

---

## System 3: Support Bridge

### Schema (`convex/schema/support.ts`)

1 table, prefixed `support_`. Exports `supportTables` object. This entire system is optional — removing it leaves KB and Tickets fully functional independently. Widget configuration uses the Settings System (`support.widget` group) rather than a dedicated table.

**`support_deflectionLogs`**
```
Fields:
  sessionId: string
  userId: optional Id<"users">
  query: string
  aiResponse: string
  kbArticleIds: array of Id<"kb_articles">
  outcome: "helpful" | "notHelpful" | "escalated" | "abandoned"
  ticketId: optional Id<"ticket_tickets">
  responseLatencyMs: number
  tokensUsed: optional number
  createdAt: number

Indexes:
  by_session: [sessionId]
  by_user: [userId]
  by_outcome: [outcome]
  by_date: [createdAt]
  by_ticket: [ticketId]
```

*Widget configuration lives in the Settings System (`support.widget` and `support.ai` groups) — no dedicated table needed.*

### Backend Functions (`convex/support/`)

```
convex/support/
  deflection.ts     — AI answer generation (KB search → AI → response)
  widget.ts         — Widget config, user's recent tickets
  analytics.ts      — Deflection stats, unanswered query tracking
  internals.ts      — Cleanup, aggregation jobs
```

### AI Deflection Flow

```
1. User opens widget, types question
2. deflection.generateAnswer action:
   a. Search KB via Convex searchIndex (always available)
   b. If Meilisearch configured: also search via Meilisearch for better relevance
   c. If RAG configured: also search via vector similarity for semantic matches
   d. Merge and deduplicate results, take top 5 articles
   e. If AI provider configured: generate natural language answer from article context
   f. If no AI provider: return article list directly (graceful degradation)
   g. Return { answer, sourceArticles, confidence }
3. User sees answer + source articles + "Did this help?"
   → "Yes" → logInteraction(outcome: helpful)
   → "No, I need help" → logInteraction(outcome: escalated)
     → Ticket form pre-filled with:
       - subject: original query
       - description: "I asked: {query}\nAI suggested: {answer}\nThis didn't resolve my issue."
       - aiAttempted: true, aiQuery, aiResponse, kbArticlesShown
     → User submits ticket
     → deflectionLog updated with ticketId
```

### Floating Support Widget (Website)

A React component rendered on all website pages (when enabled).

**States (state machine):**
```
Closed → Home → Search → AIAnswer → TicketForm → TicketList → TicketDetail
                  ↓                       ↑
                  → SearchResults ─────────┘ (if "still need help")
```

**Components:**
```
SupportWidget.tsx        — Main orchestrator, state machine
WidgetButton.tsx         — Floating button with unread badge
WidgetPanel.tsx          — Slide-up panel container
views/
  HomeView.tsx           — Welcome + quick actions (search, my tickets, new ticket)
  SearchResultsView.tsx  — KB article results
  AIAnswerView.tsx       — AI-generated answer + source articles + feedback
  TicketFormView.tsx     — Create ticket (pre-filled if escalated from AI)
  TicketListView.tsx     — User's recent tickets
  TicketDetailView.tsx   — Ticket thread in widget
hooks/
  useWidgetState.ts      — State machine logic
  useSessionId.ts        — Session persistence
```

---

## Integration Points

### Permissions (Role & Capability System)

New capabilities registered in the existing system:

**KB capabilities:**
- `kb.view` — View published articles (all roles)
- `kb.create` — Create new articles
- `kb.edit` — Edit any article
- `kb.editOwn` — Edit own articles only
- `kb.delete` — Delete articles
- `kb.publish` — Publish/unpublish articles
- `kb.manageCategories` — CRUD categories
- `kb.manageTags` — CRUD tags
- `kb.manageCollections` — CRUD collections/learning paths
- `kb.manageWorkflows` — Configure editorial workflows
- `kb.manageTemplates` — CRUD article templates
- `kb.moderateComments` — Approve/delete KB comments
- `kb.viewAnalytics` — View KB analytics dashboard

**Ticket capabilities:**
- `ticket.view` — View own tickets (all authenticated users)
- `ticket.viewAll` — View all tickets (support staff)
- `ticket.respond` — Reply to tickets
- `ticket.assign` — Assign tickets to staff
- `ticket.updateStatus` — Change ticket status
- `ticket.updatePriority` — Change ticket priority
- `ticket.close` — Force close tickets
- `ticket.manageCannedResponses` — CRUD canned response templates
- `ticket.viewAnalytics` — View ticket analytics
- `ticket.viewInternalNotes` — See internal notes on tickets

**Default role mapping:**

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|-----------|--------------|--------|--------|-------------|------------|
| kb.view | Yes | Yes | Yes | Yes | Yes |
| kb.create | Yes | Yes | Yes | Yes (drafts) | - |
| kb.edit | Yes | Yes | - | - | - |
| kb.editOwn | Yes | Yes | Yes | Yes | - |
| kb.delete | Yes | Yes | - | - | - |
| kb.publish | Yes | Yes | - | - | - |
| kb.manageCategories | Yes | Yes | - | - | - |
| kb.manageTags | Yes | Yes | - | - | - |
| kb.manageCollections | Yes | - | - | - | - |
| kb.manageWorkflows | Yes | - | - | - | - |
| kb.manageTemplates | Yes | - | - | - | - |
| kb.moderateComments | Yes | Yes | - | - | - |
| kb.viewAnalytics | Yes | Yes | - | - | - |
| ticket.view | Yes | Yes | Yes | Yes | Yes |
| ticket.viewAll | Yes | Yes | - | - | - |
| ticket.respond | Yes | Yes | Yes | - | - |
| ticket.assign | Yes | Yes | - | - | - |
| ticket.updateStatus | Yes | Yes | - | - | - |
| ticket.updatePriority | Yes | Yes | - | - | - |
| ticket.close | Yes | Yes | - | - | - |
| ticket.manageCannedResponses | Yes | - | - | - | - |
| ticket.viewAnalytics | Yes | Yes | - | - | - |
| ticket.viewInternalNotes | Yes | Yes | Yes | - | - |

### Event Dispatcher Integration

New events emitted through the existing Event Dispatcher:

**KB events:**
- `kb.article.created` — Article created (includes articleId, authorId)
- `kb.article.published` — Article published
- `kb.article.updated` — Article content updated
- `kb.article.archived` — Article archived
- `kb.comment.created` — New comment on article
- `kb.feedback.submitted` — Helpful/not-helpful feedback received

**Ticket events:**
- `ticket.created` — New ticket opened
- `ticket.replied` — New message on ticket (user or admin)
- `ticket.assigned` — Ticket assigned to staff member
- `ticket.statusChanged` — Ticket status transition
- `ticket.resolved` — Ticket marked resolved
- `ticket.closed` — Ticket closed
- `ticket.rated` — User submitted CSAT rating

**Bridge events:**
- `support.deflection.attempted` — AI deflection query made
- `support.deflection.escalated` — User escalated from AI to ticket

### Email Notification Integration

Using existing Email Notification System:

| Trigger | Recipient | Template |
|---------|-----------|----------|
| Ticket reply (admin→user) | Ticket owner | `ticket_reply_notification` |
| Ticket reply (user→admin) | Assigned admin | `ticket_user_reply` |
| Ticket assigned | Assigned admin | `ticket_assigned` |
| Ticket resolved | Ticket owner | `ticket_resolved` |
| KB workflow step ready | Assignee | `kb_workflow_step_ready` |
| KB workflow approved | Article author | `kb_workflow_approved` |
| KB workflow rejected | Article author | `kb_workflow_rejected` |
| KB comment on article | Article author | `kb_comment_notification` |

### Audit Log Integration

All mutations log through the existing centralized Audit Log System. No custom audit tables — ConvexPress's audit infrastructure handles this. Key actions logged:

KB: article.create, article.update, article.publish, article.archive, article.delete, category.create, category.update, category.delete, tag.create, tag.delete, collection.create, collection.update, collection.delete, template.create, template.update, workflow.create, workflow.update, comment.approve, comment.delete

Tickets: ticket.create, ticket.reply, ticket.assign, ticket.statusChange, ticket.priorityChange, ticket.close, ticket.reopen, cannedResponse.create, cannedResponse.update, cannedResponse.delete

### Settings System Integration

New setting groups registered:

```
kb.general:
  - siteName: string (KB display name, default: "Help Center")
  - siteDescription: string
  - homepageLayout: "categories" | "search" | "featured"
  - articlesPerPage: number (default: 20)

kb.features:
  - commentsEnabled: boolean (default: true)
  - bookmarksEnabled: boolean (default: true)
  - progressTrackingEnabled: boolean (default: true)
  - ratingsEnabled: boolean (default: true)
  - relatedArticlesEnabled: boolean (default: true)

kb.search:
  - meilisearchEnabled: boolean (default: false)
  - meilisearchUrl: string
  - meilisearchApiKey: string
  - ragEnabled: boolean (default: false)
  - ragProvider: "openai" | "anthropic"
  - ragApiKey: string
  - ragModel: string (default: "text-embedding-3-small")

ticket.general:
  - categories: array of { value, label } (customizable category list)
  - defaultPriority: "low" | "medium" | "high" (default: "medium")
  - autoCloseAfterDays: number (default: 14, 0 to disable)

ticket.sla:
  - firstResponseTarget: number (minutes, default: 240)
  - resolutionTarget: number (minutes, default: 2880)

support.widget:
  - isEnabled: boolean (default: true)
  - position: "bottomRight" | "bottomLeft" (default: "bottomRight")
  - greeting: string (default: "Hi! How can we help?")
  - offlineMessage: string

support.ai:
  - deflectionEnabled: boolean (default: true)
  - aiProvider: "openai" | "anthropic"
  - aiModel: string
  - aiApiKey: string
  - systemPrompt: string (customizable AI behavior)
```

### Admin Sidebar Placement

```
Dashboard
Posts
  All Posts
  Add New
  Categories
  Tags
Pages
Media
Knowledge Base              ← NEW top-level section
  All Articles
  Add New
  Categories
  Tags
  Collections
  Templates
  Workflows
  Analytics
  Settings
Support Tickets             ← NEW top-level section
  All Tickets
  Canned Responses
  Analytics
  Settings
Comments
Users
Settings
  ...existing sub-pages...
```

---

## Build Order

### Phase 1: Knowledge Base System (independent)

No dependencies on ticket system. Can be built and shipped standalone.

1. Schema file (`convex/schema/kb.ts`) + add to hub
2. Core functions: articles CRUD, categories, tags
3. Search: Convex-native searchIndex
4. Admin UI: article list table, editor, category/tag management
5. Website UI: KB homepage, category pages, article reader
6. Engagement: feedback, bookmarks, progress tracking
7. Collections and templates
8. Editorial workflows
9. Analytics dashboard
10. Meilisearch sync (opt-in layer)
11. RAG embeddings (opt-in layer)
12. Settings registration
13. Event + email + audit integration

### Phase 2: Ticket System (independent, parallel with Phase 1)

No dependencies on KB. Can be built and shipped standalone.

1. Schema file (`convex/schema/tickets.ts`) + add to hub
2. Core functions: ticket CRUD, messaging, sequential numbering
3. Admin UI: ticket queue, ticket detail, sidebar metadata
4. Website UI: my tickets, ticket thread, create ticket
5. Canned responses
6. Sessions and rate limiting
7. CSAT ratings
8. SLA tracking
9. Analytics dashboard
10. Settings registration
11. Event + email + audit integration

### Phase 3: Support Bridge (depends on Phase 1 + 2)

1. Schema file (`convex/schema/support.ts`) + add to hub
2. AI deflection action (KB search → AI answer)
3. Deflection logging
4. Floating support widget (all website pages)
5. Widget state machine and views
6. Deflection analytics dashboard
7. Settings registration

### Phase 4: Polish

1. Cross-system analytics (which KB articles deflect tickets)
2. Admin dashboard widgets for KB + ticket stats
3. Capability seeding for all roles
4. Email notification templates
5. Sitemap integration for KB articles
6. SEO integration for KB article pages

---

## New Expert Registry Entries

| # | Expert | Slash Command | Knowledge Doc |
|---|--------|---------------|---------------|
| 39 | Knowledge Base System Expert | `/experts:kb-system` | `.claude/docs/KB-SYSTEM.md` |
| 40 | Ticket System Expert | `/experts:ticket-system` | `.claude/docs/TICKET-SYSTEM.md` |
| 41 | Support Bridge Expert | `/experts:support-bridge` | `.claude/docs/SUPPORT-BRIDGE.md` |

Each gets a full PRD at:
- `specs/ConvexPress/systems/knowledge-base/PRD.md`
- `specs/ConvexPress/systems/tickets/PRD.md`
- `specs/ConvexPress/systems/support-bridge/PRD.md`
