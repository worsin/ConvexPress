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
export default defineBlock("blocks/story-timeline", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<Intro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.intro} />
		<ol className="cp-editorial-rows cp-editorial-timeline">
			{attrs.items.map((item, index) => (
				<li key={index}>
					<div className="cp-editorial-pair" data-media={Boolean(item.mediaId)}>
						<CardCopy>
							<P.Stack gap="md">
								{item.label && <P.Eyebrow>{item.label}</P.Eyebrow>}
								{item.title && (
									<P.Heading level={3} size="md">
										{item.title}
									</P.Heading>
								)}
								{item.body && <Prose text={item.body} />}
								<Action label={item.linkLabel} href={item.linkUrl} />
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
				</li>
			))}
		</ol>
	</P.Stack>
));
