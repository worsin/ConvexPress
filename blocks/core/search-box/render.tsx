import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import {
	SearchBox,
	searchDestination,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/utility-search";
export default defineBlock("core/search-box", ({ attrs }) => (
	<SearchBox
		{...searchDestination(attrs.scope)}
		placeholder={attrs.placeholder}
		label={attrs.scope === "all" ? "Search this site" : `Search ${attrs.scope}`}
	/>
));
