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
import { EditorialTabs } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial";
export default defineBlock("blocks/tabbed-content", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<Intro heading={attrs.heading} body={attrs.intro} />
		<EditorialTabs
			label={attrs.heading || "Content sections"}
			panels={attrs.tabs.map((tab) => ({
				label: tab.label,
				content: (
					<div className="cp-editorial-pair" data-media={Boolean(tab.mediaId)}>
						<CardCopy>
							<P.Stack gap="md">
								{tab.title && (
									<P.Heading level={3} size="md">
										{tab.title}
									</P.Heading>
								)}
								{tab.body && <Prose text={tab.body} />}
								<Action label={tab.ctaLabel} href={tab.ctaUrl} />
							</P.Stack>
						</CardCopy>
						{tab.mediaId && (
							<ResolvedImage
								id={tab.mediaId}
								alt={tab.mediaAlt || undefined}
								resources={resources}
							/>
						)}
					</div>
				),
			}))}
		/>
	</P.Stack>
));
