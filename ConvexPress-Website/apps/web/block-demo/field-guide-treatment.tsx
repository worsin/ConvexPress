import "./legacy-field-guide.generated.css";
import { useState } from "react";
import { FieldGuideView } from "../src/blocks/field-guide/View";
import { fieldGuideAttrsSchema } from "../src/blocks/field-guide/schema";
import fieldGuide from "../../../../blocks/reference/field-guide/render";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { packTreatmentSupport } from "../src/templates/sdk/block-data/portable/generated/metadata";
const sample = {
	heading: "A field guide to everyday objects",
	body: "Authored **literal text**.\nA second line with space to breathe.",
	note: "A fictional studio specimen.",
	items: [
		{ label: "Material", value: "Clay and stone" },
		{ label: "Care", value: "Use, rinse, repeat" },
	],
	link: { href: "/page/journal", label: "Read the field notes", newTab: false },
};
export function FieldGuideTreatmentStudy({ packId }: { packId: string }) {
	const supported: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = packTreatmentSupport;
	const [spacing, setSpacing] = useState(4);
	const [alignment, setAlignment] = useState("left");
	const [ink, setInk] = useState("foreground");
	const [font, setFont] = useState("display");
	const old = fieldGuideAttrsSchema.parse({
		...sample,
		spacing,
		alignment,
		ink,
		font,
	});
	const { spacing: s, alignment: a, ink: i, font: f, ...attrs } = old;
	const tree = [
		{
			id: "editorial-parity",
			name: "reference/field-guide",
			version: 2,
			attrs,
			treatment: {
				name: "editorial",
				values: { spacing: s, alignment: a, ink: i, font: f },
			},
			layout: { spacing: "none", width: "full" },
		},
	];
	return (
		<details className="canonical-study" data-treatment-study>
			<summary>Editorial treatment compatibility study</summary>
			<p className="specimen-note">
				Actual original view alongside the canonical Library view. Authored axes
				stay composable.
			</p>
			<div className="theme-selects">
				{[
					{
						label: "Spacing",
						value: String(spacing),
						values: Array.from({ length: 9 }, (_, n) => String(n)),
						change: (value: string) => setSpacing(Number(value)),
					},
					{
						label: "Alignment",
						value: alignment,
						values: ["left", "center", "right"],
						change: setAlignment,
					},
					{
						label: "Ink",
						value: ink,
						values: ["foreground", "primary", "muted"],
						change: setInk,
					},
					{
						label: "Font",
						value: font,
						values: ["body", "display"],
						change: setFont,
					},
				].map((control) => (
					<label key={control.label}>
						{control.label}
						<select
							data-treatment-control={control.label}
							value={control.value}
							onChange={(event) => control.change(event.target.value)}
						>
							{control.values.map((value) => (
								<option key={value}>{value}</option>
							))}
						</select>
					</label>
				))}
			</div>
			<div data-treatment-comparison>
				<div data-treatment-original>
					<section data-slot="block-reference-field-guide">
						<FieldGuideView attrs={old} />
					</section>
				</div>
				<div data-treatment-canonical>
					{supported[packId]?.["reference/field-guide"]?.includes("editorial") ? prepareBlocks(
						tree,
						{ "reference/field-guide": fieldGuide },
						{ enabledPlugins: [], capabilities: [], disabledBlocks: [] },
						{ media: {} },
						undefined,
						packId,
					) : <p data-treatment-unavailable>This pack does not declare the editorial field-guide treatment.</p>}
				</div>
			</div>
		</details>
	);
}
