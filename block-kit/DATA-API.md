# Data API

Use the backend block mutations instead of saving whole documents from the editor surface.

## Mutations

- `blocks.mutations.updateBlockAttrs`
- `blocks.mutations.updateBlockLayout`
- `blocks.mutations.insertBlock`
- `blocks.mutations.moveBlock`
- `blocks.mutations.duplicateBlock`
- `blocks.mutations.removeBlock`
- `blocks.mutations.replaceBlocks`

## Query

- `blocks.queries.getForDocument`

## Live-Save Rules

- Text input may debounce briefly.
- Reorder, insert, remove, duplicate, and layout changes save immediately.
- Pass `expectedRevision` when available.
- On conflict, refresh the document before overwriting.

