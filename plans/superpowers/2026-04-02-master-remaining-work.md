# ConvexPress Production Readiness -- Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ConvexPress production-ready for distribution as a downloadable Electron desktop app across 10+ website projects. Kill Convex Auth, add integrations settings pages, build Electron packaging with two-tier installer.

**Architecture:** The admin app becomes a distributable Electron desktop app (DMG/EXE/AppImage) with a setup wizard. Server mode creates a new ConvexPress instance; Client mode connects to an existing one. All external service API keys are managed through admin settings UI, not env vars.

**Tech Stack:** Electron 33+, electron-builder, electron-store, tsup, Convex Auth, TanStack Router, Base UI, Tailwind CSS v4, Vite.

**Key Constraint:** The Admin app owns the Convex database. All schema, mutations, queries, and HTTP actions live in `ConvexPress-Admin/packages/backend/convex/`. The Website app is a consumer only.

**Reference Implementation:** `/Users/worsin/Development/MagicScraper/packages/desktop/` serves as the Electron packaging template. The ConvexPress version is simpler because it does not need to clone/build a monorepo at install time -- the Vite SPA is bundled into the Electron app at build time.

---

## Phase 1: Kill Convex Auth (3 tasks)

Convex Auth references appear in **69 files** with **325 total occurrences** across the Convex backend. The migration to Convex Auth (local JWT) is already done -- these are dead references, legacy fallback code paths, and stale comments.

---

### Task 1: Remove Convex Auth from password reset flow

The password reset system (`convex/password/actions.ts`) currently calls the Auth API directly via `fetch()`. This is the only place Convex Auth is called at runtime. Replace it with Resend-based password reset emails.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/password/actions.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/password/mutations.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/password/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/password/validators.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/password/queries.ts`

- [ ] **Step 1: Rewrite `requestPasswordReset` action**
  - Remove the `fetch("https://api.auth.com/...")` call (lines 52-96 of `actions.ts`)
  - Replace with: generate a secure reset token, store it via internal mutation, send reset email via Resend (reuse the existing email helper at `convex/helpers/email.ts`)
  - The reset URL should point to the admin app's reset page: `${siteUrl}/reset-password?token=${token}`
  - Keep email enumeration prevention (always return success)

- [ ] **Step 2: Rewrite `adminResetUserPassword` action**
  - Remove any Auth API calls
  - Use the same Resend-based email approach

- [ ] **Step 3: Clean Convex Auth references from password module**
  - Remove all `authApiKey`, `AUTH_API_KEY`, `Convex Auth` comments and code
  - Update JSDoc comments that reference Convex Auth
  - Update validators that mention Convex Auth

- [ ] **Step 4: Add reset token fields to users schema if needed**
  - Check if `passwordResetToken` and `passwordResetTokenExpiresAt` fields exist in `convex/schema/users.ts`
  - If not, add them (token stored as hash, not plaintext)

**Commit:** `fix(password): replace Convex Auth password reset with Resend email flow`

---

### Task 2: Remove Convex Auth references from all backend files

Systematic cleanup of 69 files. The Convex Auth references fall into categories:
1. **Dead code**: `syncFromAuth`, `getByIdentifier`, `revokeAuthSessions`, `deleteAuthUser` in `profiles/internals.ts`
2. **Legacy fallback**: `by_clerkUserId` index lookups in `helpers/permissions.ts` and throughout
3. **Stale comments**: JSDoc mentioning Convex Auth in dozens of files
4. **Schema fields**: `clerkUserId` field on users table and related indexes

**Files (all in `ConvexPress-Admin/packages/backend/convex/`):**
- Modify: `helpers/permissions.ts` (16 occurrences -- remove legacy Convex Auth fallback in `getCurrentUser`, clean UserDoc type)
- Modify: `profiles/internals.ts` (48 occurrences -- delete `syncFromAuth`, `getByIdentifier`, `revokeAuthSessions`, `deleteAuthUser` functions entirely)
- Modify: `profiles/mutations.ts` (21 occurrences)
- Modify: `helpers/password.ts` (9 occurrences)
- Modify: `helpers/notification.ts` (9 occurrences)
- Modify: `registration/internals.ts` (15 occurrences)
- Modify: `feeds/internals.ts` (10 occurrences)
- Modify: `notifications/mutations.ts` (8 occurrences)
- Modify: `schema/comments.ts` (8 occurrences)
- Modify: `schema/users.ts` (7 occurrences -- remove `clerkUserId` field and `by_clerkUserId` index)
- Modify: All other 59 files with 1-6 occurrences each (comments, variable names, index references)

- [ ] **Step 1: Remove dead Convex Auth functions from `profiles/internals.ts`**
  - Delete: `syncFromAuth` internal mutation (lines ~190-270)
  - Delete: `getByIdentifier` internal query (lines ~305-315)
  - Delete: `revokeAuthSessions` if it exists
  - Delete: `deleteAuthUser` if it exists
  - Update the file header comment

- [ ] **Step 2: Remove Convex Auth fallback from `helpers/permissions.ts`**
  - In `getCurrentUser()`, remove the `by_clerkUserId` fallback block (lines ~177-185)
  - Remove `clerkUserId` from the `UserDoc` type definition (line 55)
  - Update the function's JSDoc to remove Convex Auth mention
  - Update the module header comments (lines 1-30)

- [ ] **Step 3: Clean `schema/users.ts`**
  - Remove `clerkUserId: v.optional(v.string())` field
  - Remove `.index("by_clerkUserId", ["clerkUserId"])` index
  - This is a schema change -- will need deployment

- [ ] **Step 4: Clean remaining 60+ files**
  - Use search-and-replace to remove `clerkUserId` references from comments and type annotations
  - Remove `getUserIdentifier(user)` calls that fall back to `clerkUserId`
  - Fix any helper functions like `lookupUserByIdentifier` that check Convex Auth IDs
  - Update all JSDoc comments

- [ ] **Step 5: Verify no dead imports remain**
  - Run TypeScript type-check: `cd ConvexPress-Admin/packages/backend && npx tsc --noEmit`
  - Fix any broken imports or type errors

**Commit:** `refactor(auth): remove all Convex Auth references from backend (325 occurrences across 69 files)`

---

### Task 3: Remove Convex Auth from dependencies and environment

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/package.json` (if Auth SDK is listed)
- Modify: Any `.env.example` or env config files
- Modify: `ConvexPress-Admin/turbo.json` (has a Convex Auth reference)
- Modify: `ConvexPress-Admin/packages/env/` (if Convex Auth env vars are validated there)

