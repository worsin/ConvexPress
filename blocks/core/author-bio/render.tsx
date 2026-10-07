import {
	defineDataBlock,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Prose,
	ResolvedImage,
	Action,
	CardCopy,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/utilities.css";
export default defineDataBlock("core/author-bio", "content.author", ({ attrs, resources, data }) => {
  const usesProfile = attrs.useCurrentAuthor || Boolean(attrs.userId);
  const author = usesProfile ? data.author : null;
  if (usesProfile && !author) return <p className="cp-library-author-empty" role="status">Author unavailable.</p>;
  const name = attrs.name || author?.name || "";
  const bio = attrs.bio || author?.bio || "";
  const image = !attrs.mediaId ? author?.image : null;
	return (
		<aside className="cp-library-author" data-media={Boolean(attrs.mediaId || image)}>
			{attrs.mediaId && (
				<div className="cp-library-author-portrait">
					<ResolvedImage
						id={attrs.mediaId}
						alt={name || undefined}
						resources={resources}
					/>
				</div>
			)}
      {image && <div className="cp-library-author-portrait"><P.Image media={image} aspect="1/1" /></div>}
			<CardCopy>
				<P.Stack gap="md">
					{name && (
						<P.Heading level={2} size="md">
							{author?.href ? <P.Link href={author.href} label={name} /> : name}
						</P.Heading>
					)}
					{attrs.role && <P.Eyebrow>{attrs.role}</P.Eyebrow>}
					{bio && <Prose text={bio} />}
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
