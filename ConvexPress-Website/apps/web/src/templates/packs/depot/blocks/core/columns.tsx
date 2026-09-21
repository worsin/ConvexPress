import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import "../owned.css";
export default defineBlock("core/columns", ({ children }) => (
	<div className="depot-columns">
		<P.Columns count={2} gap="md">
			{children}
		</P.Columns>
	</div>
));
