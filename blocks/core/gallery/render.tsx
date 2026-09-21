/** Staged canonical Library view; shared gallery behavior has one implementation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ImageGallery } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/image-gallery";
export default defineBlock("core/gallery", ImageGallery);
