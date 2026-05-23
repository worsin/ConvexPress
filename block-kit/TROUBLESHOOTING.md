# Troubleshooting

## Block Does Not Render

- Confirm the website registry includes the block name.
- Confirm the saved `version` matches a supported migration path.
- Confirm the attrs pass the website Zod schema.

## Edits Do Not Save

- Confirm the admin editor calls `onChange` with the complete attrs object.
- Confirm the canvas is using the block mutations, not only local state.
- Check for a `blocksRevision` conflict.

## Type Check Fails

- Keep admin and website schemas in sync.
- Export the inferred attrs type from the schema file.
- Add the block name to `CoreBlockName` when it is a first-party block.

