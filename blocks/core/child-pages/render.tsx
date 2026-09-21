import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { Icon } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/child-pages.css";

export default defineDataBlock("core/child-pages", "content.childPages", ({ data }) => {
	const children = (parentId: string | null) => data.items.filter(item => item.parentId === parentId);
	const list = (parentId: string | null) => (
		<ul>
			{children(parentId).map(item => (
				<li key={item.id}>
					<a href={item.href}><span>{item.label}</span><Icon name="arrow-up-right" size="sm" /></a>
					{children(item.id).length > 0 && list(item.id)}
				</li>
			))}
		</ul>
	);
	return <nav className="cp-child-pages" aria-label={`Pages in ${data.parentLabel}`}>
		<p className="cp-child-pages-label">Explore this section</p>
		{data.items.length ? list(null) : <p className="cp-child-pages-empty">No child pages are published here yet.</p>}
	</nav>;
});
