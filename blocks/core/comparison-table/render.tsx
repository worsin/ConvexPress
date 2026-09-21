/** Canonical matrix constraints preserve each authored column/cell association. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./comparison-table.css";
export default defineBlock("core/comparison-table", ({ attrs }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		{attrs.columns ? (
			<section
				className="cp-library-comparison-scroll"
				aria-label={attrs.heading || "Feature comparison"}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need access to horizontal table scrolling.
				tabIndex={0}
			>
				<table className="cp-library-comparison-table">
					<caption>{attrs.heading || "Feature comparison"}</caption>
					<thead>
						<tr>
							{attrs.columns.map((column, index) => (
								<th scope="col" key={index}>
									{column}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{attrs.rows.map((row, index) => (
							<tr key={index}>
								<th scope="row">{row.label}</th>
								{row.cells.map((cell, column) => (
									<td key={column}>{cell}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</section>
		) : (
			<P.Text tone="muted">Choose columns to compare.</P.Text>
		)}
	</P.Stack>
));
