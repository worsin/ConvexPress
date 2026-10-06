# Author a page and change its template

Use the native ConvexPress Admin app connected to the intended website. Check
the website and environment in the switcher before editing. Each environment
has its own content and publication state.

## Write and publish

1. Open **Pages** and create or open a page. Use the block inserter to add Library
   blocks or a pattern. A pattern creates independent editable blocks; a Saved
   synced item follows its selected reusable revision policy.
2. Select a block in the outline and edit its fields. Use the actual media and
   resource pickers for site-owned content. Correct required or invalid fields
   before saving. Move or nest blocks through supported destinations; use
   Undo/Redo to review the result.
3. Inspect the connected Website preview at desktop and phone widths. Live-data
   blocks reflect accessible records and enabled extensions in the selected site.
   An empty result can mean there is no eligible published record.
4. Choose **Save changes** and wait for **All changes saved**. Reopen the page to
   confirm the saved content. Private autosave/device recovery does not publish.
5. In the page's publication controls, select **Publish now**, choose **Review
   publication change**, then **Confirm publication change** when ready. Open its
   public Website route and verify text, media, links and actions. Saving changes to an
   already published page can update its public content; use a draft or staging
   environment when changes need review before going live.

## Choose and customize a template

Open **Templates** to inspect the installed Core, Journal, Depot and Aster House
packs. Review the intended pack and environment before applying a template change.
Recheck the same content after switching: a pack changes presentation, while
saved block content and resource references remain authored data.

Open **Customize** for colors, typography, layout and supported header, footer,
menu and Shop options. **Save draft** preserves a private draft; **Review changes**
opens publication review. On Live, confirm the live-site checkbox, then choose
**Publish settings**. **Reset to template defaults** removes overrides for the
selected group; Undo/Redo applies to draft changes. Inspect the published Website
after publication, including narrow navigation and forms.

## Recover safely

If offered **Restore device draft** or **Restore Website draft**, inspect which
copy you want before choosing it. Restoring a draft brings edits back into the
editor; save deliberately afterward. A revision restore creates a new saved
revision rather than erasing intervening history.

If a conflict reports newer published settings, your draft is retained. Preserve
any edits you need before choosing **Reload published version** and reapplying
them. If saving or publication has an uncertain result, read the saved state
before retrying. If preview loses its session, reconnect through the app; do not
paste operator credentials into a public Website URL.

## Extend the system

Use a pattern for a reusable starting layout, synced content for an intentionally
shared section, and **Custom blocks** for reviewed runtime definitions. AI
proposals require a configured provider and review before saving/approval.
SDK promotion distributes an exact reviewed definition; it does not rewrite
existing pinned pages. See [promotion](references/promotion.md).

Developers can use [the block workflow](WORKFLOW.md), the repository's
`ConvexPress-Website/template-kit/README.md` and
`ConvexPress-Admin/extension-kit/WORKFLOW.md`. BlockDemo is the internal catalog
for examples and interactions. A passing example or source check is not proof
that an external payment, email, social or AI provider is configured.
