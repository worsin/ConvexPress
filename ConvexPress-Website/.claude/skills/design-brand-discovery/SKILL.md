---
name: design-brand-discovery
description: Use when the user asks to set up, update, change, or define the site's brand / vibe / mood / look-and-feel — including phrases like "set up the brand", "change the brand voice", "update the vibe", "redo the brand", "make the site feel more X", "the brand should be Y". This skill interviews the user and writes the brand doc to Convex. Every other design:* skill reads what this one writes.
---

# design-brand-discovery

You are interviewing the user to define (or update) the **brand doc** —
the single source of truth that drives every visual decision the other
`design:*` skills make. Output: an upsert to the brand doc in Convex
via `settings:setBrand` (or fallback to writing a local draft).

## Why this skill exists

Every other design skill reads `api.settings.queries.getBrand`. If that
returns `null` or is stale, downstream skills can't produce coherent
designs. This skill is the *only* one that authors the brand. The user
should run it once at site setup and re-run it whenever the brand
shifts.

## Workflow

1. **Read** `design-kit/BRAND.md` so you know the exact shape of the
   brand doc and what each field controls.

2. **Pull the existing brand doc** (if any):
   ```bash
   bunx convex run settings:getBrand
   ```
   If it exists, ask the user whether they want to "extend" (update
   selected fields) or "redo" (start fresh). Default: extend.

3. **Interview the user.** Ask the questions below conversationally,
   one or two at a time. Don't dump the whole list. Wait for answers.
   Skip what the user clearly doesn't care about.

   - **Mood** (REQUIRED): "Describe the feel of the site in a sentence
     or two. What should it evoke?" Capture as `moodPrompt`.
   - **References:** "Any sites or images that capture the vibe?
     Paste links." Capture as `references[]`.
   - **Voice:** "How should the writing sound? Warm? Direct? Playful?
     Formal?" Capture as `voice`.
   - **Industry / category:** "What kind of business is this?"
     Capture as `industry`.
   - **Palette pins (optional):** "Any colors you absolutely want or
     absolutely don't want?" Capture pins as `palette.*`.
   - **Type pins (optional):** "Any fonts you already have in mind?"
     Capture as `typography.display` and `typography.body`.
   - **Density:** "Tight and packed, comfortable, or roomy?" Capture
     as `density` (one of `compact`, `comfortable`, `spacious`).
   - **Radius:** "Sharp corners, subtle, rounded, or pill-shaped
     buttons?" Capture as `radius`.
   - **Hard rules:** "Anything that MUST or MUST NOT be on the site?
     Phone number in header? No stock photography? Trust badges on
     product pages?" Capture as `hardRules[]`.
   - **Logo / favicon:** "Do you have a logo URL already in the media
     library?" Capture as `logoUrl` and `faviconUrl`.

4. **Confirm before writing.** Echo the captured brand doc back to the
   user as a JSON summary and ask "Save this?"

5. **Write the brand doc** via:
   ```bash
   bunx convex run settings:setBrand '<JSON of the brand doc>'
   ```
   If `settings:setBrand` does not exist (you'll get "Could not find
   function"), this means the admin backend hasn't built the brand
   setter yet. Fallback: write the brand JSON to
   `design-kit/.brand-draft.json` and tell the user the admin needs to
   add `setBrand` mutation before this can persist.

6. **Suggest next step.** After saving, recommend `design:regenerate-all`
   (or one specific `design:*` skill) so the new brand actually shapes
   the site.

## Output contract

- **Conversation:** the interview is the deliverable. Don't write code.
- **Persistence:** either Convex via `settings:setBrand`, or a local
  draft at `design-kit/.brand-draft.json`.
- **Shape:** matches the `BrandDoc` interface in `design-kit/BRAND.md`
  exactly. Any field not collected stays undefined — don't fabricate.
- **Confirmation:** the user explicitly approves before the write.

## When NOT to use this skill

- The user is asking for a template, not the brand → use the relevant
  `design:*` skill directly. (If that template needs a brand doc and
  none exists, that skill will redirect them here.)
- The user wants to change *site settings* like name/tagline → that's
  the Settings system in admin, not this skill.