- [ ] **Step 1: Check and remove Auth SDK from package.json**
  - Search for `@auth-inc/node` or any `auth` package
  - Remove from dependencies if present
  - Run `bun install` to clean lockfile

- [ ] **Step 2: Remove Convex Auth env vars from turbo.json**
  - `turbo.json` references Convex Auth -- remove from `globalEnv` or `env` arrays

- [ ] **Step 3: Clean env validation**
  - Remove `AUTH_API_KEY`, `AUTH_CLIENT_ID`, `AUTH_WEBHOOK_SECRET` from any env validation schemas in `packages/env/`

- [ ] **Step 4: Deploy schema change**
  - The `clerkUserId` field/index removal requires a Convex deployment
  - Run: `cd ConvexPress-Admin/packages/backend && npx convex deploy --typecheck=disable`

**Commit:** `chore: remove Auth SDK, env vars, and deploy schema cleanup`

---

## Phase 2: Integrations Settings Pages (6 tasks)

External service API keys (Resend, Meilisearch, AI providers) currently come from Convex environment variables. For multi-site distribution, each admin instance needs to configure its own keys via the settings UI. The pattern: read from settings table first, fall back to env var.

---

### Task 4: Add Integrations nav section and settings route layout

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations.tsx` (layout)
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations/index.tsx`

- [ ] **Step 1: Add integrations nav items to settings section in `nav-config.ts`**

Add after the existing "Search" and "Analytics" items in the settings children array:

```typescript
{
  id: "settings-ai",
  label: "AI",
  to: "/settings/ai",
  capability: "manage_options",
},
{
  id: "settings-integrations",
  label: "Integrations",
  to: "/settings/integrations",
  capability: "manage_options",
},
```

- [ ] **Step 2: Create the integrations index page**

Create `settings/integrations.tsx` as a route that renders an overview page listing all integration connection statuses (Resend, Meilisearch, AI). Each card links to the respective settings page. This is a dashboard/overview, not a form.

- [ ] **Step 3: Add the AI settings nav item route**

The AI page will be at `/settings/ai` (separate from integrations). The integrations page at `/settings/integrations` serves as an overview linking to `/settings/email` (Resend), `/settings/search` (Meilisearch), and `/settings/ai`.

**Commit:** `feat(settings): add integrations overview and AI nav items`

---

### Task 5: AI Provider settings page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/ai.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/settings/ai/AISettingsPage.tsx`
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/mutations.ts` (if new sections needed)

- [ ] **Step 1: Create the AI settings route file**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { AISettingsPage } from "@/components/settings/ai/AISettingsPage";

export const Route = createFileRoute("/_authenticated/_admin/settings/ai")({
  component: AISettingsPage,
});
```

- [ ] **Step 2: Build the AISettingsPage component**

Form sections:
1. **Provider Selection** -- Radio or select: "OpenRouter" (primary) or "Anthropic Direct"
2. **API Key** -- Masked input for the selected provider's API key
3. **Default Model** -- Dropdown populated based on provider:
   - OpenRouter: Claude Sonnet, Claude Opus, GPT-4o, Gemini Pro, Llama 3, etc.
   - Anthropic Direct: claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-20250514
4. **Tavily API Key** -- For research feature
5. **Test Connection** -- Button that makes a minimal API call to validate the key

Settings are stored with section `"ai"` in the settings table. Keys:
- `ai.provider` -- `"openrouter"` or `"anthropic"`
- `ai.apiKey` -- Encrypted API key string
- `ai.defaultModel` -- Model identifier string
- `ai.tavilyApiKey` -- Encrypted Tavily key

- [ ] **Step 3: Add settings mutation for encrypted key storage**

API keys should not be stored as plaintext in the settings table. Use the same encryption pattern from `convex/api/crypto_helpers.ts` (which already handles `WP_SYNC_ENCRYPTION_KEY`). Create a general `SETTINGS_ENCRYPTION_KEY` env var for encrypting all service keys.

Pattern: encrypt before storing, decrypt when reading. The settings query returns masked keys (last 4 chars) for display; the full decrypted key is only available in internal functions.

- [ ] **Step 4: Verify settings save and load cycle**
  - Save AI settings
  - Reload page
  - Verify values persist (API key shows masked)
  - Test connection button works

**Commit:** `feat(settings): add AI provider configuration page with encrypted key storage`

---

### Task 6: Update AI backend to read from settings

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/ai/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/ai/helpers.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/helpers/serviceKeys.ts` (shared helper)

- [ ] **Step 1: Create `serviceKeys.ts` helper**

A shared helper that other systems use to get API keys. Pattern:

```typescript
/**
 * Get an API key from settings table, falling back to env var.
 * Settings values are decrypted before returning.
 */
