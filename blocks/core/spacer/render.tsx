import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";

// The canonical Section owns the saved spacing intent and template tokens.
// A second padded section would add an unwanted gap even for spacing="none".
export default defineBlock("core/spacer", () => null);
