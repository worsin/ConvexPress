import { Children } from "react";
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import "./render.css";
export default defineBlock("core/sticky-aside", ({ children }) => {
	const items = Children.toArray(children);
	if (items.length === 0) return null;
	return (
		<div className="cp-sticky-container">
			<div className="cp-sticky-layout">
				<div className="cp-sticky-main">{items[0]}</div>
				{items.length > 1 && (
					<aside className="cp-sticky-complement" aria-label="Additional content" tabIndex={0}>
						{items.slice(1)}
					</aside>
				)}
			</div>
		</div>
	);
});
