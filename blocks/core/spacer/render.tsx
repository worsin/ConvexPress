import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/original-utilities.css";

// The canonical Section owns the saved spacing intent and template tokens.
// A second padded section would add an unwanted gap even for spacing="none".
export default defineBlock("core/spacer", ({ treatment }) =>
	treatment ? <div className="cp-original-spacer" data-size={treatment.values.size} aria-hidden="true" /> : null,
);