export async function getServiceKey(
  ctx: QueryCtx | MutationCtx,
  settingsKey: string,
  envVarName: string,
): Promise<string | null> {
  // 1. Try settings table
  const setting = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", settingsKey))
    .unique();
  if (setting?.value) {
    return decryptSettingValue(setting.value);
  }
  // 2. Fall back to env var
  return process.env[envVarName] ?? null;
}
```

Note: For actions (which cannot read the DB directly), the pattern is to read the key via `ctx.runQuery()` first, then use it.

- [ ] **Step 2: Update `ai/internals.ts` to use `serviceKeys` helper**

Modify `researchTopic`:
```typescript
// Before:
const apiKey = process.env.TAVILY_API_KEY;
// After:
const settings = await ctx.runQuery(internal.helpers.serviceKeys.getAIKeys);
const apiKey = settings.tavilyApiKey;
if (!apiKey) throw new ConvexError({ code: "CONFIGURATION_ERROR", ... });
```

Modify `generateWithClaude`:
```typescript
// Before:
const apiKey = process.env.ANTHROPIC_API_KEY;
const client = new Anthropic({ apiKey });
// After:
const settings = await ctx.runQuery(internal.helpers.serviceKeys.getAIKeys);
if (settings.provider === "openrouter") {
  // Use OpenRouter (OpenAI-compatible endpoint)
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.defaultModel,
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      max_tokens: args.maxTokens ?? 1024,
    }),
  });
  // Parse OpenAI-format response
} else {
  // Anthropic Direct (existing code with settings-based key)
}
```

- [ ] **Step 3: Add internal query for AI keys**

Create `internal.helpers.serviceKeys.getAIKeys` that reads all AI-related settings in one query and returns `{ provider, apiKey, defaultModel, tavilyApiKey }`. This avoids multiple DB reads per AI call.

**Commit:** `feat(ai): read API keys from settings with env var fallback, add OpenRouter support`

---

### Task 7: Enhance Email (Resend) settings page

The email settings page exists at `/admin/settings/email` but focuses on templates and queue. Add a configuration section for Resend API credentials.

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/components/settings/email/EmailSettingsPage.tsx`
- Modify: `ConvexPress-Admin/packages/backend/convex/emails/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/emails/actions.ts`

- [ ] **Step 1: Add Resend configuration section to EmailSettingsPage**

