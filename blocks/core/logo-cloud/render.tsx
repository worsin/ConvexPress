/** Staged Library treatment. No legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import { resolvedAsset } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media";
import "./logos.css";
export default defineBlock("core/logo-cloud", ({ attrs, resources }) => (
	<div className="cp-library-logo-cloud">
		<P.Stack gap="lg">
			<Intro {...attrs} />
			<div className="cp-library-logos">
				{attrs.logos.map((logo, index) => {
					const label = logo.name.trim() || "Partner";
					const image = logo.mediaId
						? resolvedAsset(logo.mediaId, resources, "image")
						: undefined;
					const content = image ? (
						<P.Image
							media={{
								src: image.src,
								alt: logo.name || image.alt,
								width: image.width,
								height: image.height,
							}}
							fit="contain"
							aspect="3/2"
						/>
					) : (
						<P.Text size="lg">{label}</P.Text>
					);
					return (
						<div key={index}>
							{logo.href ? (
								<a href={logo.href} aria-label={label}>
									{content}
								</a>
							) : (
								content
							)}
						</div>
					);
				})}
			</div>
		</P.Stack>
	</div>
));
