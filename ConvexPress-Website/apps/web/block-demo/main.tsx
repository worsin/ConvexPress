import { PatternStudies } from "./patterns";
import { TemplateCollection } from "./template-collection";
import catalog from "../../../../blocks/.generated/catalog.json";
import { ComposedPages } from "./composed-pages";
import { CompositionStudy } from "./composition-study";
import { ComposedDefinitionStudy } from "./composed-definition-study";
import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TemplateManifest } from "../src/templates/sdk/types";
import {
	PrimitiveProvider,
	createPackPartsRegistry,
	primitiveNames,
	type PrimitiveParts,
} from "../src/templates/sdk/primitives";
import { Gallery } from "./gallery";
import { FieldGuideTreatmentStudy } from "./field-guide-treatment";
import { ArticleFlow } from "./article-flow";
import { OriginalUtilitiesStudy } from "./original-utilities";
import { CoreTextLayoutStudy } from "./core-text-layout";
import { TextFamilyStudy } from "./text-family";
const CanonicalBlocks = lazy(() =>
	import("./canonical-blocks").then((module) => ({
		default: module.CanonicalBlocks,
	})),
);
import { demoTheme } from "./themes";
import "@fontsource-variable/inter/index.css";
import "./style.css";

const manifests = Object.values(
	import.meta.glob<TemplateManifest>("../src/templates/packs/*/template.json", {
		eager: true,
		import: "default",
	}),
).sort((a, b) => a.name.localeCompare(b.name));
const partModules = import.meta.glob<Partial<PrimitiveParts>>(
	"../src/templates/packs/*/parts/primitives.tsx",
	{ eager: true, import: "default" },
);
const registry = createPackPartsRegistry(
	Object.fromEntries(
		Object.entries(partModules).map(([path, parts]) => [
			path.split("/").at(-3)!,
			parts,
		]),
	),
);
function App() {
	const readPack = () => {
		const id = new URLSearchParams(window.location.search).get("pack");
		return manifests.some((item) => item.id === id) ? id! : "journal";
	};
	const [packId, setPackId] = useState(readPack);
	useEffect(() => {
		const restore = () => {
			setPackId(readPack());
			setPresetId("default");
		};
		window.addEventListener("popstate", restore);
		return () => window.removeEventListener("popstate", restore);
	}, []);
	const [presetId, setPresetId] = useState("default");
	const manifest = manifests.find((item) => item.id === packId)!;
	const theme = demoTheme(manifest, presetId);
	const partCount = Object.keys(registry[packId] ?? {}).length;
	const changePack = (id: string) => {
		setPackId(id);
		const url = new URL(window.location.href);
		url.searchParams.set("pack", id);
		window.history.replaceState(window.history.state, "", url);
		setPresetId("default");
	};
	const themeAssets = (
		<>
			<style>{theme.css}</style>
			{theme.fonts.length > 0 && (
				<link
					rel="stylesheet"
					href={`https://fonts.googleapis.com/css2?${theme.fonts.map((font) => `family=${encodeURIComponent(font).replace(/%20/gu, "+")}:wght@400;500;600;700`).join("&")}&display=swap`}
				/>
			)}
		</>
	);
	if (new URLSearchParams(window.location.search).get("view") === "website")
		return (
			<>
				{themeAssets}
				<a className="skip-link" href="#composed-pages">
					Skip to the example website
				</a>
				<header className="website-preview-bar">
					<a href={`/?pack=${encodeURIComponent(packId)}#templates`}>
						← BlockDemo
					</a>
					<label htmlFor="pack">
						Template
						<select
							id="pack"
							value={packId}
							onChange={(event) => changePack(event.target.value)}
						>
							{manifests.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
					</label>
					<span>Fictional example · no purchases</span>
				</header>
				<main className="website-preview-main">
					<ComposedPages packId={packId} registry={registry} standalone />
				</main>
			</>
		);
	return (
		<>
			<style>{theme.css}</style>
			{theme.fonts.length > 0 && (
				<link
					rel="stylesheet"
					href={`https://fonts.googleapis.com/css2?${theme.fonts.map((font) => `family=${encodeURIComponent(font).replace(/%20/gu, "+")}:wght@400;500;600;700`).join("&")}&display=swap`}
				/>
			)}
			<a className="skip-link" href="#block-library">
				Skip to the block library
			</a>
			<header className="lab-header">
				<a className="lab-wordmark" href="#top">
					<span className="lab-mark" aria-hidden="true">
						b.
					</span>
					BlockDemo<span className="internal-tag">Internal study</span>
				</a>
				<nav aria-label="Gallery">
					<a href="#templates">Templates</a>
					<a href="#block-library">Block library</a>
					<a href="#composed-pages">Example website</a>
					<a href="#patterns">Starter sections</a>
					<a href="#runtime-composition">Runtime composition</a>
					<a href="#studies">The studies</a>
					<a href="#coverage">
						Coverage <span aria-hidden="true">↗</span>
					</a>
				</nav>
			</header>
			<main id="top" data-coverage-kind="primitive-foundation">
				<div className="lab-intro">
					<div>
						<p className="lab-kicker">ConvexPress / Composition lab</p>
						<h1>
							Good bones.
							<br />
							<em>Distinct character.</em>
						</h1>
						<p className="lab-description">
							A working collection of the pieces underneath the page. Same
							content, different points of view.
						</p>
					</div>
					<div className="lab-index">
						<span>The collection</span>
						<strong>{catalog.length}</strong>
						<span>Editable blocks</span>
						<div className="index-rule" />
						<span>
							{primitiveNames.length} primitives
							<br />
							{manifests.length} discovered packs
						</span>
					</div>
				</div>
				<TemplateCollection manifests={manifests} />
				<div className="theme-toolbar">
					<div className="theme-selects">
						<label htmlFor="pack">
							Template pack
							<select
								id="pack"
								value={packId}
								onChange={(event) => changePack(event.target.value)}
							>
								{manifests.map((item) => (
									<option key={item.id} value={item.id}>
										{item.name}
									</option>
								))}
							</select>
						</label>
						<label htmlFor="preset">
							Color preset
							<select
								id="preset"
								value={presetId}
								onChange={(event) => setPresetId(event.target.value)}
							>
								<option value="default">Pack defaults</option>
								{manifest.presets?.colors.map((preset) => (
									<option key={preset.id} value={preset.id}>
										{preset.name}
									</option>
								))}
							</select>
						</label>
					</div>
					<div className="theme-status" role="status">
						<strong>{manifest.name}</strong>
						<span>
							{theme.presetName} ·{" "}
							{partCount
								? `${partCount} opt-in primitive parts`
								: "SDK baseline · no primitive overrides"}
						</span>
					</div>
				</div>
				<Suspense
					fallback={
						<p className="canonical-loading" role="status">
							Loading canonical block studies…
						</p>
					}
				>
					<CanonicalBlocks packId={packId} registry={registry} />
				</Suspense>
				<PatternStudies packId={packId} registry={registry} />
				<ComposedPages packId={packId} registry={registry} />
				<CompositionStudy packId={packId} registry={registry} />
				<ComposedDefinitionStudy packId={packId} registry={registry} />
				<div className="specimen-canvas" data-pack={packId}>
					<PrimitiveProvider
						key={packId}
						packId={packId}
						registry={registry}
						slots={{
							"studio-note": (
								<span className="slot-note">
									A named slot, supplied by the host.
								</span>
							),
						}}
					>
						<Gallery />
					</PrimitiveProvider>
				</div>

				<PrimitiveProvider
					key={`article:${packId}`}
					packId={packId}
					registry={registry}
				>
					<ArticleFlow />
					<CoreTextLayoutStudy />
					<TextFamilyStudy packId={packId} />
					<OriginalUtilitiesStudy packId={packId} />
					<FieldGuideTreatmentStudy packId={packId} />
				</PrimitiveProvider>
				<section id="coverage" className="coverage">
					<div>
						<p className="lab-kicker">An honest inventory</p>
						<h2>
							The foundation,
							<br />
							<em>not the finish line.</em>
						</h2>
						<p>
							Explore {catalog.length} blocks,{" "}
							{catalog.reduce(
								(total, entry) => total + entry.examples.length,
								0,
							)}{" "}
							examples, and {manifests.length} templates above. These{" "}
							{primitiveNames.length} shared primitives provide their
							foundations. Rendered examples are separate from live-data,
							editor, accessibility, and motion acceptance.
						</p>
					</div>
					<div>
						<p className="coverage-caption">Rendered in this study</p>
						<ul>
							{primitiveNames.map((name) => (
								<li key={name}>
									<span aria-hidden="true">✓</span>
									{name}
								</li>
							))}
						</ul>
						<p className="coverage-note">
							Journal: 4 opt-in parts. Depot: 4 opt-in parts.
							<br />
							Core & Aster House: real manifest tokens, SDK primitive baseline.
						</p>
					</div>
				</section>
			</main>
			<footer className="lab-footer">
				<span>ConvexPress / BlockDemo</span>
				<span>Internal fixture · no site data or account connection</span>
				<a href="#top">Back to top ↑</a>
			</footer>
		</>
	);
}
const root = document.getElementById("root");
if (!root) throw new Error("BlockDemo root is missing");
createRoot(root).render(<App />);
