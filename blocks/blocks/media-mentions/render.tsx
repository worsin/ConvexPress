/** Staged canonical Library view; no legacy or provider activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	Prose,
	Action,
	ResolvedImage,
	CardCopy,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
export default defineBlock("blocks/media-mentions", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<Intro heading={attrs.heading} body={attrs.intro} />
		<div className="cp-editorial-rows">
			{attrs.items.map((item, index) => (
				<article key={index}>
					<div className="cp-editorial-pair" data-media={Boolean(item.mediaId)}>
						<CardCopy>
							<P.Stack gap="md">
								<P.Eyebrow>
									{[item.source, item.kind].filter(Boolean).join(" · ")}
								</P.Eyebrow>
								{item.title && (
									<P.Heading level={3} size="md">
										{item.title}
									</P.Heading>
								)}
								{item.byline && (
									<P.Text size="sm" tone="muted">
										{item.byline}
									</P.Text>
								)}
								{item.summary && <Prose text={item.summary} />}
								<Action label={item.ctaLabel} href={item.ctaUrl} />
							</P.Stack>
						</CardCopy>
						{item.mediaId && (
							<ResolvedImage
								id={item.mediaId}
								alt={item.mediaAlt || undefined}
								resources={resources}
							/>
						)}
					</div>
				</article>
			))}
		</div>
	</P.Stack>
));
