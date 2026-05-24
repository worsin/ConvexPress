# AI Content Generation System - Expert Knowledge Document

**System:** AI Content Generation
**Status:** Implemented (Backend 100%, Admin UI 100%)
**Priority:** P2 - Medium
**WordPress Equivalent:** None (closest: Jetpack AI Assistant)
**Last Analyzed:** 2026-04-01
**Airtable System ID:** N/A (pending registration)

---

## Quick Reference

### What This System Does

The AI Content Generation System provides one-click, AI-powered structured content creation for posts and pages. Users enter a `pagePrompt` describing what the content should be about, and the system generates a complete structured article: hero section, 5 topic sections (with web research for posts), summary, source list, and table of contents. Individual sections can be regenerated independently. The system uses Claude (Anthropic) for text generation and Tavily for web research.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **pagePrompt** | A free-text field on the post/page where the user describes what the content should be about. This is the input to the entire generation pipeline. |
| **9-Step Pipeline** | `generateAll` executes hero title -> topic titles -> subtitles -> hero content -> research+topic content -> summary -> sources -> TOC sequentially. |
| **Post vs Page** | Posts get full Tavily research per topic (5 results) with inline citations. Pages get lighter 2-3 paragraph generation without research. |
| **Section Regeneration** | `generateSection` regenerates one section (hero, topic by index, summary, TOC) without affecting others. Sources cannot be regenerated independently. |
| **Structured Content Fields** | `hero`, `topics[]`, `summary`, `sources`, `tableOfContents` -- fields on the `posts` table, shared with the manual structured editor. |
| **generateWithClaude** | Internal action wrapping the Anthropic SDK. Uses `claude-sonnet-4-20250514` model. |
| **researchTopic** | Internal action wrapping the Tavily SDK. Uses `searchDepth: "advanced"` with configurable `maxResults` (default 5). |
| **saveGeneratedContent** | Internal mutation that performs partial patch of post structured fields. Only updates fields that are provided. |
| **RegenerateButton** | UI component with sparkle icon that triggers section-level regeneration. Present on each structured content section. |
| **useAiGeneration** | React hook managing generation state, Convex action calls, toast notifications, and page reload on completion. |

### ConvexPress vs WordPress

| Aspect | WordPress (Jetpack AI) | ConvexPress |
|--------|----------------------|-------------|
| **Generation model** | OpenAI GPT | Anthropic Claude (claude-sonnet-4-20250514) |
| **Research** | None | Tavily web search per topic with source citations |
| **Structure** | Free-form blocks | Named sections (hero, topics, summary, sources, TOC) |
| **Granularity** | Regenerate all or nothing | Per-section regeneration |
| **Source citations** | None | Inline [1], [2] references + compiled source list |
| **Type awareness** | Same for all content types | Research-backed posts, lightweight pages |
| **Cost model** | Jetpack subscription | BYOK (bring your own API keys) |

---

## Architecture Overview

### Data Flow

```
User enters pagePrompt in post/page editor
  |
  v
User clicks "Generate All" (or "Regenerate" on a section)
  |
  v
useAiGeneration hook -> calls Convex action (generateAll or generateSection)
  |
  v
Action authenticates via ctx.auth.getUserIdentity()
  |
  v
Action calls getPostForAi internal query
  - Fetches post data
  - Resolves caller's Convex Auth subject to users table
  - Checks role level: Editor+ (80+) can edit any, Author (60+) can edit own
  - Returns post fields + callerCanEdit boolean
  |
  v
Action orchestrates generation:
  - Step 1: Hero title (Claude)
  - Step 2: 5 topic titles (Claude, JSON array)
  - Step 3: Hero subtitle + topic subtitles (Claude, sequential)
  - Step 4: Hero content (Claude)
  - Step 5: Research per topic (Tavily, posts only)
  - Step 6: Topic content (Claude, with research context for posts)
  - Step 7: Summary (Claude, JSON {title, content})
  - Step 8: Compile sources (from Tavily results, deduplicated)
  - Step 9: Table of contents (Claude)
  |
  v
saveGeneratedContent internal mutation patches post
  - Partial update: only provided fields are written
  - Sets updatedAt = Date.now()
  |
  v
Hook receives success -> toast notification -> window.location.reload()
```

### Authentication & Authorization

- **generateAll / generateSection**: Public actions requiring authentication via `ctx.auth.getUserIdentity()`.
- **Permission check**: Delegated to `getPostForAi` internal query which resolves the caller's role level.
- **Editor+ (level 80+)**: Can generate for any post or page.
- **Author (level 60+)**: Can generate only for posts where `post.authorId === callerSubject`.
- **Below Author**: Denied with `FORBIDDEN` error.
- No custom capabilities are registered -- the system piggybacks on existing role levels and post ownership.

---

## Database Schema

The AI Content Generation System does NOT own any tables. It reads and writes structured content fields on the `posts` table (owned by the Post System).

