import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { DocumentNavigation } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/navigation";
export default defineDataBlock(
	"core/table-of-contents",
	"content.headings",
	({ attrs, data }) => (
		<DocumentNavigation
			title={attrs.title}
			items={data.items.filter((item) => item.level <= attrs.depth)}
		/>
	),
);
