import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import "../owned.css";
export default defineBlock("core/section", ({ children }) => (
	<div className="depot-section">
		<P.Stack gap="md">{children}</P.Stack>
	</div>
));