### Fields Used on `posts` Table

```typescript
// In convex/schema/posts.ts (Post System owns this)

hero: v.optional(v.object({
  title: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  content: v.optional(v.string()),
  imageId: v.optional(v.id("media")),     // NOT written by AI
  videoUrl: v.optional(v.string()),        // NOT written by AI
  ctaText: v.optional(v.string()),         // NOT written by AI
  ctaUrl: v.optional(v.string()),          // NOT written by AI
})),

topics: v.optional(v.array(v.object({
  title: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  content: v.optional(v.string()),
  imageId: v.optional(v.id("media")),     // NOT written by AI
  videoUrl: v.optional(v.string()),        // NOT written by AI
}))),

summary: v.optional(v.object({
  title: v.optional(v.string()),
  content: v.optional(v.string()),
})),

sources: v.optional(v.string()),
tableOfContents: v.optional(v.string()),
pagePrompt: v.optional(v.string()),       // READ by AI (user input)
```

---

## Convex Functions

### Public Actions (`convex/ai/actions.ts`)

| Function | Type | Args | Returns |
|----------|------|------|---------|
| `generateAll` | `action` | `{ postId: Id<"posts"> }` | `{ success: boolean, topicCount: number, sourceCount: number }` |
| `generateSection` | `action` | `{ postId: Id<"posts">, section: "hero"\|"topic"\|"summary"\|"sources"\|"tableOfContents", topicIndex?: number }` | `{ success: boolean, message?: string }` |

### Internal Actions (`convex/ai/internals.ts`)

| Function | Type | Args | Returns |
|----------|------|------|---------|
| `generateWithClaude` | `internalAction` | `{ systemPrompt, userPrompt, maxTokens? }` | `string` |
| `researchTopic` | `internalAction` | `{ query, maxResults? }` | `{ answer, aggregatedContent, sources[] }` |

### Internal Query + Mutation (`convex/ai/helpers.ts`)

| Function | Type | Purpose |
|----------|------|---------|
| `getPostForAi` | `internalQuery` | Fetch post + resolve caller's edit permission |
| `saveGeneratedContent` | `internalMutation` | Partial patch of post's structured content fields |

### Validators (`convex/ai/validators.ts`)

| Validator | Fields |
|-----------|--------|
| `generateAllArgs` | `{ postId: v.id("posts") }` |
| `generateSectionArgs` | `{ postId: v.id("posts"), section: v.union(...), topicIndex: v.optional(v.number()) }` |

### Prompt Templates (`convex/ai/prompts.ts`)

| Template | Input | Output Format |
|----------|-------|---------------|
| `SYSTEM_PROMPT` | (constant) | System message for all Claude calls |
| `HERO_TITLE_PROMPT(prompt)` | pagePrompt | Plain text title |
| `HERO_SUBTITLE_PROMPT(title)` | heroTitle | Plain text subtitle |
| `HERO_CONTENT_PROMPT(title, subtitle)` | title, subtitle | Plain text paragraph |
| `TOPIC_TITLES_PROMPT(title, prompt)` | heroTitle, pagePrompt | JSON array of 5 strings |
| `TOPIC_SUBTITLE_PROMPT(topicTitle, postTitle)` | topicTitle, heroTitle | Plain text subtitle |
| `TOPIC_CONTENT_PROMPT(topicTitle, subtitle, postTitle, research, urls)` | topic context + research | Text with [n] citations |
| `SUMMARY_PROMPT(title, topicTitles)` | heroTitle, topic titles | JSON `{title, content}` |
| `TOC_PROMPT(title, topicTitles)` | heroTitle, topic titles | Plain text numbered list |

---

## Admin Frontend Components

### Hook (`hooks/useAiGeneration.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `status` | `GenerationStatus` | `"idle" \| "generating" \| "done" \| "error"` |
| `currentSection` | `string \| null` | Which section is generating (e.g., `"all"`, `"hero"`, `"topic-2"`) |
| `isGenerating` | `boolean` | Convenience: `status === "generating"` |
| `handleGenerateAll()` | `() => Promise<void>` | Triggers full 9-step pipeline |
| `handleRegenerateSection(section, topicIndex?)` | `(...) => Promise<void>` | Triggers single section regeneration |

### Structured Editor Components (`components/editor/structured/`)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| `StructuredContentSection` | `StructuredContentSection.tsx` | DONE | Collapsible section wrapper with RegenerateButton in header |
| `SectionField` | `SectionField.tsx` | DONE | Labeled field with optional per-field RegenerateButton |
| `RegenerateButton` | `RegenerateButton.tsx` | DONE | Sparkle icon button with loading state. 10px font, primary color scheme |
| `HeroSectionEditor` | `HeroSectionEditor.tsx` | DONE | Fields: title, subtitle, content, videoUrl, ctaText, ctaUrl |
| `TopicSectionEditor` | `TopicSectionEditor.tsx` | DONE | Fields: title, subtitle, content, videoUrl. Includes remove + regenerate buttons |
| `TopicsListEditor` | `TopicsListEditor.tsx` | DONE | Dynamic 0-5 topic array. Add/remove. MAX_TOPICS = 5 |
| `SummarySectionEditor` | `SummarySectionEditor.tsx` | DONE | Fields: title, content |
| `SourcesEditor` | `SourcesEditor.tsx` | DONE | Monospace textarea for sources (one per line) |
| `TableOfContentsEditor` | `TableOfContentsEditor.tsx` | DONE | Textarea for TOC |

