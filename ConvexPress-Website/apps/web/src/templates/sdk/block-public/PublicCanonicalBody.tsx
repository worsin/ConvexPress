import { Suspense } from "react";
import { opensWithHero } from "@/lib/blog/page-opening";
import { useProductHistory } from "../../../hooks/useProductHistory";
import {publicDocumentRefreshDelay} from "./refresh-delay";
import { useLocation } from "@tanstack/react-router";
import { BlockPaginationProvider } from "../block-renderer/pagination";
import { PollDraftScope, RsvpDraftScope } from "../block-renderer/drafts";
import { LiveBlockHosts, liveHostsFor } from "./live-hosts";
import type { BlockPageRequest } from "../block-data/portable/postGridContracts";
import { type PublicReadState } from "./subscription";
import { subscribeCatalogDisplay } from "./catalog-continuation";
import {
	Component,
	createContext,
	memo,
	startTransition,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { useConvex, useConvexAuth } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { usePublicViewer } from "@/lib/auth/usePublicViewer";
import { getSiteRuntime } from "@/lib/site-runtime";
import { useTemplateSettings } from "../useTemplateSettings";
import { CanonicalDocumentView, preloadDocumentRenderers } from "../block-preview/CanonicalDocumentView";
import type { BlockInsertion } from "../block-renderer/model";
import { useDisplayInstallation } from "../block-data/use-display-installation";
import { canonicalDisplayDigest } from "../block-data/portable/documentContracts";
import type {
	PublicCanonicalDocument,
	PublicCanonicalReady,
} from "../block-data/portable/publicDocumentContracts";
import { readPublicDisplay, type PublicDisplayBinding } from "./display-state";

const Context = createContext<{
	documentId: string;
	initial: PublicCanonicalDocument;
	password?: string;
	request?: BlockPageRequest;
} | null>(null);
export function PublicCanonicalScope({
	documentId,
	initial,
	password,
	request,
	children,
}: {
	documentId: string;
	initial: PublicCanonicalDocument;
	password?: string;
	request?: BlockPageRequest;
	children: ReactNode;
}) {
	const href = useLocation({ select: location => location.href });
	return (
		<Context.Provider value={{ documentId, initial, password, request }}>
      <BlockPaginationProvider href={href}>
			{children}
      </BlockPaginationProvider>
		</Context.Provider>
	);
}
/** Templates place their own title around the current authorized body. `placed`
 * says whether the body holds the template's insertion (see `insert`). */
export type PublicBodyLayout = (body: ReactNode, opensWithHero: boolean, placed: boolean) => ReactNode;
/** Where a template places its own content among the document's top-level
 * blocks, chosen from the authorized display tree; null places nothing. */
export type PlaceInsertion = (blocks: readonly { name: string }[]) => BlockInsertion | null;
const defaultLayout: PublicBodyLayout = body => body;
export function PublicCanonicalBody({ documentId, renderLayout = defaultLayout, insert }: { documentId: string; renderLayout?: PublicBodyLayout; insert?: PlaceInsertion }) {
	const scope = useContext(Context),
		auth = usePublicViewer(),
		convexAuth = useConvexAuth(),
		convex = useConvex();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);
  // New backends advertise history binding; omit new args for older deployments.
  const supportsHistory = scope?.initial?.historyDigest !== undefined;
  const history = useProductHistory(supportsHistory);
  const historyKey = supportsHistory ? JSON.stringify(history.ids) : "legacy";
	const instanceKey = getSiteRuntime().instanceKey;
	const generation = useMemo(
		() => crypto.randomUUID(),
		[
			convex,
			instanceKey,
			documentId,
			auth.kind,
			Boolean(auth.isSignedIn),
			auth.userId ?? null,
			auth.sessionId ?? null,
			scope?.password,
      JSON.stringify(scope?.request ?? {}),
      historyKey,
		],
	);
	const firstGeneration = useRef(generation);
	if (!scope || scope.documentId !== documentId || !instanceKey || auth.unavailable)
		return renderLayout(<Unavailable />, false, false);
	const enabled = mounted && auth.isLoaded && !convexAuth.isLoading &&
		Boolean(auth.isSignedIn) === convexAuth.isAuthenticated &&
		(!auth.isSignedIn || Boolean(auth.userId)) && (!supportsHistory || history.ready);
	// Keep one component tree during the anonymous SSR -> live handoff. Identity,
	// client, site, password, history and pagination changes still remount it.
	return (
		<PublicBoundary key={generation} renderLayout={renderLayout}>
			<ReactivePublicBody
        renderLayout={renderLayout}
        insert={insert}
				binding={{documentId, instanceKey, viewerSubject:auth.isSignedIn ? auth.userId ?? null : null,
					generation, request:scope.request,
					...(supportsHistory ? {recentlyViewedIds:history.ids} : {})}}
				password={scope.password}
				enabled={enabled}
				mounted={mounted}
				initial={firstGeneration.current === generation ? scope.initial : null}
				allowAnonymousSeed={!auth.isSignedIn && !convexAuth.isAuthenticated && history.ids.length === 0}
			/>
		</PublicBoundary>
	);
}
function ReactivePublicBody({
  renderLayout,
  insert,
	binding,
	password,
	enabled,
	mounted,
	initial,
	allowAnonymousSeed,
}: {
  renderLayout: PublicBodyLayout;
  insert?: PlaceInsertion;
	binding: PublicDisplayBinding;
	password?: string;
	enabled: boolean;
	mounted: boolean;
	initial: PublicCanonicalDocument;
	allowAnonymousSeed: boolean;
}) {
	const convex = useConvex();
	const [state, setState] = useState<PublicReadState | null>(null);
	const [seed] = useState(() => readPublicDisplay(initial, {...binding, viewerSubject:null, recentlyViewedIds:initial?.historyDigest === undefined ? undefined : []}));
	const consumedSeed = useRef(false);
	const [seedExpired, setSeedExpired] = useState(false);
	// The bootstrap is never a substitute for a live authorization result. Do
	// not reuse leased content, let it return after an error, or retain it offline.
	useEffect(() => {
		if (!mounted || !seed) return;
		const delay = Math.min(15_000, publicDocumentRefreshDelay(seed, Date.now()) ?? 15_000);
		const timer = setTimeout(() => setSeedExpired(true), delay);
		return () => clearTimeout(timer);
	}, [mounted, seed]);
  const [refresh,setRefresh]=useState(0);
	useEffect(() => {
		if (!enabled) { setState(null); return; }
		// A timed data refresh disposes the old authorization timer too. Never
    // retain its protected body while the replacement request is pending.
    if(state && "value" in state && state.value?.accessLease)setState(null);
		const watch = (request: BlockPageRequest) => convex.watchQuery(api.canonicalDocuments.getForRender, {
			postId: binding.documentId as Id<"posts">,
			refreshKey: crypto.randomUUID(),
      request,
      ...(binding.recentlyViewedIds === undefined ? {} : {recentlyViewedIds:binding.recentlyViewedIds}),
			...(password ? { password } : {}),
		});
		return subscribeCatalogDisplay(watch, binding, next => {
			// A newly authorized body can need renderers or live hosts that haven't
			// loaded yet. Apply it as a transition, so what's shown stays until they
			// have instead of the body blanking. A restricted, missing or failed read
			// has nothing to load and stays immediate, as does every clearing.
			if ("value" in next && next.value?.state === "ready") startTransition(() => setState(next));
			else { consumedSeed.current = true; setState(next); }
		}, () => { consumedSeed.current = true; setState(null); setRefresh(value => value + 1); });
	}, [convex, binding.generation, refresh, enabled]);
  // The seed never returns once a live read is shown.
  useEffect(() => { if (state) consumedSeed.current = true; }, [state]);
  useEffect(()=>{
    const delay=state && "value" in state ? publicDocumentRefreshDelay(state.value,Date.now()):null;
    if(delay===null)return;
    const timer=setTimeout(()=>setRefresh(value=>value+1),delay);
    return()=>clearTimeout(timer);
  },[state,binding.generation]);
	const bootstrap = !consumedSeed.current && !seedExpired &&
		(!mounted || (allowAnonymousSeed && !seed?.accessLease));
	const visible = enabled && state ? state : bootstrap && seed ? {value:seed} : null;
  const ready = !!visible && "value" in visible && visible.value?.state === "ready" ? visible.value : null;
  const insertion = useMemo(() => ready && insert ? insert(ready.document.blocks) : null, [ready, insert]);
  const body = !visible ? <Loading /> : "error" in visible ? <Unavailable /> :
    <PublicResult value={visible.value} generation={binding.generation} password={password} insertion={insertion ?? undefined} />;
  const hasHero = !!ready && opensWithHero(ready.document.blocks);
  return <PollDraftScope key={binding.generation}><RsvpDraftScope>
    {renderLayout(body, hasHero, insertion !== null)}
  </RsvpDraftScope></PollDraftScope>;
}
/** Memoized: a parent re-render with the same document (the first mount, the
 * viewer's sign-in state loading) leaves the document's tree alone. */
