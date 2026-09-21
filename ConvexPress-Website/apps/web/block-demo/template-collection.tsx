import type { TemplateManifest } from "../src/templates/sdk/types";

const descriptions: Record<string, string> = {
	core: "A clear, versatile starting point. Confident type and space to make it yours.",
	journal:
		"Warm paper, expressive headlines, and a generous rhythm for stories.",
	depot: "A compact, purposeful storefront that puts the collection first.",
	"aster-house":
		"Quiet colors and natural warmth for places, people, and considered objects.",
};

export function TemplateCollection({
	manifests,
}: {
	manifests: TemplateManifest[];
}) {
	return (
		<section
			className="template-collection"
			id="templates"
			aria-labelledby="template-collection-title"
		>
			<div className="template-collection-heading">
				<div>
					<p className="lab-kicker">01 / A place to begin</p>
					<h2 id="template-collection-title">
						Four templates.
						<br />
						<em>Your point of view.</em>
					</h2>
				</div>
				<p>
					Explore the same small studio, journal, and shop in every template.
					Open a full-page preview, follow its links, then switch the look
					without changing the story.
				</p>
			</div>
			<div className="template-collection-grid">
				{manifests.map((manifest, index) => (
					<a
						key={manifest.id}
						className="template-collection-card"
						data-template-example={manifest.id}
						href={`/?view=website&pack=${encodeURIComponent(manifest.id)}&demoPage=studio`}
					>
						<div className="template-collection-image">
							<img
								src={`/template-previews/${manifest.id}.jpg`}
								alt={`Fieldwork studio in the ${manifest.name} template`}
								width="1400"
								height="1000"
								loading="lazy"
								decoding="async"
							/>
						</div>
						<div className="template-collection-caption">
							<span className="template-collection-number">0{index + 1}</span>
							<div>
								<h3>{manifest.name}</h3>
								<p>{descriptions[manifest.id] ?? manifest.description}</p>
							</div>
							<span aria-hidden="true">↗</span>
						</div>
						<span className="template-collection-action">
							Explore {manifest.name}
							<span aria-hidden="true">→</span>
						</span>
					</a>
				))}
			</div>
			<p className="template-collection-note">
				Internal examples with fictional stories and products. Purchases and
				account actions are not connected.
			</p>
		</section>
	);
}
