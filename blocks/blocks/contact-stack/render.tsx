import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ConsentEmbed } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/consent-embed";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("blocks/contact-stack", ({ attrs }) => {
	const phone = /^[+\d][\d\s().-]{4,78}$/.test(attrs.phone)
		? `tel:${attrs.phone.replace(/[\s().-]/g, "")}`
		: undefined;
	const email = /^[^\s@?&#%]+@[^\s@?&#%]+\.[^\s@?&#%]+$/.test(attrs.email)
		? `mailto:${attrs.email}`
		: undefined;
	const rows = [
		{ label: "Telephone", value: attrs.phone, href: phone },
		{ label: "Email", value: attrs.email, href: email },
		{ label: "Address", value: attrs.address, href: undefined },
		{ label: "Opening hours", value: attrs.hours, href: undefined },
	]
		.filter((row) => row.value)
		.concat(attrs.items.filter((row) => row.label || row.value || row.href));
	return (
		<div className="cp-library-contact-stack-shell">
			<div
				className="cp-library-contact-stack"
				data-map={Boolean(attrs.mapEmbedUrl)}
			>
				<div className="cp-library-contact-stack-copy">
					<Intro heading={attrs.heading} body={attrs.intro} />
					{rows.length > 0 && (
						<dl>
							{rows.map((row, index) => (
								<div className="cp-library-contact-stack-row" key={index}>
									<dt>{row.label}</dt>
									<dd>
										{row.href ? (
											<P.Link label={row.value || row.label} href={row.href} />
										) : row.label === "Address" ? (
											<address>{row.value}</address>
										) : (
											row.value
										)}
									</dd>
								</div>
							))}
						</dl>
					)}
				</div>
				{attrs.mapEmbedUrl && (
					<ConsentEmbed
						url={attrs.mapEmbedUrl}
						title={attrs.address || "Location map"}
						kind="map"
					/>
				)}
			</div>
		</div>
	);
});
