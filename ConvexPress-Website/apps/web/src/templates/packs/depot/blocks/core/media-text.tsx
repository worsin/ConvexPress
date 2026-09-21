import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/media-text", ({ attrs, resources }) => {
	const copy = (
		<P.Stack gap="md">
			<Intro {...attrs} />
			<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
		</P.Stack>
	);
	return (
		<div className="depot-media-text">
			{attrs.mediaId ? (
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
