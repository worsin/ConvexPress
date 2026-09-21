import { defineContentPageBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	CardCopy,
	Prose,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/featured-page.css";

export default defineContentPageBlock(({ attrs, data }) => {
	if (!data.page)
		return (
			<p className="cp-library-featured-page-empty" role="status">
				Featured page unavailable.
			</p>
		);
	const page = data.page;
	return (
		<article
			className="cp-library-featured-page"
			data-media={Boolean(page.image)}
		>
			<CardCopy>
				<P.Stack gap="lg">
					<P.Eyebrow>Explore the page</P.Eyebrow>
					<P.Heading level={2} size="md">
						{page.title}
					</P.Heading>
					{page.excerpt && <Prose text={page.excerpt} />}
					<P.Button
						href={page.href}
						label={attrs.ctaLabel.trim() || page.title || "Read page"}
					/>
				</P.Stack>
			</CardCopy>
			{page.image && <P.Image media={page.image} aspect="4/3" />}
		</article>
	);
});
