---
name: site-build
description: Build or finish an entire ConvexPress business website by composing the template, extension and block kits, authoring actual site data, and verifying an isolated staging site before promotion.
---

# site-build

Use this orchestration skill when the user asks for a complete business website, storefront or member site. It coordinates existing systems rather than inventing a parallel CMS or embedding business copy in a template.

Read `references/WORKFLOW.md` next, then `template-kit/CONTRACT.md`, the installed extension manifests and the relevant block-kit references at repository root. Keep the user's current authorization and explicit account/environment boundaries authoritative. Do not repeat already-granted approval requests. A local build, static test or deployment is not rendered acceptance.

Work in this order:

1. Resolve the exact business/site identity, selected checkout, provider account, and distinct staging/live Convex deployments. Each site owns its database; staging and live are separate instances of that same site. Never select a backend merely because it is already configured locally.
2. Produce a concrete site brief and a small content/route matrix from the user's business description. Distinguish authored claims and imagery from UI labels. Record missing external inputs while progressing independent work.
3. Select an installed pack or apply `template-build`. Implement new surfaces through `template-add-surface`. Use real Customize modules, brand presets and SDK view models.
4. Enable installed plugins and their declared dependencies for the planned workflows. Add a missing plugin through the extension kit; author a missing composition through the block kit. Do not imitate plugins with static cards or pretend an unimplemented transaction exists.
5. Author media, pages/blocks, menus, products, events, posts and member content through the selected site's authorized Admin UI/API. Reuse existing records by stable slug/ID; persist returned IDs in a secret-free run manifest. Never infer IDs or write directly to database tables to bypass normal validators.
6. Configure the homepage, menu locations and template settings through existing settings APIs. Handle version conflicts by reading and reconciling the latest snapshot. Respect reserved page-route errors; never silently rename the user's requested URL.
7. Run code checks and then the real staging acceptance matrix. Inspect actual authored data and interactions in the browser. Use the screenshot evidence runner only within the session's browser authorization and one-browser ownership rules.
8. Promote the reviewed site configuration/content through supported same-site mechanisms, using explicit live confirmation where required. Verify the live identity and rendered data again. Record done, failed and still-unverified outcomes separately.

Deliver a concise site handoff with staging/live URLs, business/site identity, enabled workflows, implemented template coverage, authored records, test and screenshot evidence, and any material acceptance gaps. Keep credentials, private keys, session state and customer personal data out of the handoff.
