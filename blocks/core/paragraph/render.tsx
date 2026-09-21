import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { RichText } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock(
	"core/paragraph",
	({ attrs }) => <RichText content={attrs.body} />,
	{ flow: "prose" },
);
