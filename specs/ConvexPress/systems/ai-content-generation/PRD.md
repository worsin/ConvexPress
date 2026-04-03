# AI Content Generation System - Product Requirements Document

**System:** AI Content Generation
**Status:** Implemented (Backend + Admin UI)
**Priority:** P2 - Medium
**WordPress Equivalent:** None (closest: Jetpack AI Assistant, Yoast AI)
**Dependencies:** Post System, Page System, Role & Capability System
**Created:** 2026-04-01
**Last Updated:** 2026-04-01

---

## 1. Overview

The AI Content Generation System provides AI-powered structured content creation for posts and pages in the ConvexPress admin editor. It uses Claude (Anthropic API) for text generation and Tavily for web research. The system generates structured content sections -- hero, up to 5 topic sections, summary, sources, and table of contents -- from a single user-provided prompt (`pagePrompt`).

Blog posts receive full Tavily research per topic section, producing research-backed, source-cited content. Pages receive lighter generation without external research, producing informative but less data-heavy content.

The system operates as an enhancement to the existing structured content editor, not a replacement. All AI-generated content is saved directly to the post's structured content fields (`hero`, `topics`, `summary`, `sources`, `tableOfContents`) and is fully editable after generation.

---

## 2. Goals

1. **One-click content generation** -- Authors enter a topic prompt and generate a complete structured article with a single action.
2. **Research-backed posts** -- Blog posts include real-world data from Tavily web search, with inline source citations.
3. **Section-level regeneration** -- Users can regenerate any individual section (hero, specific topic, summary, TOC) without regenerating the entire article.
4. **Permission-aware** -- Only authorized users can trigger generation, scoped to posts they can edit.
5. **Type-aware generation** -- Posts get full research pipelines; pages get lightweight generation appropriate for static content.
6. **Non-destructive** -- Generated content overwrites structured fields but the user can always manually edit or regenerate.

---

## 3. User Stories

### 3.1 Author Generating a Post

> As an **Author**, I want to enter a topic description in the Page Prompt field, click "Generate All," and have a complete, research-backed article generated with hero section, 5 topic sections, summary, sources, and table of contents, so I can quickly produce high-quality content.

### 3.2 Author Generating a Page

> As an **Author**, I want to generate content for a page that is lighter and more informative without deep web research, since pages are typically used for static content like "About Us" or "Services."

### 3.3 Editor Regenerating a Section

> As an **Editor**, I want to regenerate just one topic section of a post without losing the rest of the generated content, so I can refine specific parts of the article.

### 3.4 Author Viewing Generation Progress

> As an **Author**, I want to see that content is being generated (loading state) and get notified when generation completes or fails, so I know when the content is ready to review.

---

## 4. Authorization

### 4.1 Permission Model

The AI Content Generation System does not define its own capabilities. Instead, it checks whether the caller can **edit the target post/page** using existing role levels:

| Role | Level | Can Generate |
|------|-------|--------------|
| Administrator | 100 | Any post or page |
| Editor | 80 | Any post or page |
| Author | 60 | Own posts/pages only |
| Contributor | 40 | No (cannot edit published content, cannot upload) |
| Subscriber | 20 | No |

### 4.2 Authorization Flow

1. Caller authenticates via `ctx.auth.getUserIdentity()`.
2. The `getPostForAi` internal query fetches the post and resolves the caller's identity to a user record.
3. The caller's role level is checked:
   - **Level 80+** (Editor/Admin): Can generate for any post.
   - **Level 60+** (Author): Can generate only for posts where `post.authorId === callerSubject`.
   - **Below 60**: Denied.
4. A `callerCanEdit` boolean is returned and checked before generation proceeds.

---

## 5. Architecture

### 5.1 Generation Pipeline (9 Steps)

The `generateAll` action executes a sequential 9-step pipeline:

| Step | Name | Description | Max Tokens |
|------|------|-------------|------------|
| 1 | **Hero Title** | Generate compelling title from `pagePrompt` | 100 |
| 2 | **Topic Titles** | Generate 5 section titles as JSON array | 300 |
| 3 | **Subtitles** | Generate hero subtitle + subtitle for each topic | 150 each |
| 4 | **Hero Content** | Generate 2-3 sentence intro paragraph | 300 |
| 5 | **Research** (posts only) | Tavily advanced search per topic (5 results each) | N/A |
| 6 | **Topic Content** | Generate 3-5 paragraphs per topic with source citations (posts) or 2-3 paragraphs (pages) | 1500 (posts) / 800 (pages) |
| 7 | **Summary** | Generate key takeaways as JSON `{title, content}` | 500 |
| 8 | **Sources** | Compile deduplicated source list from research | N/A |
| 9 | **Table of Contents** | Generate formatted TOC from hero + topic titles | 300 |

### 5.2 Post vs Page Generation

| Aspect | Posts | Pages |
|--------|-------|-------|
| Research | Full Tavily search per topic (5 results) | None |
| Topic content | 3-5 paragraphs with inline citations [1], [2] | 2-3 informative paragraphs |
| Sources | Compiled from research results | Empty string |
| Max tokens per topic | 1500 | 800 |
| System prompt | Same for both | Same for both |

### 5.3 Section-Level Regeneration

The `generateSection` action regenerates a single section without affecting others. Supported sections:

| Section | Behavior |
|---------|----------|
| `hero` | Regenerates title, subtitle, and content. Updates the post title to match. |
| `topic` | Requires `topicIndex` (0-4). Regenerates content only (preserves existing title/subtitle). For posts, performs fresh Tavily research. |
| `summary` | Regenerates summary title and content based on existing topic titles. |
| `sources` | Cannot be independently regenerated. Returns a message directing the user to regenerate topics instead. |
| `tableOfContents` | Regenerates TOC based on existing hero title and topic titles. |

### 5.4 Data Flow

```
User enters pagePrompt in editor
  |
  v
User clicks "Generate All" or "Regenerate" button
  |
  v
useAiGeneration hook calls Convex action (generateAll or generateSection)
  |
  v
Action authenticates user, verifies edit permission via getPostForAi
  |
  v
Action orchestrates Claude API calls (via generateWithClaude internal action)
  + Tavily research calls (via researchTopic internal action, posts only)
  |
  v
Generated content saved to post via saveGeneratedContent internal mutation
  |
  v
Page reloads (window.location.reload) to show updated content
```

### 5.5 External API Dependencies

| Service | Purpose | Environment Variable | SDK |
|---------|---------|---------------------|-----|
| **Anthropic Claude** | Text generation (claude-sonnet-4-20250514) | `ANTHROPIC_API_KEY` | `@anthropic-ai/sdk` |
| **Tavily** | Web research (advanced search) | `TAVILY_API_KEY` | `@tavily/core` |

Both SDKs are dynamically imported in Node.js runtime actions (`"use node"` directive).

---

## 6. Backend Implementation

### 6.1 File Structure

```
ConvexPress-Admin/packages/backend/convex/ai/
├── actions.ts      # Public actions: generateAll, generateSection
├── internals.ts    # Internal actions: generateWithClaude, researchTopic
├── helpers.ts      # Internal query + mutation: getPostForAi, saveGeneratedContent
├── prompts.ts      # Prompt templates: SYSTEM_PROMPT, HERO_TITLE_PROMPT, etc.
└── validators.ts   # Argument validators: generateAllArgs, generateSectionArgs
```

### 6.2 Public Actions (`actions.ts`)

| Action | Args | Returns | Runtime |
|--------|------|---------|---------|
| `generateAll` | `{ postId: Id<"posts"> }` | `{ success: boolean, topicCount: number, sourceCount: number }` | Node.js |
| `generateSection` | `{ postId: Id<"posts">, section: "hero" \| "topic" \| "summary" \| "sources" \| "tableOfContents", topicIndex?: number }` | `{ success: boolean, message?: string }` | Node.js |

Both actions:
- Run in the Node.js runtime (`"use node"` at top of file)
- Authenticate via `ctx.auth.getUserIdentity()`
- Verify edit permission via `getPostForAi` internal query
- Orchestrate multiple internal action/mutation calls

