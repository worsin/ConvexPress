import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/navigation.css";
export default defineDataBlock(
	"core/site-info",
	"site.info",
	({ attrs, data }) => {
		const logo = attrs.show.includes("logo") ? data.logo : null;
		const name = attrs.show.includes("name") ? data.name : null;
		const tagline = attrs.show.includes("tagline") ? data.tagline : null;
		return logo || name || tagline ? (
			<div className="cp-site-info">
				{logo && (
					<img
						src={logo.src}
						alt={logo.alt}
						width={logo.width}
						height={logo.height}
						loading="lazy"
					/>
				)}
				<div className="cp-site-info-copy">
					{name && <P.Heading>{name}</P.Heading>}
					{tagline && <P.Text>{tagline}</P.Text>}
				</div>
			</div>
		) : (
			<P.Text tone="muted">No site details selected or available.</P.Text>
		);
	},
);
