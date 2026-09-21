import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import {
	PrimitiveProvider,
	createPackPartsRegistry,
	primitiveNames,
	Heading,
	type PrimitiveParts,
} from "../src/templates/sdk/primitives";
import type { TemplateManifest } from "../src/templates/sdk/types";
import journal from "../src/templates/packs/journal/parts/primitives";
import depot from "../src/templates/packs/depot/parts/primitives";
import { Gallery } from "./gallery";
import { demoTheme } from "./themes";
const registry = createPackPartsRegistry({ journal, depot });
test("all 25 primitives render in real gallery with each pack, and parts stay isolated", () => {
	for (const packId of ["core", "journal", "depot", "aster-house"]) {
		const html = renderToStaticMarkup(
			<PrimitiveProvider
				packId={packId}
				registry={registry}
				slots={{ "studio-note": "Resolved fixture slot" }}
			>
				<Gallery />
			</PrimitiveProvider>,
		);
		for (const name of primitiveNames)
			expect(html).toContain(`data-primitive="${name}"`);
		expect(html).toContain("Resolved fixture slot");
		expect(html.includes('data-pack-primitive="journal:')).toBe(
			packId === "journal",
		);
		expect(html.includes('data-pack-primitive="depot:')).toBe(
			packId === "depot",
		);
		expect(html).toContain('aria-label="Studio materials"');
		expect(html).toContain('kind="captions"');
	}
});
test("discovered manifest presets drive exact real CSS values without mutating source", () => {
	const directory = new URL("../src/templates/packs/", import.meta.url);
	for (const pack of readdirSync(directory)) {
		const manifest = JSON.parse(
			readFileSync(new URL(`${pack}/template.json`, directory), "utf8"),
		) as TemplateManifest;
		const before = JSON.stringify(manifest);
		for (const preset of manifest.presets?.colors ?? []) {
			const theme = demoTheme(manifest, preset.id);
			expect(theme.presetName).toBe(preset.name);
			expect(theme.css).toContain(preset.colors.primary);
			expect(theme.css).toContain(preset.colors.background);
		}
		expect(JSON.stringify(manifest)).toBe(before);
	}
});
test("actual pack overrides cannot leak through recursive public primitive composition", () => {
	const recursive: Partial<PrimitiveParts> = {
		Heading: (props) => (
			<div data-recursive="once">
				<Heading {...props} />
			</div>
		),
	};
	const local = createPackPartsRegistry({ journal: recursive, depot });
	const html = renderToStaticMarkup(
		<PrimitiveProvider packId="journal" registry={local}>
			<Heading level={2}>One heading</Heading>
		</PrimitiveProvider>,
	);
	expect(html.match(/data-recursive=/gu)?.length).toBe(1);
	expect(html.match(/<h2/gu)?.length).toBe(1);
	expect(html.includes("depot-primitive")).toBe(false);
});
