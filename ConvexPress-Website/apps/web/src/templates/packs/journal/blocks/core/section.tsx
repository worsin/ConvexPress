import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import "../owned.css";
export default defineBlock("core/section", ({ children }) => (
	<div className="journal-section">
		<P.Stack gap="lg">{children}</P.Stack>
	</div>
));
