/** Staged Library treatment. No legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { CodeHighlight } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/code-highlight";
import "./code.css";
export default defineBlock("core/code", ({ attrs }) => (
	<P.Card>
		<P.Stack gap="md">
			<P.Stack direction="horizontal" gap="md" wrap>
				<P.Eyebrow>{attrs.filename || "Code sample"}</P.Eyebrow>
				{attrs.language && <P.Badge label={attrs.language} />}
			</P.Stack>
			<section
				className="cp-library-code"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus this horizontal code scroll region.
				tabIndex={0}
				aria-label={attrs.filename ? `Code: ${attrs.filename}` : "Code sample"}
			>
				<pre>
					<code><CodeHighlight source={attrs.code} language={attrs.language} /></code>
				</pre>
			</section>
		</P.Stack>
	</P.Card>
), { flow: "prose" });
