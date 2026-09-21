import {
	defineBlock,
	BlockRenderError,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Prose,
	ResolvedImage,
	Action,
	CardCopy,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/utilities.css";
export default defineBlock("core/author-bio", ({ attrs, resources }) => {
	if (attrs.userId)
		throw new BlockRenderError(
			"UNRESOLVED_DEPENDENCY",
			"core/author-bio",
			"Resolve the referenced author through an authorized public user adapter before rendering this bio.",
		);
	return (
		<aside className="cp-library-author" data-media={Boolean(attrs.mediaId)}>
			{attrs.mediaId && (
				<div className="cp-library-author-portrait">
					<ResolvedImage
						id={attrs.mediaId}
						alt={attrs.name || undefined}
						resources={resources}
					/>
				</div>
			)}
			<CardCopy>
				<P.Stack gap="md">
					{attrs.name && (
						<P.Heading level={2} size="md">
							{attrs.name}
						</P.Heading>
					)}
					{attrs.role && <P.Eyebrow>{attrs.role}</P.Eyebrow>}
					{attrs.bio && <Prose text={attrs.bio} />}
					<P.Stack direction="horizontal" gap="md">
						{attrs.links.map((link, index) => (
							<Action key={index} label={link.label} href={link.href} />
						))}
					</P.Stack>
				</P.Stack>
			</CardCopy>
		</aside>
	);
});
