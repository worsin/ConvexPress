import { OriginalMediaText } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/original-media-text";
/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./media-text.css";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/media-text", ({ attrs, resources, treatment }) => {
	const copy = (
		<P.Stack gap="lg">
			<Intro {...attrs} />
			<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
		</P.Stack>
	);
	return (
		<div className="cp-library-media-text">
			{treatment ? <OriginalMediaText side={treatment.values.mediaPosition} copy={copy} media={attrs.mediaId
    ? <ResolvedImage id={attrs.mediaId} alt={attrs.mediaAlt || attrs.heading} resources={resources} />
    : <div className="cp-original-media-placeholder" aria-label={attrs.mediaAlt || "Media placeholder"} />
   } /> : attrs.mediaId ? (
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
			)}
		</div>
	);
});
