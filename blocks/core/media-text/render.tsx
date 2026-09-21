/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/media-text", ({ attrs, resources }) => {
	const copy = (
		<P.Stack gap="lg">
			<Intro {...attrs} />
			<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
		</P.Stack>
	);
	return attrs.mediaId ? (
		<P.Split gap="lg">
			{copy}
			<ResolvedImage
				id={attrs.mediaId}
				alt={attrs.mediaAlt}
				resources={resources}
			/>
		</P.Split>
	) : (
		copy
	);
});
