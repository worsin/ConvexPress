---
name: block-build
description: Build a new ConvexPress canonical Library block with a root specification, SDK renderer, generated editor controls and verified contracts.
---

Locate the repository root containing `blocks/`, `scripts/blocks/` and both ConvexPress apps. Read `block-kit/CONTRACT.md`, `WORKFLOW.md`, `DATA-API.md` and the nearest installed reference from `references/README.md`.

For the user's requested behavior, choose a stable reusable namespace/name and run `bun run create:block namespace/name --title "Title"`. Adapt its real heading/message scaffold; the create command does not interpret prose. Author root `block.json`, adjacent `render.tsx` and meaningful tests. Do not create mirrored app schemas, old manifests, registry unions or arbitrary runtime code.

Use SDK primitives and the active template's tokens. Dynamic data requires typed resolver and host integration with scoped backend checks, not a hardcoded fixture. Preserve page content and current user sessions. Changes to existing persisted contracts belong in block-add-feature.

Execute the canonical sync and acceptance steps in WORKFLOW.md. Prove the block's actual requested behavior, editor save/reopen and rendered states; identify any still-unverified boundaries. A passing scaffold is a starting point, not a finished design or production approval.
