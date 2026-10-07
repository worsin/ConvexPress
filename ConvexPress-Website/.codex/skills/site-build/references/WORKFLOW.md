# Site build workflow

## 1. Establish the actual target

Record the repository/worktree, website key, business name, instance keys, environment kinds, and deployment origins. Verify these against the Admin connection/health identity before authoring. A fleet site has its own Convex database; another agency client's deployment is never a convenient authoring target. A staging/live pair shares the website key while retaining separate instance identities and data.

Use the provider account named by the user. Provisioning and Cloudflare deployment stay with the authorized platform workflow. This skill does not mint credentials, run a second hidden browser, or bypass the selected account. Read secrets only through the existing secure flow; do not place them in manifests or command arguments.

## 2. Build a reviewable site plan

Create a local run manifest containing:

- Business brief: audience, real or explicitly fictional business status, offer, visual direction and tone.
- Identity: website key and selected staging/live instance keys; never access tokens.
- A content matrix: route, page/plugin owner, audience/access gate, data source and acceptance action.
- Template pack and requested variants; enabled plugins and dependencies.
- Authoring records: system, stable slug, returned ID, current status and source media rights/attribution.
- Evidence: checks, fixture paths, screenshots and completed browser actions; unresolved inputs and unverified states.

For a retreat/shop example, use a CMS homepage, a story page at an unreserved slug, Events experience routes, Products catalog/detail, Journal articles and the member dashboard. Event registration currently follows an authored external registration URL; paid event ticketing and RSVP must not be claimed as built unless implemented separately.

## 3. Compose the kits

Template kit: `ConvexPress-Website/template-kit/`. Author business content in CMS records; keep pack code about composition and configurable defaults. Preserve public/password/member/error/loading states and SDK actions.

Extension kit: `extensions/<id>/manifest.ts` declares plugin setting keys, route prefixes, surfaces, dashboard navigation and dependencies. Consult the installed registry before enabling a feature. The Events reference lives in both apps and the Admin-owned Convex backend.

Block kit: repository-root `block-kit/references/README.md`. `reference/field-guide` covers controls and portable data; `events/upcoming` reads live Events DTOs. `commerce/product-showcase` reads live catalog prices/stock. Use these when the content matrix needs live data rather than copying records into page attrs.

## 4. Author through current Admin contracts

Read each current validator before building a call. The normal authenticated site APIs include:

| Work | Current entry points / source |
| --- | --- |
| Media | `media.mutations.generateUploadUrl`, `create`, `update`; follow `components/media/MediaField.tsx` for the actual upload/library flow |
| Pages | `canonicalDocuments.create({type:"page",title})`, then `save` with returned `postId`/revision and canonical blocks; use `setSettings`/`setPublication` for their separate revision-checked operations |
| Posts | `canonicalDocuments.create({type:"post",title})`, `save`, `setSettings`, `setPublication`; generic legacy create endpoints are retired. Preserve revision and draft/publish scheduling rules |
| Events | `extensions.events.mutations.create`, `update`; backend enforces plugin and capability checks |
| Menus | `menus.mutations.createMenu`, `addMenuItem`, `updateMenuItem`, `assignMenuToLocation` |
| General/plugin/homepage settings | `settings.mutations.updateSection`; inspect current section defaults and validators |
| Template configuration | `settings.templateDrafts.snapshot` and `publish` with expected revision; use save/load draft APIs for resumable editing |
| Shop/member data | Installed commerce/membership plugin Admin flows and their current validators; prices, inventory and access grants remain system records |

Before creating, look up by ID or stable slug and reconcile the existing record. After writing, read it back, preserve its returned ID and check the actual public DTO. Retrying an uncertain write must not create duplicate products, menus, pages or events. Keep destructive cleanup explicit and limited to the run's owned records.

`ConvexPress-Admin/output/playwright/shopping-experience/author-site.mjs` is historical evidence for media, page/block and menu authoring sequences. Its old layout selectors and hardcoded fixture plan are not a current end-to-end command. Read the relevant functions and adapt to today's Templates/Customize UI and selected site; never execute the old fixture wholesale.

Reserved pretty-page routes are checked by `helpers/pageRoutePolicy.ts` and the backend page-write guard. `/products`, `/events` and auth routes belong to platform/plugin surfaces. A normal page can be `/our-story`; a legacy conflicting page remains editable at its `/page/...` address. Do not hide a conflict by generating a different URL without reporting it.

## 5. Staging evidence

Run package types, meaningful handler/component tests, `check:blocks`, `check:templates`, and the offline template SSR smoke. Then browse the actual staging deployment:

- Homepage and authored child pages: correct text, image identity/alt, menu destinations and responsive composition.
- Public/anonymous versus signed-in member/operator states: password/member gates, dashboard access and restricted error behavior.
- Products: correct live prices/stock, cart changes, checkout/review and the authorized transaction outcome. Use the configured payment test mode for synthetic test purchases; never claim a completed payment from a rendered form.
- Events: current dates/timezone, cancelled states, registration destination and updates without resaving a page block.
- Enabled courses, forms, gallery, search, support and other plugins: at least one meaningful create/read/action cycle or a documented reason the flow remains unverified.
- Customize: draft preview, nested header/footer/menu edits, reset/undo, save/reload and version conflict handling.

Create screenshot cases using actual slugs. The optional `scripts/template-screenshots.mjs` writes full pages, per-surface crops, an evidence index and gallery. It is not automatically run by static checks and does not replace interaction tests. Keep authenticated state files private and outside committed artifacts.

## 6. Promote and hand off

Recheck that the live target belongs to the same website key. Use supported configuration/content promotion and conflict checks; don't copy provider credentials or private user/session records. Follow the user's deployment authorization and any explicit confirmation in the live-publish UI. Re-open live routes and verify rendered data plus the environment identity. Preserve staging for repeatable regression checks unless cleanup was requested.

A completed handoff separates: implemented code, authored data, automated checks, observed staging workflows, observed live workflows, and remaining acceptance gaps. Include exact source/evidence paths and the site URLs. A deployed bundle or HTTP 200 alone is not a finished business website.
