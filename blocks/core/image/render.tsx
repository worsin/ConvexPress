/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/image", ({ attrs, resources }) => (
	<P.Stack gap="md">
		{attrs.mediaId ? (
			<ResolvedImage
				id={attrs.mediaId}
				alt={attrs.alt}
				caption={attrs.caption}
				resources={resources}
			/>
		) : attrs.caption ? (
			<P.Text tone="muted">{attrs.caption}</P.Text>
		) : null}
		{attrs.href && (
			<P.Link
				href={attrs.href}
				label={attrs.alt || attrs.caption || "Open image destination"}
			/>
		)}
	</P.Stack>
));
