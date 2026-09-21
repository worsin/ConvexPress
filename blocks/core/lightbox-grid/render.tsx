/** Staged canonical Library view; no query/provider or legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ImageGallery } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/image-gallery";

export default defineBlock("core/lightbox-grid", ({ attrs, resources }) => (
	<ImageGallery
		attrs={{ items: attrs.items, lightbox: true }}
		resources={resources}
	/>
));