### 6.3 Internal Actions (`internals.ts`)

| Action | Args | Returns |
|--------|------|---------|
| `generateWithClaude` | `{ systemPrompt, userPrompt, maxTokens? }` | `string` (generated text) |
| `researchTopic` | `{ query, maxResults? }` | `{ answer, aggregatedContent, sources[] }` |

Both are `internalAction` (not client-callable) and run in Node.js runtime.

### 6.4 Internal Query + Mutation (`helpers.ts`)

| Function | Type | Purpose |
|----------|------|---------|
| `getPostForAi` | `internalQuery` | Fetches post data + resolves caller edit permission |
| `saveGeneratedContent` | `internalMutation` | Partial update of post's structured content fields |

`saveGeneratedContent` accepts all fields as optional and only patches fields that are provided. It also updates `updatedAt` to `Date.now()`.

### 6.5 Prompt Templates (`prompts.ts`)

| Prompt | Input | Output Format |
|--------|-------|---------------|
| `SYSTEM_PROMPT` | N/A | System message for all Claude calls |
| `HERO_TITLE_PROMPT` | pagePrompt | Plain text (title only) |
| `HERO_SUBTITLE_PROMPT` | title | Plain text (subtitle only) |
| `HERO_CONTENT_PROMPT` | title, subtitle | Plain text (2-3 sentences) |
| `TOPIC_TITLES_PROMPT` | title, pagePrompt | JSON array of 5 strings |
| `TOPIC_SUBTITLE_PROMPT` | topicTitle, postTitle | Plain text (subtitle only) |
| `TOPIC_CONTENT_PROMPT` | topicTitle, subtitle, postTitle, researchData, sourceUrls | Plain text with [1], [2] citations |
| `SUMMARY_PROMPT` | title, topicTitles | JSON `{title, content}` |
| `TOC_PROMPT` | title, topicTitles | Plain text (numbered list) |

### 6.6 Validators (`validators.ts`)

- `generateAllArgs`: `{ postId: v.id("posts") }`
- `generateSectionArgs`: `{ postId: v.id("posts"), section: v.union(...), topicIndex: v.optional(v.number()) }`

---

## 7. Admin Frontend Implementation

### 7.1 Hook: `useAiGeneration`

**File:** `ConvexPress-Admin/apps/web/src/hooks/useAiGeneration.ts`

Provides:
- `status`: `"idle" | "generating" | "done" | "error"`
- `currentSection`: Which section is currently generating (for UI indicators)
- `isGenerating`: Boolean convenience getter
- `handleGenerateAll()`: Triggers full pipeline
- `handleRegenerateSection(section, topicIndex?)`: Triggers single section regeneration

After successful generation, the hook calls `window.location.reload()` to refresh the editor with the new content. Toast notifications (via Sonner) inform the user of success or error.

### 7.2 Structured Content Editor Components

**Directory:** `ConvexPress-Admin/apps/web/src/components/editor/structured/`

| Component | Purpose |
|-----------|---------|
| `StructuredContentSection` | Collapsible section wrapper with header, collapse toggle, and optional RegenerateButton |
| `SectionField` | Labeled field wrapper with optional per-field RegenerateButton |
| `RegenerateButton` | Small button with sparkle icon, loading spinner, and "Regenerate with AI" label |
| `HeroSectionEditor` | Form fields for hero: title, subtitle, content, video URL, CTA text, CTA URL |
| `TopicSectionEditor` | Form fields for one topic: title, subtitle, content, video URL. Includes remove and regenerate buttons |
| `TopicsListEditor` | Dynamic array of TopicSectionEditors (0-5). Add/remove topics. Max 5 enforced |
| `SummarySectionEditor` | Form fields for summary: title and content |
| `SourcesEditor` | Textarea for sources/references (one per line, monospace font) |
| `TableOfContentsEditor` | Textarea for table of contents |

All components use CSS variable-based styling (no hardcoded colors) and integrate with the existing editor form via controlled `value`/`onChange` props.

---

## 8. Structured Content Schema

