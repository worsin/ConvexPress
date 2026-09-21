import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/navigation.css";
export default defineDataBlock(
	"core/breadcrumbs",
	"content.breadcrumbs",
	({ attrs, data }) => {
		const items =
			attrs.source === "manual"
				? attrs.items.map((item) => ({
						label: item.label,
						href: item.link?.href || null,
						current: !!item.link?.href && item.link?.href === data.currentPath,
						newTab: item.link?.newTab,
					}))
				: data.items.map((item) => ({ ...item, newTab: false }));
		return (
			<nav className="cp-breadcrumbs" aria-label="Breadcrumb">
				{items.length ? (
					<ol>
						{items.map((item, index) => (
							<li key={index}>
								{item.href ? (
									<a
										href={item.href}
										target={item.newTab ? "_blank" : undefined}
										rel={item.newTab ? "noopener noreferrer" : undefined}
										aria-current={item.current ? "page" : undefined}
									>
										{item.label}
									</a>
								) : (
									<span aria-current={item.current ? "page" : undefined}>
										{item.label}
									</span>
								)}
							</li>
						))}
					</ol>
				) : (
					<p>No breadcrumb trail available.</p>
				)}
			</nav>
		);
	},
);
