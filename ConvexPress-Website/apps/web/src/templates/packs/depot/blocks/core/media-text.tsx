import { OriginalMediaText } from "../../../../sdk/block-renderer/original-media-text";
import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
import "../../../../../../../../../blocks/core/media-text/media-text.css";
export default defineBlock("core/media-text", ({ attrs, resources, treatment }) => {
	const copy = (
		<P.Stack gap="md">
			<Intro {...attrs} />
			<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
		</P.Stack>
	);
	return (
		<div className="depot-media-text cp-library-media-text">
			{treatment ? <OriginalMediaText side={treatment.values.mediaPosition} copy={copy} media={attrs.mediaId
    ? <ResolvedImage id={attrs.mediaId} alt={attrs.mediaAlt || attrs.heading} resources={resources} />
    : <div className="cp-original-media-placeholder" aria-label={attrs.mediaAlt || "Media placeholder"} />
   } /> : attrs.mediaId ? (
				<P.Split ratio="equal" gap="md" align="center">
					<ResolvedImage
						id={attrs.mediaId}
						alt={attrs.mediaAlt}
						resources={resources}
					/>
					{copy}
				</P.Split>
			) : (
				copy
			)}
		</div>
	);
});