Add a new "Configuration" tab or section at the top of the email settings page:
- Resend API Key (masked input, encrypted storage)
- Resend Webhook Secret (masked input, encrypted storage)
- From Address (e.g., `noreply@yoursite.com`)
- From Name (e.g., `ConvexPress`)
- Test Email button (sends a test email to the current admin's address)

Settings keys: `email.resendApiKey`, `email.webhookSecret`, `email.fromAddress`, `email.fromName`

- [ ] **Step 2: Update `emails/internals.ts` and `emails/actions.ts`**

Replace:
```typescript
const apiKey = process.env.RESEND_API_KEY;
```
With:
```typescript
const apiKey = await getServiceKey(ctx, "email.resendApiKey", "RESEND_API_KEY");
```

Same pattern for webhook secret in `convex/http/resendWebhook.ts`.

- [ ] **Step 3: Update from address to use settings**

Currently likely hardcoded or from env. Read `email.fromAddress` and `email.fromName` from settings with sensible defaults.

**Commit:** `feat(settings): add Resend API configuration to email settings page`

---

### Task 8: Enhance Meilisearch settings on Search page

The search settings page exists at `/admin/settings/search` but focuses on analytics, synonyms, and reindex. Add a Meilisearch connection section.

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/search.tsx`
- Modify: `ConvexPress-Admin/packages/backend/convex/search/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/search/actions.ts`

- [ ] **Step 1: Add Meilisearch configuration section**

Add to the top of the search settings page:
- Meilisearch Host URL (e.g., `http://localhost:7700` or cloud URL)
- Meilisearch API Key (masked input, encrypted storage)
- Test Connection button (pings the Meilisearch `/health` endpoint)
- Connection status indicator

Settings keys: `search.meilisearchHost`, `search.meilisearchApiKey`

- [ ] **Step 2: Update search backend to read from settings**

Modify `search/internals.ts` and `search/actions.ts` to use:
```typescript
const host = await getServiceKey(ctx, "search.meilisearchHost", "MEILISEARCH_HOST");
const apiKey = await getServiceKey(ctx, "search.meilisearchApiKey", "MEILISEARCH_API_KEY");
```

**Commit:** `feat(settings): add Meilisearch configuration to search settings page`

---

### Task 9: Verify all backends use settings-first key resolution

Audit pass to ensure every `process.env.SERVICE_KEY` call goes through the `getServiceKey` helper.

**Files:**
- Audit: All files matching `process.env.(RESEND|MEILISEARCH|ANTHROPIC|TAVILY|OPENROUTER)` in `convex/`
- Modify: `ConvexPress-Admin/packages/backend/convex/http/resendWebhook.ts`
- Modify: Any other files still reading keys directly from env

- [ ] **Step 1: Search for remaining direct env var reads**

```bash
grep -r "process\.env\.\(RESEND\|MEILISEARCH\|ANTHROPIC\|TAVILY\|OPENROUTER\)" convex/
```

Known hits as of now:
- `convex/emails/internals.ts:113` -- `RESEND_API_KEY`
- `convex/emails/actions.ts:24` -- `RESEND_API_KEY`
- `convex/ai/internals.ts:25` -- `TAVILY_API_KEY`
- `convex/ai/internals.ts:73` -- `ANTHROPIC_API_KEY`
- `convex/http/resendWebhook.ts:43` -- `RESEND_WEBHOOK_SECRET`

- [ ] **Step 2: Convert each to use `getServiceKey` pattern**

Each call follows the same pattern:
```typescript
// Before:
const apiKey = process.env.RESEND_API_KEY;
// After:
const apiKey = await getServiceKey(ctx, "email.resendApiKey", "RESEND_API_KEY");
```

For actions that cannot call `ctx.db` directly, use `ctx.runQuery(internal.helpers.serviceKeys.getKey, { key, envFallback })`.

- [ ] **Step 3: Test with env vars set (backward compat)**
- [ ] **Step 4: Test with settings configured (new path)**

**Commit:** `refactor: unify all service API key resolution through settings-first pattern`

---

## Phase 3: WordPress Sync UI (4 tasks)

The WordPress sync backend (`convex/wordpressSync/`) is already built with phases for users, media, posts, pages, menus, taxonomies, and comments. The admin UI already has a dashboard at `/tools/wordpress-sync` with components for site list, sync progress, job history, and error log. This phase is about verifying completeness and filling gaps.

---

### Task 10: Verify WordPress Sync settings/connection page

The settings page already exists. Verify it works end-to-end.

**Files:**
- Review: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/index.tsx`
- Review: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/AddSiteDialog.tsx`
- Review: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/WordPressSyncDashboard.tsx`

- [ ] **Step 1: Review AddSiteDialog**
  - Does it collect: WordPress site URL, username, application password?
  - Does it call `testSiteConnection` action?
  - Does it show connection status?
  - Does it encrypt the application password before storage?

- [ ] **Step 2: Review WordPressSyncDashboard**
  - Does it show connected sites?
  - Does it have "Start Sync" button?
  - Does it show per-phase progress?
  - Is the real-time progress working (Convex subscription)?

- [ ] **Step 3: Fix any gaps found**
  - If connection test is broken, fix it
  - If progress display is incomplete, complete it
  - Ensure the sync dashboard is accessible and functional

**Commit:** `fix(wordpress-sync): verify and fix sync UI completeness` (if changes needed)

---

### Task 11: WordPress Sync dashboard enhancements

**Files:**
- Review/Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/SyncProgress.tsx`
- Review/Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/JobHistory.tsx`
- Review/Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/ErrorLog.tsx`

- [ ] **Step 1: Verify real-time sync progress**
  - The SyncProgress component should show phase-by-phase status
  - Expected phases: Users, Media, Taxonomies, Posts, Pages, Menus, Comments
  - Each phase should show: total items, synced items, errors, elapsed time
  - Progress should update in real-time via Convex subscription

- [ ] **Step 2: Verify job history**
  - Past sync jobs should be listed with start/end time, status, item counts
  - Should be able to view error details for failed jobs

- [ ] **Step 3: Verify error log**
  - Per-item error details should be viewable
  - Should show which WordPress item failed and why

**Commit:** `feat(wordpress-sync): enhance sync dashboard with real-time progress` (if changes needed)

---

### Task 12: WordPress site management page

**Files:**
- Review: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/$siteId/index.tsx`
- Review/Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/SitesList.tsx`

- [ ] **Step 1: Verify per-site detail page**
  - The `$siteId/index.tsx` route should show: site details, last sync time, sync history, re-sync button, disconnect button
  - If incomplete, build it out

- [ ] **Step 2: Verify site list CRUD**
  - Add site, edit site (change URL/credentials), delete/disconnect site
  - Per-site status indicators (connected, disconnected, error)

- [ ] **Step 3: Move WordPress connection config to settings if beneficial**
  - Consider whether WordPress sites should store their credentials through the same encrypted settings pattern as other integrations
  - The existing `WP_SYNC_ENCRYPTION_KEY` env var handles this -- verify it works with the settings-first pattern

**Commit:** `feat(wordpress-sync): complete site management CRUD and detail page`

---

### Task 13: Verify Elementor content handling

**Files:**
- Review: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/posts.ts`
- Review: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/pages.ts`
- Review: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/` (if exists)

- [ ] **Step 1: Check for Elementor-specific parsing**
  - Does the post/page sync handle `_elementor_data` meta field?
  - Does it parse Elementor widget JSON into something ConvexPress can render?
  - Does it handle Elementor's shortcode-like `[elementor-template id="123"]` patterns?

- [ ] **Step 2: Check for Elementor CSS handling**
  - Elementor generates custom CSS per page. Is this imported?
  - Does the sync handle `_elementor_css` meta?

- [ ] **Step 3: Document gaps**
  - If Elementor support has gaps, create a follow-up task list
  - Focus on: content fidelity, layout preservation, media references

**Commit:** `docs: document Elementor content handling gaps in WordPress sync` (if gaps found)

---

## Phase 4: Electron Desktop App (12 tasks)

The ConvexPress admin app is a Vite SPA (TanStack Router). Wrapping it in Electron makes it distributable as a desktop app. The key difference from MagicScraper: ConvexPress bundles the built SPA into the Electron app directly (no git clone/install step). The wizard only needs to collect the Convex deployment URL and optionally create the first admin.

Reference: `/Users/worsin/Development/MagicScraper/packages/desktop/`

---

### Task 14: Create `packages/desktop` directory structure

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/` (entire directory)

- [ ] **Step 1: Create the directory tree**

```
ConvexPress-Admin/packages/desktop/
  electron/
    main.ts
    preload.ts
    window-manager.ts
    tray.ts
    wizard/
      index.html
      wizard.js
      wizard.css
    ipc/
      index.ts
      window.ts
      config.ts
      auth.ts
      setup.ts
    utils/
      platform.ts
      app-state.ts
      safe-log.ts
  resources/
    icon.png
    icon.icns
    iconTemplate.png
    iconTemplate@2x.png
    entitlements.mac.plist
  scripts/
    notarize.cjs
  electron-builder.yml
  tsconfig.electron.json
  tsconfig.preload.json
  package.json
```

- [ ] **Step 2: Create placeholder files so the structure is navigable**

Each file gets a header comment describing its purpose. Implementation comes in subsequent tasks.

**Commit:** `feat(electron): scaffold desktop package directory structure`

---

### Task 15: Create `package.json` with Electron dependencies

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/package.json`

- [ ] **Step 1: Create package.json**

Based on MagicScraper's pattern (`@magic-app/desktop`):

```json
{
  "name": "@convexpress/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "tsup electron/main.ts electron/preload.ts --watch --outDir dist-electron --format esm,cjs --onSuccess 'electron .'",
    "build:electron": "tsup electron/main.ts --outDir dist-electron --format esm --external electron --external electron-updater --external electron-store --external fix-path && tsup electron/preload.ts --outDir dist-electron --format cjs --external electron && cp -r electron/wizard dist-electron/wizard",
    "build:web": "cd ../../apps/web && bun run build && cp -r dist ../../packages/desktop/dist",
    "build": "bun run build:web && bun run build:electron",
    "package:mac": "electron-builder --mac",
    "package:win": "electron-builder --win",
    "package:linux": "electron-builder --linux"
  },
  "dependencies": {
    "electron-store": "^10.0.0",
    "electron-updater": "^6.3.0",
    "fix-path": "3"
  },
  "devDependencies": {
    "@electron/notarize": "^3.1.1",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create tsconfig files**

`tsconfig.electron.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist-electron",
    "rootDir": "electron"
  },
  "include": ["electron/**/*.ts"],
  "exclude": ["electron/preload.ts"]
}
```

`tsconfig.preload.json` -- same but CJS output for preload script.

- [ ] **Step 3: Run `bun install`**

**Commit:** `feat(electron): add desktop package.json and TypeScript configs`

---

### Task 16: Create Electron main process

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/electron/main.ts`

- [ ] **Step 1: Implement main.ts**

Follow the MagicScraper pattern. Key differences from MagicScraper:

1. **App name**: `ConvexPress` (not `MagicScraper`)
2. **Config store**: `convexpress-config`
3. **No install path check**: ConvexPress bundles the built SPA, so `isAppInstalled()` just checks `setupComplete` and `convexUrl` in the config store
4. **Wizard or main**: If not set up, show wizard window. If set up, show main window loading `dist/index.html`
5. **CSP headers**: Allow `*.convex.cloud`, `*.convex.dev`, `convex.cloud`, `convex.dev` (for Convex connections)

Key sections (from MagicScraper reference):
```typescript
import { app, BrowserWindow, session } from "electron";
import Store from "electron-store";
import { registerAllIpcHandlers } from "./ipc/index.js";
import { createTray } from "./tray.js";
import { windowManager } from "./window-manager.js";

app.setName("ConvexPress");
// Dev userData separation
if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("userData"), "-dev"));
}

