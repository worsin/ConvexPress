import { useState } from "react";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";

const text = (value: string) => ({
	type: "doc",
	content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
});
const policy = {
	enabledPlugins: [],
	capabilities: ["tree.children"],
	disabledBlocks: [],
};

export function CoreTextLayoutStudy() {
	const [spacing, setSpacing] = useState("compact");
	const [tone, setTone] = useState("default");
	const nodes = [
		{
			id: "flow-heading",
			name: "core/heading",
			version: 2,
			attrs: {
				level: 2,
				text: text("Space to think."),
				anchor: "space-to-think",
			},
			layout: { spacing: "none" },
		},
		{
			id: "flow-paragraph",
			name: "core/paragraph",
			version: 2,
			attrs: {
				body: text(
					"Good typography gives an idea room to breathe. A heading sets the pace; a paragraph carries the thought; a quiet rule marks the next chapter.",
				),
			},
		},
		{
			id: "flow-spacer",
			name: "core/spacer",
			version: 2,
			attrs: {},
			layout: { spacing, tone },
			anchor: "breathing-room",
		},
		{
			id: "flow-divider",
			name: "core/divider",
			version: 2,
			attrs: {},
			layout: { spacing: "none" },
		},
		{
			id: "flow-nested",
			name: "core/section",
			version: 1,
			attrs: {},
			layout: { spacing: "none" },
			children: [
				{
					id: "flow-nested-spacer",
					name: "core/spacer",
					version: 2,
					attrs: {},
					layout: { spacing, tone },
				},
			],
		},
		{
			id: "flow-closing",
			name: "core/paragraph",
			version: 2,
			attrs: {
				body: text(
					"The simplest elements deserve the same care as the most elaborate ones.",
				),
			},
		},
	];
	return (
		<details className="canonical-study" data-core-text-study>
			<summary>Text and spacing study</summary>
			<label>
				Spacer spacing{" "}
				<select
					value={spacing}
					onChange={(event) => setSpacing(event.target.value)}
				>
					{["none", "compact", "default", "spacious"].map((value) => (
						<option key={value}>{value}</option>
					))}
				</select>
			</label>
			<label>
				Spacer tone{" "}
				<select value={tone} onChange={(event) => setTone(event.target.value)}>
					{["default", "muted", "inverted", "accent"].map((value) => (
						<option key={value}>{value}</option>
					))}
				</select>
			</label>
			<div data-core-text-canvas>
				{prepareBlocks(nodes, stagedRenderers, policy)}
			</div>
		</details>
	);
}
