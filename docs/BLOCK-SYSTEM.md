# ConvexPress Block System

ConvexPress pages are composed from block envelopes:

```ts
{
  id: string;
  name: string;
  version: number;
  attrs: Record<string, unknown>;
  innerBlocks?: ConvexPressBlock[];
}
```

The admin editor owns content editing. The Website app owns public rendering.
Visual presentation should live in Website renderers and design skills, not in
admin block attrs.

## Sources

- Core blocks: `ConvexPress-Admin/apps/web/src/lib/blocks/registry.tsx`
- Official add-on blocks: `ConvexPress-Admin/apps/web/src/blocks/<id>/`
- Site-local blocks: `ConvexPress-Admin/apps/web/src/blocks.local/<id>/`
- Website official renderers: `ConvexPress-Website/apps/web/src/blocks/<id>/`
- Website local renderers: `ConvexPress-Website/apps/web/src/blocks.local/<id>/`

Local blocks are scanner-discovered and should not require editing the core
registry. This is what keeps platform updates from deleting custom work.

## Management

Admin users manage blocks at Pages -> Blocks. That screen shows registration
source, renderer status, version, usage count, and enabled/disabled state.
Disabling a block hides it from new insertion and AI generation. It does not
delete existing page content.
