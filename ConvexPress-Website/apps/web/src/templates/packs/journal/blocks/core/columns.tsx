import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import "../owned.css";
export default defineBlock("core/columns", ({ children }) => (
	<div className="journal-columns">
		<P.Columns count={2} gap="lg">
			{children}
		</P.Columns>
	</div>
));
