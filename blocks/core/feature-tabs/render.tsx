/** Staged canonical Library view; no legacy or provider activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	ResolvedImage,
	CardCopy,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
import { EditorialTabs } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial";
export default defineBlock("core/feature-tabs", ({ attrs, resources }) => (
	<EditorialTabs
		label="Feature sections"
		panels={attrs.tabs.map((tab) => ({
			label: tab.label,
			content: (
				<div className="cp-editorial-pair" data-media={Boolean(tab.media)}>
					<CardCopy>
						<P.Stack gap="md">
							{tab.title && (
								<P.Heading level={3} size="md">
									{tab.title}
								</P.Heading>
							)}
							{tab.body && <P.RichText content={tab.body} />}
						</P.Stack>
					</CardCopy>
					{tab.media && (
						<ResolvedImage
							id={tab.media.id}
							alt={tab.media.alt}
							focalPoint={tab.media.focalPoint}
							resources={resources}
						/>
					)}
				</div>
			),
		}))}
	/>
));