// Fix PATH for macOS .app bundles
const fixPath = require("fix-path");
fixPath();

const store = new Store({ name: "convexpress-config" });

// Install state check
function isSetupComplete(): boolean {
  return !!(store.get("setupComplete") && store.get("convexUrl"));
}

app.whenReady().then(async () => {
  // CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; connect-src 'self' https://*.convex.cloud https://*.convex.dev wss://*.convex.cloud wss://*.convex.dev; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
        ],
      },
    });
  });

  registerAllIpcHandlers(store);

  if (isSetupComplete()) {
    windowManager.createMainWindow(store);
    createTray(windowManager);
  } else {
    windowManager.createWizardWindow();
  }
});
```

- [ ] **Step 2: Implement single-instance lock**
- [ ] **Step 3: Implement app lifecycle (window-all-closed, activate)**

**Commit:** `feat(electron): implement main process with setup state check and CSP`

---

### Task 17: Create preload script

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/electron/preload.ts`

- [ ] **Step 1: Implement preload.ts**

Based on MagicScraper's preload but simplified (no installer bridge needed):

```typescript
import { contextBridge, ipcRenderer } from "electron";

const ALLOWED_INVOKE_CHANNELS = new Set([
  "window:minimize", "window:maximize", "window:close",
  "window:set-always-on-top", "window:is-maximized",
  "auth:get", "auth:set", "auth:remove",
  "config:get", "config:set", "config:test-connection",
  "app:get-version", "app:get-platform", "app:quit",
  "app:check-for-updates", "app:install-update",
  "setup:complete", "app:reload-from-setup",
]);

const ALLOWED_ON_CHANNELS = new Set([
  "window:maximized", "theme:os-changed", "navigate",
  "app:update-available", "app:update-downloaded", "app:update-error",
]);

contextBridge.exposeInMainWorld("convexpress", {
  invoke: (channel: string, ...args: unknown[]) => { /* allowlist check */ },
  on: (channel: string, callback: Function) => { /* allowlist check */ },
  window: { minimize, maximize, close, setAlwaysOnTop, isMaximized },
  app: { getVersion, getPlatform, quit, checkForUpdates, installUpdate },
  config: { get, set, testConnection },
});

contextBridge.exposeInMainWorld("electronAuth", {
  getItem, setItem, removeItem,
});

// Wizard bridge (separate, only available in wizard window)
contextBridge.exposeInMainWorld("convexpressSetup", {
  testConnection: (url: string) => ipcRenderer.invoke("config:test-connection", url),
  completeSetup: (config: SetupConfig) => ipcRenderer.invoke("setup:complete", config),
  getPlatform: () => ipcRenderer.invoke("app:get-platform"),
  launchApp: () => ipcRenderer.invoke("app:reload-from-setup"),
  quit: () => ipcRenderer.invoke("app:quit"),
});
```

- [ ] **Step 2: Add TypeScript declarations for `window.convexpress` and `window.electronAuth`**

Create a `.d.ts` file so the renderer code has type safety.

**Commit:** `feat(electron): implement preload script with allowlist-based IPC bridge`

---

### Task 18: Create window manager

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/electron/window-manager.ts`

- [ ] **Step 1: Implement WindowManager class**

Two window types:

**Main window** (loads the built SPA):
- Frameless: `frame: false` (custom title bar handled by React)
- macOS traffic lights: `titleBarStyle: "hiddenInset"` on macOS
- Dark background: `backgroundColor: "#09090b"`
- Loads: `file://${path.join(__dirname, '../dist/index.html')}`
- Preload: `dist-electron/preload.js`
- Min size: 1024x768

**Wizard window** (setup flow):
- Centered, non-resizable: 640x520
- Loads: `file://${path.join(__dirname, 'wizard/index.html')}`
- Preload: same preload.js
- Not frameless (standard window chrome)

- [ ] **Step 2: Implement `app:reload-from-setup` handler**

When the wizard completes, close wizard window and open main window:
```typescript
ipcMain.handle("app:reload-from-setup", () => {
  windowManager.destroyWizard();
  windowManager.createMainWindow(store);
  createTray(windowManager);
});
```

**Commit:** `feat(electron): implement window manager with main and wizard windows`

---