const PublicResult = memo(function PublicResult({
	value,
	generation,
  password,
  insertion,
}: {
	value: PublicCanonicalDocument;
	generation: string;
  password?: string;
  insertion?: BlockInsertion;
}) {
	if (!value) return <Unavailable />;
	if (value.state === "restricted")
		return (
			<section aria-label="Restricted document" className="space-y-3 py-6">
				<p role="status">
					{value.restriction.password
						? "Enter the document password to read this content."
						: "This content is available to members with access."}
				</p>
				{value.document.excerpt && <p>{value.document.excerpt}</p>}
			</section>
		);
	return (
    <Suspense fallback={<Loading />}>
		<InstalledPublicDocument
			key={`${generation}:${canonicalDisplayDigest(value)}`}
			value={value}
			generation={generation}
      password={password}
      insertion={insertion}
		/>
    </Suspense>
	);
});
function InstalledPublicDocument({
	value,
	generation,
  password,
  insertion,
}: {
	value: PublicCanonicalReady;
	generation: string;
  password?: string;
  insertion?: BlockInsertion;
}) {
	const { packId, savedPackId } = useTemplateSettings();
	const installed = useDisplayInstallation(value, generation);
	// Keep the saved activation synchronized with the authorized DTO. A validated
	// temporary pack preview changes paint only, never the document or its grant.
	if (savedPackId !== value.presentation.packId) return <Loading />;
	const hosts = liveHostsFor(value);
	// Start the blocks' renderers with the hosts, not after them.
	preloadDocumentRenderers(packId, [value.document.blocks, ...(value.synced?.revisions.map(source => source.blocks) ?? [])]);
	return (
		<LiveBlockHosts hosts={hosts} value={value} generation={generation} password={password}>
		<CanonicalDocumentView
			tree={value.document.blocks}
			synced={value.synced}
			scope={value.scope}
			policy={value.policy}
			resources={value.resources}
			data={installed.data}
      composed={installed.composed}
			packId={packId}
      insertion={insertion}
		/>
		</LiveBlockHosts>
	);
}
function Loading() {
	return (
		<p role="status" className="py-6 text-sm">
			Loading document…
		</p>
	);
}
function Unavailable() {
	return (
		<p role="status" className="py-6 text-sm">
			This document is not currently available.
		</p>
	);
}
class PublicBoundary extends Component<
	{ children: ReactNode; renderLayout: PublicBodyLayout },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? this.props.renderLayout(<Unavailable />, false, false) : this.props.children;
	}
}
