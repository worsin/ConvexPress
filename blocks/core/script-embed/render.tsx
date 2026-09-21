import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ConsentEmbed } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/consent-embed";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
/** The catalog's two reviewed providers execute their own player scripts inside
 * the external sandbox. No provider code enters the first-party document. */
export default defineBlock("core/script-embed", ({ attrs }) =>
	attrs.resourceId ? (
		<ConsentEmbed
			url={
				attrs.provider === "youtube"
					? `https://www.youtube.com/embed/${attrs.resourceId}`
					: `https://player.vimeo.com/video/${attrs.resourceId}`
			}
			title={attrs.provider === "youtube" ? "YouTube player" : "Vimeo player"}
			kind="video"
		/>
	) : (
		<P.Text tone="muted">Choose a provider video to display its player.</P.Text>
	),
);