The AI system writes to fields on the `posts` table (defined in `convex/schema/posts.ts`). These fields are shared with the manual structured content editor:

| Field | Type | AI Writes To |
|-------|------|-------------|
| `hero` | `{ title?, subtitle?, content?, imageId?, videoUrl?, ctaText?, ctaUrl? }` | title, subtitle, content |
| `topics` | `Array<{ title?, subtitle?, content?, imageId?, videoUrl? }>` | title, subtitle, content |
| `summary` | `{ title?, content? }` | title, content |
| `sources` | `string` | Full text (compiled from research) |
| `tableOfContents` | `string` | Full text |
| `pagePrompt` | `string` | Read-only (input from user) |
| `title` | `string` | Updated to match hero title on generateAll |

The AI system does **not** write to `imageId`, `videoUrl`, `ctaText`, or `ctaUrl` fields -- those are manual-only.

---

## 9. Error Handling

| Error | Code | When |
|-------|------|------|
| Not authenticated | `UNAUTHORIZED` | No user identity from `ctx.auth` |
| Post not found | `NOT_FOUND` | Invalid postId |
| Cannot edit | `FORBIDDEN` | Caller lacks edit permission for this post |
| No prompt | `VALIDATION_ERROR` | `pagePrompt` field is empty |
| Topic out of bounds | `VALIDATION_ERROR` | `topicIndex` >= existing topics count |
| Missing API key | `CONFIGURATION_ERROR` | `ANTHROPIC_API_KEY` or `TAVILY_API_KEY` not set |

All errors are thrown as `ConvexError` with structured `{ code, message }` payloads. The `useAiGeneration` hook catches these and displays the message via `toast.error()`.

---

## 10. Limitations & Future Enhancements

### Current Limitations

1. **Sequential pipeline** -- Steps execute sequentially, not in parallel. Topic research and content generation for 5 topics takes significant time.
2. **Page reload after generation** -- The hook calls `window.location.reload()` instead of leveraging Convex's real-time subscriptions to update the editor.
3. **No generation history** -- Previous generations are overwritten with no undo beyond the revision system.
4. **No streaming** -- Content appears all at once after generation completes, not streamed token-by-token.
5. **No image generation** -- The `imageId` and `videoUrl` fields in structured content are not populated by AI.
6. **Sources not independently regenerable** -- Sources are a byproduct of topic research and cannot be regenerated without re-researching topics.
7. **No cost tracking** -- API usage (Claude tokens, Tavily searches) is not tracked or rate-limited per user.

### Potential Enhancements

1. **Parallel topic generation** -- Research and generate multiple topics concurrently.
2. **Real-time reactivity** -- Use Convex subscriptions to update the editor as each section is saved, removing the need for page reload.
3. **Streaming generation** -- Stream Claude responses token-by-token for better UX.
4. **Image generation** -- Integrate an image generation API to populate hero and topic images.
5. **Tone/style controls** -- Let users specify writing tone (formal, casual, technical) and style preferences.
6. **Custom section count** -- Allow fewer or more than 5 topic sections.
7. **Generation history** -- Store previous generations for comparison and rollback.
8. **Usage quotas** -- Track and limit API usage per user/role.
9. **Prompt templates** -- Predefined prompt templates for common content types (how-to, listicle, comparison, etc.).

---

## 11. ConvexPress vs WordPress AI Features

| Aspect | WordPress (Jetpack AI) | ConvexPress |
|--------|----------------------|-------------|
| **Generation model** | OpenAI GPT | Anthropic Claude |
| **Research integration** | None | Tavily web research with source citations |
| **Content structure** | Free-form block content | Structured sections (hero, topics, summary, TOC) |
| **Section regeneration** | Regenerate entire content | Per-section regeneration (hero, individual topic, summary, TOC) |
| **Source citations** | None | Inline [1], [2] references with compiled source list |
| **Post vs page** | Same generation for all types | Research-backed posts, lightweight pages |
| **Editor integration** | Block editor toolbar button | Structured content editor with dedicated section components |
| **Cost** | Jetpack subscription required | Direct API keys (BYOK) |
