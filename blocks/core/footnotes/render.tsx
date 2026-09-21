/** Canonical keys remain unchanged and participate in page-wide anchor preflight. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./footnotes.css";
export default defineBlock("core/footnotes", ({ attrs }) => (
	<ol className="cp-library-footnotes" aria-label="Footnotes">
		{attrs.notes.map((note, index) => (
			<li key={note.key} id={note.key}>
				<P.Stack gap="sm">
					{note.body ? (
						<P.RichText content={note.body} />
					) : (
						<P.Text tone="muted">Note text not provided.</P.Text>
					)}
					<P.Link href={`#${note.key}`} label={`Link to note ${index + 1}`} />
				</P.Stack>
			</li>
		))}
	</ol>
));
