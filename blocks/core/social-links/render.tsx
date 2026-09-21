/** Staged Library treatment. No legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/social-links", ({ attrs }) => (
	<P.Stack gap="lg">
		{attrs.heading && (
			<P.Heading level={2} size="lg">
				{attrs.heading}
			</P.Heading>
		)}
		<nav aria-label={attrs.heading || "Social profiles"}>
			<P.Stack direction="horizontal" gap="md" wrap>
				{attrs.links.map((link, index) =>
					link.href ? (
						<P.Link
							key={index}
							href={link.href}
							label={
								link.label.trim() || link.platform.trim() || "Social profile"
							}
						/>
					) : (
						<P.Text key={index} tone="muted">
							{link.label ||
								link.platform ||
								"Profile destination not configured"}
						</P.Text>
					),
				)}
			</P.Stack>
		</nav>
	</P.Stack>
));
