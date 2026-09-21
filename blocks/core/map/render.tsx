import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ConsentEmbed } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/consent-embed";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/newsletter.css";
export default defineBlock("core/map", ({ attrs }) => {
	const located =
		typeof attrs.latitude === "number" && typeof attrs.longitude === "number";
	const lat = attrs.latitude ?? 0,
		lon = attrs.longitude ?? 0;
	const source = new URL("https://www.openstreetmap.org/export/embed.html");
	source.searchParams.set(
		"bbox",
		[
			Math.max(-180, lon - 0.025),
			Math.max(-90, lat - 0.018),
			Math.min(180, lon + 0.025),
			Math.min(90, lat + 0.018),
		].join(","),
	);
	source.searchParams.set("layer", "mapnik");
	source.searchParams.set("marker", `${lat},${lon}`);
	return (
		<div className="cp-library-map">
			{attrs.address && <address>{attrs.address}</address>}
			{located ? (
				<ConsentEmbed
					url={source.href}
					title={attrs.address || "Location map"}
					kind="map"
				/>
			) : (
				<P.Text tone="muted">
					Choose verified coordinates to display the map.
				</P.Text>
			)}
			{attrs.directions && <P.Link {...attrs.directions} />}
		</div>
	);
});
