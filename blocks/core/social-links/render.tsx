/** Staged Library treatment. No legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { SocialIcon } from "../../../ConvexPress-Website/apps/web/src/components/menus/SocialIcon";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/social-links.css";
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
						<span className="cp-social-profile" key={index}>
							<SocialIcon platform={link.platform.trim().toLowerCase()} />
							<P.Link
								href={link.href}
								label={
									link.label.trim() || link.platform.trim() || "Social profile"
								}
							/>
						</span>
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
