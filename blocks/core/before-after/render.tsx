/** Staged Library treatment. No legacy activation. */
import { useId, useState } from "react";
import {
	defineBlock,
	BlockRenderError,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { resolvedAsset } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media";
import { ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./comparison.css";
export default defineBlock("core/before-after", ({ attrs, resources }) => {
	const [position, setPosition] = useState(50);
	const id = useId();
	if (!attrs.before && !attrs.after)
		return <P.Text tone="muted">Choose two images to compare.</P.Text>;
	if (!attrs.before || !attrs.after)
		throw new BlockRenderError(
			"INCOMPLETE_COMPARISON",
			"core/before-after",
			"Select both comparison images",
		);
	resolvedAsset(attrs.before.id, resources, "image");
	resolvedAsset(attrs.after.id, resources, "image");
	const beforeLabel = attrs.beforeLabel.trim() || "Before";
	const afterLabel = attrs.afterLabel.trim() || "After";
	return (
		<P.Stack gap="md">
			<div className="cp-library-comparison">
				<div className="cp-library-comparison-before">
					<ResolvedImage {...attrs.before} resources={resources} />
				</div>
				<div
					className="cp-library-comparison-after"
					style={{ clipPath: `inset(0 0 0 ${position}%)` }}
				>
					<ResolvedImage {...attrs.after} resources={resources} />
				</div>
				<div
					className="cp-library-comparison-line"
					style={{ left: `${position}%` }}
					aria-hidden="true"
				/>
				<span className="cp-library-comparison-label" data-side="before">
					{beforeLabel}
				</span>
				<span className="cp-library-comparison-label" data-side="after">
					{afterLabel}
				</span>
			</div>
			<label className="cp-library-comparison-control" htmlFor={id}>
				<span>
					Compare {beforeLabel} and {afterLabel}
				</span>
				<input
					id={id}
					type="range"
					min={0}
					max={100}
					step={1}
					value={position}
					onChange={(event) => setPosition(Number(event.currentTarget.value))}
					aria-valuetext={`${position}% ${beforeLabel}, ${100 - position}% ${afterLabel}`}
				/>
			</label>
		</P.Stack>
	);
});