### Task 19: Create IPC handlers

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/electron/ipc/index.ts`
- Create: `ConvexPress-Admin/packages/desktop/electron/ipc/window.ts`
- Create: `ConvexPress-Admin/packages/desktop/electron/ipc/config.ts`
- Create: `ConvexPress-Admin/packages/desktop/electron/ipc/auth.ts`
- Create: `ConvexPress-Admin/packages/desktop/electron/ipc/setup.ts`

- [ ] **Step 1: `ipc/index.ts` -- Register all handlers**

```typescript
export function registerAllIpcHandlers(store: Store) {
  registerWindowHandlers();
  registerConfigHandlers(store);
  registerAuthHandlers(store);
  registerSetupHandlers(store);
}
```

- [ ] **Step 2: `ipc/window.ts` -- Window control**

Standard minimize, maximize, close, always-on-top. Same as MagicScraper.

- [ ] **Step 3: `ipc/config.ts` -- Config get/set + connection test**

```typescript
ipcMain.handle("config:get", (_e, key: string) => store.get(key));
ipcMain.handle("config:set", (_e, key: string, value: unknown) => store.set(key, value));
ipcMain.handle("config:test-connection", async (_e, url: string) => {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/.well-known/openid-configuration`);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
```

- [ ] **Step 4: `ipc/auth.ts` -- Encrypted auth token storage**

Separate encrypted store for Convex Auth JWT tokens:
```typescript
const authStore = new Store({ name: "convexpress-auth", encryptionKey: "convexpress-auth-v1" });
ipcMain.handle("auth:get", (_e, key) => authStore.get(key) ?? null);
ipcMain.handle("auth:set", (_e, key, value) => authStore.set(key, value));
ipcMain.handle("auth:remove", (_e, key) => authStore.delete(key));
```

- [ ] **Step 5: `ipc/setup.ts` -- Setup completion**

```typescript
ipcMain.handle("setup:complete", (_e, config: {
  mode: "server" | "client";
  convexUrl: string;
  pendingAdminCredentials?: { name: string; email: string; password: string };
}) => {
  store.set("mode", config.mode);
  store.set("convexUrl", config.convexUrl);
  if (config.pendingAdminCredentials) {
    store.set("pendingAdminCredentials", config.pendingAdminCredentials);
  }
  store.set("setupComplete", true);
});
```

**Commit:** `feat(electron): implement IPC handlers for window, config, auth, and setup`

---

### Task 20: Create setup wizard

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/electron/wizard/index.html`
- Create: `ConvexPress-Admin/packages/desktop/electron/wizard/wizard.js`
- Create: `ConvexPress-Admin/packages/desktop/electron/wizard/wizard.css`

Vanilla JS/HTML/CSS -- no React (runs before React bootstraps). Based on MagicScraper's wizard pattern.

- [ ] **Step 1: Create `wizard.js` state machine**

Simplified flow compared to MagicScraper (no git clone/install step):

```javascript
const state = {
  mode: '',        // 'server' or 'client'
  convexUrl: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  currentStep: 'welcome',
};

const STEPS = {
  welcome: 0,
  mode: 1,
  'server-config': 2,
  'server-test': 3,
  'admin-create': 4,
  'client-url': 2,
  'client-test': 3,
  complete: 4,
};
```

Steps:
1. **Welcome** -- ConvexPress logo, "Set up your CMS" tagline
2. **Mode** -- Server (create new instance) or Client (connect to existing)
3. **Config**:
   - Server: Convex deployment URL input (e.g., `https://adjective-animal-123.convex.cloud`)
   - Client: Same URL input
4. **Connection Test** -- Ping the Convex deployment, show success/failure
5. **Admin Create** (server only) -- Name, email, password for the first administrator
6. **Complete** -- "ConvexPress is ready!" with Launch button

- [ ] **Step 2: Create `index.html`**

Structure with all steps as hidden divs, step dot indicators, and ConvexPress branding. Professional dark theme matching the admin app.

- [ ] **Step 3: Create `wizard.css`**

Dark theme matching ConvexPress admin aesthetic. Card-based layout, smooth step transitions, proper form styling.

- [ ] **Step 4: Wire wizard to IPC**

```javascript
// Test connection
const result = await window.convexpressSetup.testConnection(state.convexUrl);

// Complete setup
await window.convexpressSetup.completeSetup({
  mode: state.mode,
  convexUrl: state.convexUrl,
  pendingAdminCredentials: state.mode === 'server' ? {
    name: state.adminName,
    email: state.adminEmail,
    password: state.adminPassword,
  } : undefined,
});

// Launch the app
await window.convexpressSetup.launchApp();
```

**Commit:** `feat(electron): implement setup wizard with server/client mode selection`

---

### Task 21: Create system tray

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/electron/tray.ts`

- [ ] **Step 1: Implement tray**

```typescript
import { Menu, Tray, nativeImage } from "electron";
import type { WindowManager } from "./window-manager.js";

let tray: Tray | null = null;

export function createTray(wm: WindowManager) {
  const icon = nativeImage.createFromPath(
    path.join(process.resourcesPath, "iconTemplate.png")
  );
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("ConvexPress");

  const menu = Menu.buildFromTemplate([
    { label: "Show ConvexPress", click: () => wm.show() },
    { type: "separator" },
    { label: "Quit", click: () => { setQuitting(true); app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => wm.toggle());
}
```

- [ ] **Step 2: Hide window on close (tray keeps app alive)**

In window-manager, handle the `close` event:
```typescript
mainWindow.on("close", (e) => {
  if (!isQuitting()) {
    e.preventDefault();
    mainWindow.hide();
  }
});
```

**Commit:** `feat(electron): add system tray with show/quit menu`

---

### Task 22: Update Vite config for Electron

**Files:**
- Modify: `ConvexPress-Admin/apps/web/vite.config.ts`

- [ ] **Step 1: Add conditional `base` for Electron builds**

The SPA must use relative paths when loaded via `file://` protocol:

```typescript
export default defineConfig(({ mode }) => ({
  // Use relative paths for Electron (file:// protocol)
  base: process.env.ELECTRON_BUILD === "true" ? "./" : "/",
  plugins: [/* existing */],
  // ... rest of config
}));
```

- [ ] **Step 2: Update `build:web` script in desktop package.json**

```json
"build:web": "cd ../../apps/web && ELECTRON_BUILD=true bun run build && cp -r dist ../../packages/desktop/dist"
```

- [ ] **Step 3: Verify asset paths work with `file://`**
  - Build the web app with `ELECTRON_BUILD=true`
  - Open `dist/index.html` directly in a browser
  - Verify all assets load (CSS, JS chunks, fonts)

**Commit:** `feat(vite): add relative base path for Electron builds`

---

### Task 23: Create AdminGate component

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/admin-gate.tsx`
- Create: `ConvexPress-Admin/apps/web/src/lib/electron.ts`

- [ ] **Step 1: Create `lib/electron.ts` utility**

```typescript
/** Check if running inside Electron */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!(window as any).convexpress;
}

/** Get the ConvexPress Electron bridge (null if not in Electron) */
export function getElectronBridge() {
  if (!isElectron()) return null;
  return (window as any).convexpress as ConvexpressBridge;
}
```

- [ ] **Step 2: Create AdminGate component**

Adapt MagicScraper's `admin-gate.tsx` for ConvexPress. Key changes:
- Replace `MagicScraper` branding with `ConvexPress`
- Replace `window.magicscraper` with `window.convexpress`
- Use ConvexPress auth hooks (`useLocalAuth`) instead of generic `useConvexAuth`
- Use Base UI components instead of shadcn

```typescript
interface AdminGateProps {
  children: React.ReactNode;
  mode?: "server" | "client";
  pendingCredentials?: { name: string; email: string; password: string };
}

export function AdminGate({ children, mode, pendingCredentials }: AdminGateProps) {
  // Same logic as MagicScraper:
  // 1. If authenticated -> render children
  // 2. If server mode + pending credentials -> auto-signup, then render
  // 3. If no admin exists + server mode -> show admin creation form
  // 4. If no admin exists + client mode -> show "waiting for server" message
  // 5. Otherwise -> render children (login handled by auth system)
}
```

The `AdminCreationForm` should use the existing Convex Auth `signIn("password", { flow: "signUp" })` pattern.

- [ ] **Step 3: Add `hasAdmin` query to backend**

If not already exists, create a query that checks if any administrator user exists:
```typescript
export const hasAdmin = query({
  args: {},
  handler: async (ctx) => {
    const adminRole = await ctx.db.query("roles").withIndex("by_slug", (q) => q.eq("slug", "administrator")).unique();
    if (!adminRole) return false;
    const admin = await ctx.db.query("users").withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id)).first();
    return !!admin;
  },
});
```

**Commit:** `feat(electron): create AdminGate component for first-run admin setup`

---

### Task 24: Update bootstrap (`main.tsx`) for Electron

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/main.tsx`

- [ ] **Step 1: Detect Electron and read config from electron-store**

```typescript
import { isElectron, getElectronBridge } from "./lib/electron";
import { AdminGate } from "./components/admin-gate";

// Determine Convex URL
let convexUrl = import.meta.env.VITE_CONVEX_URL;
let electronMode: "server" | "client" | undefined;
let pendingCredentials: { name: string; email: string; password: string } | undefined;

if (isElectron()) {
  const bridge = getElectronBridge()!;
  convexUrl = await bridge.config.get("convexUrl") as string;
  electronMode = await bridge.config.get("mode") as "server" | "client";
  const pending = await bridge.config.get("pendingAdminCredentials");
  if (pending) pendingCredentials = pending as typeof pendingCredentials;
}

const convex = new ConvexReactClient(convexUrl);
```

- [ ] **Step 2: Wrap router with AdminGate in Electron mode**

```typescript
Wrap: function WrapComponent({ children }) {
  const auth = useLocalAuth();
  const inner = (
    <ConvexProviderWithAuth client={convex} useAuth={useLocalAuth}>
      <LocalAuthProvider value={auth}>
        {children}
      </LocalAuthProvider>
    </ConvexProviderWithAuth>
  );

  if (isElectron()) {
    return (
      <AdminGate mode={electronMode} pendingCredentials={pendingCredentials}>
        {inner}
      </AdminGate>
    );
  }
  return inner;
},
```

- [ ] **Step 3: Use electron-store for auth token persistence**

When in Electron, the Convex Auth should use `window.electronAuth` (from preload) instead of `localStorage` for token storage. This provides encrypted storage.

Modify `useLocalAuth` hook (or the Convex Auth configuration) to use `electronAuth` when available:
```typescript
const storage = isElectron()
  ? { getItem: window.electronAuth.getItem, setItem: window.electronAuth.setItem, removeItem: window.electronAuth.removeItem }
  : localStorage;
```

- [ ] **Step 4: Handle async initialization**

Since electron-store reads are async (IPC), the main.tsx bootstrap needs to handle the async setup before rendering. Use a simple pattern:
```typescript
async function bootstrap() {
  if (isElectron()) {
    // async reads from electron-store
  }
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
bootstrap();
```

**Commit:** `feat(electron): update main.tsx bootstrap for Electron with async config and AdminGate`

---

### Task 25: Create electron-builder configuration

**Files:**
- Create: `ConvexPress-Admin/packages/desktop/electron-builder.yml`
- Create: `ConvexPress-Admin/packages/desktop/resources/entitlements.mac.plist`
- Create: `ConvexPress-Admin/packages/desktop/scripts/notarize.cjs`

- [ ] **Step 1: Create electron-builder.yml**

```yaml
appId: com.convexpress.admin
productName: ConvexPress

files:
  - dist/**/*
  - dist-electron/**/*
  - package.json

extraResources:
  - from: resources/iconTemplate.png
    to: iconTemplate.png
  - from: resources/iconTemplate@2x.png
    to: iconTemplate@2x.png

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.icns
  category: public.app-category.business
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist

afterSign: scripts/notarize.cjs

dmg:
  window:
    width: 540
    height: 380
  contents:
    - x: 140
      y: 190
    - x: 400
      y: 190
      type: link
      path: /Applications

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: resources/icon.png
  category: Office

publish:
  provider: github
  owner: ConvexPress
  repo: ConvexPress-Admin
```

- [ ] **Step 2: Create entitlements plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.network.client</key><true/>
</dict>
</plist>
```

- [ ] **Step 3: Create notarize script**

```javascript
const { notarize } = require("@electron/notarize");
exports.default = async function notarizing(context) {
  if (process.platform !== "darwin" || !process.env.APPLE_ID) return;
  await notarize({
    appBundleId: "com.convexpress.admin",
    appPath: `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

- [ ] **Step 4: Test build locally**

```bash
cd ConvexPress-Admin/packages/desktop
bun install
bun run build
bun run package:mac  # or appropriate platform
```

Verify:
- DMG is created
- App opens
- Wizard appears on first launch
- After wizard, SPA loads correctly

**Commit:** `feat(electron): add electron-builder config for macOS, Windows, and Linux packaging`

---

## Phase 5: Final Polish (3 tasks)

---

### Task 26: Update CLAUDE.md with Electron architecture

**Files:**
- Modify: `/Users/worsin/Development/ConvexPress/.claude/CLAUDE.md`

- [ ] **Step 1: Add Electron section to Architecture**

Under "Two Apps, One Database", add:

```markdown
### Desktop Distribution

The Admin app is distributed as an Electron desktop app:

| Platform | Format | Builder |
|----------|--------|---------|
| macOS | DMG | electron-builder |
| Windows | NSIS installer | electron-builder |
| Linux | AppImage | electron-builder |

**Two-tier install model:**
- **Server mode**: First user creates a new ConvexPress instance, sets Convex URL, creates admin account
- **Client mode**: Connects to an existing ConvexPress instance, login only

The Electron app bundles the built Vite SPA. External service API keys are configured through the admin settings UI (Settings > AI, Settings > Email, Settings > Search, Settings > Integrations).
```

- [ ] **Step 2: Update settings section references**

Note that API keys for Resend, Meilisearch, and AI providers are managed through settings UI with env var fallback.

- [ ] **Step 3: Add Desktop Expert to expert registry if desired**

**Commit:** `docs: update CLAUDE.md with Electron architecture and settings-first key management`

---

### Task 27: End-to-end integration testing

This is a manual/scripted verification pass. No new code unless bugs are found.

- [ ] **Step 1: Test AI generation with settings-based API keys**
  - Configure OpenRouter API key in Settings > AI
  - Generate content using AI Content Generation system
  - Verify it uses the settings-based key, not env var
  - Remove env var, verify settings key still works

- [ ] **Step 2: Test email sending with settings-based Resend key**
  - Configure Resend API key in Settings > Email
  - Trigger a password reset or notification email
  - Verify email is delivered

- [ ] **Step 3: Test WordPress sync UI**
  - Add a WordPress site connection
  - Test connection
  - Start a sync (if test WordPress available)
  - Verify progress display

- [ ] **Step 4: Test Electron app lifecycle**
  - Fresh launch -> wizard appears
  - Server mode setup -> admin created -> main app loads
  - Quit and relaunch -> main app loads directly (no wizard)
  - Tray icon works (show/hide/quit)
  - Auto-update check (if configured)

- [ ] **Step 5: Test Client mode**
  - Fresh launch -> wizard -> Client mode
  - Enter Convex URL of existing instance
  - Connection test passes
  - App loads, shows login (not admin creation)

**Commit:** `test: verify end-to-end integration for all Phase 1-4 features` (if fixes needed)

---

### Task 28: Tag release

- [ ] **Step 1: Clean up any remaining TODOs**
  - Search for `TODO`, `FIXME`, `HACK` in modified files
  - Address or document each one

- [ ] **Step 2: Ensure all tests pass**
  - `cd ConvexPress-Admin && bun run typecheck` (or equivalent)
  - Fix any TypeScript errors

- [ ] **Step 3: Create release commit and tag**

```bash
git add -A
git commit -m "release: ConvexPress v1.0.0-beta — production-ready with Electron desktop app

- Remove all Convex Auth references (Phase 1)
- Add integrations settings pages for AI, Email, Search (Phase 2)
- Verify WordPress sync UI completeness (Phase 3)
- Build Electron desktop app with setup wizard (Phase 4)
- End-to-end integration verification (Phase 5)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git tag v1.0.0-beta
```

**Commit:** `release: ConvexPress v1.0.0-beta`

---

## Task Dependency Graph

```
Phase 1 (Convex Auth removal):
  Task 1 ──┐
  Task 2 ──┼── Task 3 (deploy after schema change)
            │
Phase 2 (Settings pages):   (can start after Task 2)
  Task 4 ──┐
  Task 5 ──┤
  Task 6 ──┤
  Task 7 ──┼── Task 9 (audit pass after all backends updated)
  Task 8 ──┘
            │
Phase 3 (WordPress Sync):   (independent of Phase 2)
  Task 10 ─┐
  Task 11 ─┼── Task 13 (Elementor audit after UI verified)
  Task 12 ─┘
            │
Phase 4 (Electron):          (depends on Phase 1 + Phase 2)
  Task 14 ─── Task 15 ─── Task 16 ─── Task 17 ─── Task 18 ─── Task 19
                                                       │
  Task 20 (wizard, parallel with 18-19) ───────────────┤
  Task 21 (tray, parallel with 20) ────────────────────┤
  Task 22 (vite config, parallel with 16-19) ──────────┤
  Task 23 (AdminGate, parallel with 20-22) ────────────┼── Task 24 ─── Task 25
                                                                          │
Phase 5 (Polish):                                                         │
  Task 26 ─── Task 27 ─── Task 28 ────────────────────────────────────────┘
```

**Parallelization opportunities:**
- Tasks 1 + 2 can run in parallel (different files)
- Tasks 5-8 can run in parallel (independent settings pages)
- Tasks 10-12 can run in parallel (review tasks)
- Phase 3 is fully independent of Phase 2
- Tasks 16-22 have significant parallelism within Phase 4

**Estimated effort:** ~40-60 hours of implementation work across all 28 tasks.
