import {
	Component,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import {
	PrimitiveProvider,
	type PackPartsRegistry,
} from "../src/templates/sdk/primitives";
import {
	createDemoContentPageHost,
	type InstalledDemoPageData,
} from "../src/templates/sdk/block-data/demo-channel";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";
import { resolvePostGridDemo } from "./post-grid-adapter";
import { resolveProductsDemo } from "./products-adapter";
import {
	composeDemo,
	demoHref,
	demoPages,
	readDemoRoute,
	type DemoRoute,
} from "./composed-content";

const policy = {
	enabledPlugins: ["commerce"],
	capabilities: ["tree.children", "reference.targetResolution"],
	disabledBlocks: [],
};
const routeKey = (route: DemoRoute) => `${route.page}:${route.item ?? ""}`;
class PageBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? (
			<p role="alert">
				This composed page could not render. Select another page to continue.
			</p>
		) : (
			this.props.children
		);
	}
}
export function ComposedPages({
	packId,
	registry,
	standalone = false,
}: {
	packId: string;
	registry: PackPartsRegistry;
	standalone?: boolean;
}) {
	const [route, setRoute] = useState(() =>
		readDemoRoute(location.search, location.pathname),
	);
	const heading = useRef<HTMLHeadingElement>(null);
	const moved = useRef(false);
	const search = new URLSearchParams(location.search);
	search.set("pack", packId);
	const query = search.toString();
	const content = useMemo(() => composeDemo(route, query), [route, query]);
	useEffect(() => {
		const restore = () => {
			moved.current = true;
			setRoute(readDemoRoute(location.search, location.pathname));
		};
		window.addEventListener("popstate", restore);
		return () => window.removeEventListener("popstate", restore);
	}, []);
	useEffect(() => {
		if (!moved.current) return;
		moved.current = false;
		heading.current?.focus({ preventScroll: true });
		heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
	}, [route]);
	return (
		<section
			id="composed-pages"
			className={
				standalone ? "composed-studies composed-standalone" : "composed-studies"
			}
			aria-label="Composed website studies"
		>
			{!standalone && (
				<>
					<div className="pattern-heading">
						<div>
							<p className="lab-kicker">02 / See the pieces together</p>
							<h2>A small site. Many points of view.</h2>
							<p>
								Browse Fieldwork, an imagined studio. Switch templates above to
								compare the same page.
							</p>
						</div>
						<a href="#pack">Change template ↑</a>
					</div>
					<p className="specimen-note">
						Internal demonstration · synthetic stories and products · no orders
						or payments. Page content uses the real block renderer; this
						navigation is demonstration chrome.
					</p>
				</>
			)}
			<div
				className="composed-canvas"
				data-composed-page={route.page}
				data-composed-item={route.item ?? ""}
				data-composed-pack={packId}
				onClick={(event) => {
					const anchor =
						event.target instanceof Element ? event.target.closest("a") : null;
					if (
						!(anchor instanceof HTMLAnchorElement) ||
						event.button !== 0 ||
						event.metaKey ||
						event.ctrlKey ||
						event.shiftKey ||
						event.altKey ||
						anchor.target === "_blank"
					)
						return;
					let url = new URL(anchor.href);
					if (url.origin !== location.origin) return;
					const destination = readDemoRoute(url.search, url.pathname);
					if (
						url.pathname.startsWith("/products/") &&
						destination.page === "product"
					)
						url = new URL(demoHref(destination, query), location.origin);
					if (url.pathname !== "/" || !url.searchParams.has("demoPage")) return;
					event.preventDefault();
					if (url.href !== location.href)
						history.pushState(history.state, "", url);
					moved.current = true;
					setRoute(readDemoRoute(url.search));
				}}
			>
				<header className="composed-masthead">
					<a
						href={demoHref({ page: "studio" }, query)}
						className="composed-wordmark"
						aria-label="Fieldwork studio home"
					>
						Fieldwork<span aria-hidden="true">®</span>
					</a>
					<nav aria-label="Fieldwork pages">
						{demoPages.map((page) => (
							<a
								key={page}
								href={demoHref({ page }, query)}
								aria-current={
									route.page === page ||
									(route.page === "story" && page === "journal") ||
									(route.page === "product" && page === "shop")
										? "page"
										: undefined
								}
							>
								{page === "shop"
									? "Collection"
									: page === "journal"
										? "Journal"
										: "Studio"}
							</a>
						))}
					</nav>
				</header>
				<h3 ref={heading} tabIndex={-1} className="composed-page-label">
					{content.title}
				</h3>
				<PageBoundary key={`${routeKey(route)}:${packId}`}>
					<PrimitiveProvider packId={packId} registry={registry}>
						<ComposedPreview
							key={`${routeKey(route)}:${packId}:${query}`}
							content={content}
							route={route}
							packId={packId}
							query={query}
						/>
					</PrimitiveProvider>
				</PageBoundary>
				<footer className="composed-footer">
					<span>Fieldwork / Objects & observations</span>
					<a href={demoHref({ page: "studio" }, query)}>Back to the studio ↑</a>
				</footer>
			</div>
			{!standalone && (
				<details className="composed-source">
					<summary>Inspect this page’s editable blocks</summary>
					<pre>{JSON.stringify(content.blocks, null, 2)}</pre>
				</details>
			)}
		</section>
	);
}
function ComposedPreview({
	content,
	route,
	packId,
	query,
}: {
	content: ReturnType<typeof composeDemo>;
	route: DemoRoute;
	packId: string;
	query: string;
}) {
	const host = useMemo(() => createDemoContentPageHost(), []);
	const context = useMemo(
		() => ({
			scope: { websiteKey: "block-demo", instanceKey: "isolated-demo" },
			documentKey: `fieldwork:${routeKey(route)}`,
			revision: "1",
			viewerKey: "synthetic-public-viewer",
		}),
		[route],
	);
	const [grant, setGrant] = useState<InstalledDemoPageData | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	useEffect(() => {
		let active = true;
		const resolve =
			route.page === "shop"
				? resolveProductsDemo(content.blocks, context.scope, policy)
				: resolvePostGridDemo(
						content.blocks,
						context.scope,
						policy,
						{},
						(index) => demoHref({ page: "story", item: String(index) }, query),
					);
		void resolve
			.then((envelope) => {
				if (active)
					setGrant(
						host.install({ tree: content.blocks, context, policy, envelope }),
					);
			})
			.catch((error) => {
				if (active)
					setFailure(
						error instanceof Error ? error.message : "Unknown fixture error",
					);
			});
		return () => {
			active = false;
			host.invalidate();
		};
	}, [host, content, context, route.page, query]);
	return (
		<div
			className="composed-content"
			data-composed-ready={grant ? "true" : "false"}
		>
			{failure ? (
				<p role="alert">
					This demonstration’s content could not load: {failure}
				</p>
			) : grant ? (
				prepareBlocks(
					content.blocks,
					stagedRenderers,
					policy,
					content.resources,
					{ grant, current: context },
					packId,
				)
			) : (
				<p role="status">Preparing the page…</p>
			)}
		</div>
	);
}
