import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/original-utilities.css";

export default defineBlock("core/divider", ({ treatment }) =>
	treatment ? <hr className="cp-original-divider" data-variant={treatment.values.variant} /> : <P.Divider />,
	{ flow: "prose" },
);
