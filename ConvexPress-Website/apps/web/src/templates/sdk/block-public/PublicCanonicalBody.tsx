import { Suspense } from "react";
import { opensWithHero } from "@/lib/blog/page-opening";
import {ProductionLeadMagnetProvider} from "../block-renderer/lead-magnet-production";
import { ProductionDownloadLibraryProvider } from "../block-renderer/download-library-production";
import { ProductionBundleProvider } from "../block-renderer/bundle-production";
import { ProductionWishlistProvider } from "../block-renderer/wishlist-production";
import {ProductionRsvpProvider,RsvpDraftScope} from "../block-renderer/rsvp-production";
import { ProductionCertificateProvider } from "../block-renderer/certificate-production";
import { ProductionCartSummaryProvider } from "../block-renderer/cart-summary-production";
import {ProductionShoppingAssistantProvider} from "../block-renderer/shopping-assistant-production";
import { useProductHistory } from "../../../hooks/useProductHistory";
import { ProductionCollectionCartProvider } from "../block-renderer/collection-cart-production";
import {publicDocumentRefreshDelay} from "./refresh-delay";
import { useLocation } from "@tanstack/react-router";
import { BlockPaginationProvider } from "../block-renderer/pagination";
import type { BlockPageRequest } from "../block-data/portable/postGridContracts";
import { type PublicReadState } from "./subscription";
import { subscribeCatalogDisplay } from "./catalog-continuation";
import {
	Component,
	createContext,
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
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import { useTemplateSettings } from "../useTemplateSettings";
import { CanonicalDocumentView } from "../block-preview/CanonicalDocumentView";
import { ProductionNewsletterProvider } from "../block-renderer/newsletter-production";
import { ProductionFormEmbedProvider } from "../block-renderer/form-embed-production";
import { ProductionPollProvider, PollDraftScope } from "../block-renderer/poll-production";
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
/** Templates place their own title around the current authorized body. */
export type PublicBodyLayout = (body: ReactNode, opensWithHero: boolean) => ReactNode;
const defaultLayout: PublicBodyLayout = body => body;
export function PublicCanonicalBody({ documentId, renderLayout = defaultLayout }: { documentId: string; renderLayout?: PublicBodyLayout }) {
	const scope = useContext(Context),
		auth = useAuth(),
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
			Boolean(auth.isSignedIn),
			auth.userId ?? null,
			auth.sessionId ?? null,
			scope?.password,
      JSON.stringify(scope?.request ?? {}),
      historyKey,
		],
	);
	const firstGeneration = useRef(generation);
	if (!scope || scope.documentId !== documentId || !instanceKey)
		return renderLayout(<Unavailable />, false);
	const enabled = mounted && auth.isLoaded && !convexAuth.isLoading &&
		Boolean(auth.isSignedIn) === convexAuth.isAuthenticated &&
		(!auth.isSignedIn || Boolean(auth.userId)) && (!supportsHistory || history.ready);
	// Keep one component tree during the anonymous SSR -> live handoff. Identity,
	// client, site, password, history and pagination changes still remount it.
	return (
		<PublicBoundary key={generation} renderLayout={renderLayout}>
			<ReactivePublicBody
        renderLayout={renderLayout}
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
	binding,
	password,
	enabled,
	mounted,
	initial,
	allowAnonymousSeed,
}: {
  renderLayout: PublicBodyLayout;
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
			consumedSeed.current = true;
			setState(next);
		}, () => { consumedSeed.current = true; setState(null); setRefresh(value => value + 1); });
	}, [convex, binding.generation, refresh, enabled]);
  useEffect(()=>{
    const delay=state && "value" in state ? publicDocumentRefreshDelay(state.value,Date.now()):null;
    if(delay===null)return;
    const timer=setTimeout(()=>setRefresh(value=>value+1),delay);
    return()=>clearTimeout(timer);
  },[state,binding.generation]);
	const bootstrap = !consumedSeed.current && !seedExpired &&
		(!mounted || (allowAnonymousSeed && !seed?.accessLease));
	const visible = enabled && state ? state : bootstrap && seed ? {value:seed} : null;
  const body = !visible ? <Loading /> : "error" in visible ? <Unavailable /> :
    <PublicResult value={visible.value} generation={binding.generation} password={password} />;
  const hasHero = !!visible && "value" in visible && visible.value?.state === "ready" &&
    opensWithHero(visible.value.document.blocks);
  return <PollDraftScope key={binding.generation}><RsvpDraftScope>
    {renderLayout(body, hasHero)}
  </RsvpDraftScope></PollDraftScope>;
}
function PublicResult({
	value,
	generation,
  password,
}: {
	value: PublicCanonicalDocument;
	generation: string;
  password?: string;
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
		/>
    </Suspense>
	);
}
function InstalledPublicDocument({
	value,
	generation,
  password,
}: {
	value: PublicCanonicalReady;
	generation: string;
  password?: string;
}) {
	const { packId } = useTemplateSettings();
	const installed = useDisplayInstallation(value, generation);
	if (packId !== value.presentation.packId) return <Loading />;
	return (
		<ProductionNewsletterProvider installationKey={`${value.scope.websiteKey}:${value.scope.instanceKey}:${generation}`}>
		<ProductionLeadMagnetProvider password={password}><ProductionFormEmbedProvider password={password}>
    <ProductionPollProvider installationKey={`${value.scope.websiteKey}:${value.scope.instanceKey}`} generation={generation} signedIn={value.viewerSubject !== null} password={password}>
    <ProductionRsvpProvider instanceKey={value.scope.instanceKey} postId={value.document.id} generation={generation} signedIn={value.viewerSubject!==null} password={password}>
    <ProductionCertificateProvider generation={generation}>
    <ProductionCartSummaryProvider>
    <ProductionDownloadLibraryProvider><ProductionBundleProvider><ProductionWishlistProvider>
    <ProductionCollectionCartProvider>
    <ProductionShoppingAssistantProvider>
		<CanonicalDocumentView
			tree={value.document.blocks}
			synced={value.synced}
			scope={value.scope}
			policy={value.policy}
			resources={value.resources}
			data={installed.data}
      composed={installed.composed}
			packId={packId}
		/>
    </ProductionShoppingAssistantProvider>
    </ProductionCollectionCartProvider>
    </ProductionWishlistProvider></ProductionBundleProvider></ProductionDownloadLibraryProvider>
    </ProductionCartSummaryProvider>
    </ProductionCertificateProvider>
    </ProductionRsvpProvider>
    </ProductionPollProvider>
		</ProductionFormEmbedProvider></ProductionLeadMagnetProvider>
		</ProductionNewsletterProvider>
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
		return this.state.failed ? this.props.renderLayout(<Unavailable />, false) : this.props.children;
	}
}