### TypeScript Types (`types/editor.ts`)

| Type | Description |
|------|-------------|
| `HeroFields` | `{ title, subtitle, content, imageId, videoUrl, ctaText, ctaUrl }` |
| `TopicFields` | `{ title, subtitle, content, imageId, videoUrl }` |
| `SummaryFields` | `{ title, content }` |
| `DEFAULT_HERO` | Default empty hero values |
| `DEFAULT_TOPIC` | Default empty topic values |
| `DEFAULT_SUMMARY` | Default empty summary values |

---

## Environment Variables

| Variable | Required | Service | Set In |
|----------|----------|---------|--------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API | Convex environment variables |
| `TAVILY_API_KEY` | Yes (for post research) | Tavily Search API | Convex environment variables |

Both are read from `process.env` in Node.js runtime actions. Missing keys throw `CONFIGURATION_ERROR`.

---

## Error Handling

| Error Code | Condition | User-Facing Message |
|------------|-----------|-------------------|
| `UNAUTHORIZED` | No auth identity | "Not authenticated" |
| `NOT_FOUND` | Invalid postId | "Post not found" |
| `FORBIDDEN` | Caller cannot edit this post | "Insufficient permissions" |
| `VALIDATION_ERROR` | Empty pagePrompt | "Page prompt is required. Enter what this content should be about." |
| `VALIDATION_ERROR` | Topic index out of bounds | "Topic index N out of bounds (M topics exist)" |
| `CONFIGURATION_ERROR` | Missing API key | "ANTHROPIC_API_KEY not configured..." or "TAVILY_API_KEY not configured..." |

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| **`convex/ai/actions.ts`** | DONE | Public actions: generateAll, generateSection |
| **`convex/ai/internals.ts`** | DONE | Internal actions: generateWithClaude, researchTopic |
| **`convex/ai/helpers.ts`** | DONE | Internal query/mutation: getPostForAi, saveGeneratedContent |
| **`convex/ai/prompts.ts`** | DONE | All 9 prompt templates |
| **`convex/ai/validators.ts`** | DONE | generateAllArgs, generateSectionArgs |
| **`hooks/useAiGeneration.ts`** | DONE | Hook with status, section tracking, toast, reload |
| **`components/editor/structured/RegenerateButton.tsx`** | DONE | Sparkle icon button |
| **`components/editor/structured/StructuredContentSection.tsx`** | DONE | Collapsible section wrapper |
| **`components/editor/structured/SectionField.tsx`** | DONE | Labeled field wrapper |
| **`components/editor/structured/HeroSectionEditor.tsx`** | DONE | Hero form fields |
| **`components/editor/structured/TopicSectionEditor.tsx`** | DONE | Single topic form fields |
| **`components/editor/structured/TopicsListEditor.tsx`** | DONE | Dynamic topic array (0-5) |
| **`components/editor/structured/SummarySectionEditor.tsx`** | DONE | Summary form fields |
| **`components/editor/structured/SourcesEditor.tsx`** | DONE | Sources textarea |
| **`components/editor/structured/TableOfContentsEditor.tsx`** | DONE | TOC textarea |

---

## Known Limitations

1. **Sequential execution** -- The 9-step pipeline runs sequentially. 5 topics with research = 5 Tavily calls + 5 Claude calls (plus overhead). Could be parallelized.
2. **Page reload on completion** -- `window.location.reload()` is used instead of Convex real-time subscription updates.
3. **No streaming** -- Content appears all at once after full generation completes.
4. **No generation history** -- Previous generations are overwritten.
5. **No cost/usage tracking** -- API calls are not metered per user.
6. **Sources not independently regenerable** -- Must regenerate topics to get new sources.
7. **Hardcoded model** -- Uses `claude-sonnet-4-20250514` without configuration option.
8. **Hardcoded topic count** -- Always generates 5 topics. No user control over section count.

---

## Related Systems

| System | Relationship |
|--------|-------------|
| **Post System** | Owns the `posts` table and structured content fields that AI writes to |
| **Page System** | Shares the `posts` table; AI generates lighter content for pages |
| **Content Editor System** | The structured editor components integrate into the content editor |
| **Admin Editor Layout UI** | Structured content sections render in the main editor column |
| **Role & Capability System** | Authorization checks rely on role levels (60+ Author, 80+ Editor) |
| **Revision System** | Post revisions capture AI-generated content changes |
