import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { DocumentNavigation } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/navigation";
export default defineDataBlock(
	"core/anchor-nav",
	"content.anchors",
	({ attrs, data }) => (
		<DocumentNavigation
			compact
			title="Explore this page"
			items={attrs.source === "manual" ? attrs.items : data.items}
		/>
	),
);
