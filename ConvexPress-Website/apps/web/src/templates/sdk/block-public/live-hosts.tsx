/**
 * The live hosts a public page body mounts around its blocks. A block that
 * reads or writes live data (a form, a poll, the cart...) renders through its
 * family's host context; the production host supplies the live implementation.
 * Each host loads only when a block it serves is on the page, so a page with no
 * form never downloads the form wizard or Stripe, and a marketing page never
 * downloads the cart.
 *
 * live-hosts.test.ts walks every block renderer's imports and fails when a block
 * reaches a host this table doesn't list it under, or a listed block no longer
 * does. A block missing here would render its inert (not live) state.
 */
import { lazy, type ReactNode } from "react";

import type { PublicCanonicalReady } from "../block-data/portable/publicDocumentContracts";

/** Each host: the block-renderer module its blocks consume, and those blocks. */
export const LIVE_HOSTS = {
  newsletter: { consumer: "newsletter", blocks: ["core/cta-with-form", "core/newsletter-signup"] },
  leadMagnet: { consumer: "lead-magnet", blocks: ["core/lead-magnet"] },
  formEmbed: { consumer: "form-embed", blocks: ["core/contact-form", "core/form"] },
  poll: { consumer: "poll", blocks: ["core/poll"] },
  rsvp: { consumer: "rsvp", blocks: ["core/event-rsvp"] },
  certificate: { consumer: "certificate-verification", blocks: ["certificates/verify"] },
  cartSummary: { consumer: "cart-summary", blocks: ["commerce/cart-cta"] },
  downloadLibrary: { consumer: "download-library", blocks: ["commerce/download-library"] },
  bundle: { consumer: "bundle", blocks: ["commerce/bundle-offer"] },
  wishlist: { consumer: "wishlist", blocks: ["commerce/wishlist"] },
  collectionCart: {
    consumer: "collection-cart",
    blocks: ["blocks/product-collection", "commerce/product-hero", "commerce/product-showcase", "commerce/recently-viewed", "commerce/sale-countdown"],
  },
  shoppingAssistant: { consumer: "shopping-assistant", blocks: ["commerce/assistant-band"] },
} as const satisfies Record<string, { consumer: string; blocks: readonly string[] }>;
export type LiveHostId = keyof typeof LIVE_HOSTS;

const HOST_IDS = Object.keys(LIVE_HOSTS) as LiveHostId[];
const HOSTS_BY_BLOCK = new Map<string, LiveHostId[]>();
for (const id of HOST_IDS) {
  for (const block of LIVE_HOSTS[id].blocks) HOSTS_BY_BLOCK.set(block, [...(HOSTS_BY_BLOCK.get(block) ?? []), id]);
}

/** Every block name in these trees, at any depth (children included). */
export function blockNamesIn(trees: readonly unknown[]): Set<string> {
  const names = new Set<string>();
  const seen = new Set<object>();
  const visit = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      if ("name" in node && typeof node.name === "string") names.add(node.name);
      if ("children" in node) visit(node.children);
    }
  };
  for (const tree of trees) visit(tree);
  return names;
}

/** The hosts a document needs: its own blocks and the reusable (synced) content
 * it shows. Custom (composed) blocks expand to primitives only, and a template's
 * inserted content gets its data itself, so neither needs a host. */
export function liveHostsFor(value: Pick<PublicCanonicalReady, "document" | "synced">): Set<LiveHostId> {
  const names = blockNamesIn([value.document.blocks, ...(value.synced?.revisions.map((source) => source.blocks) ?? [])]);
  const hosts = new Set<LiveHostId>();
  for (const name of names) for (const id of HOSTS_BY_BLOCK.get(name) ?? []) hosts.add(id);
  return hosts;
}

const LOADERS = {
  newsletter: () => import("../block-renderer/newsletter-production"),
  leadMagnet: () => import("../block-renderer/lead-magnet-production"),
  formEmbed: () => import("../block-renderer/form-embed-production"),
  poll: () => import("../block-renderer/poll-production"),
  rsvp: () => import("../block-renderer/rsvp-production"),
  certificate: () => import("../block-renderer/certificate-production"),
  cartSummary: () => import("../block-renderer/cart-summary-production"),
  downloadLibrary: () => import("../block-renderer/download-library-production"),
  bundle: () => import("../block-renderer/bundle-production"),
  wishlist: () => import("../block-renderer/wishlist-production"),
  collectionCart: () => import("../block-renderer/collection-cart-production"),
  shoppingAssistant: () => import("../block-renderer/shopping-assistant-production"),
} satisfies Record<LiveHostId, () => Promise<unknown>>;

const Newsletter = lazy(async () => ({ default: (await LOADERS.newsletter()).ProductionNewsletterProvider }));
const LeadMagnet = lazy(async () => ({ default: (await LOADERS.leadMagnet()).ProductionLeadMagnetProvider }));
const FormEmbed = lazy(async () => ({ default: (await LOADERS.formEmbed()).ProductionFormEmbedProvider }));
const Poll = lazy(async () => ({ default: (await LOADERS.poll()).ProductionPollProvider }));
const Rsvp = lazy(async () => ({ default: (await LOADERS.rsvp()).ProductionRsvpProvider }));
const Certificate = lazy(async () => ({ default: (await LOADERS.certificate()).ProductionCertificateProvider }));
const CartSummary = lazy(async () => ({ default: (await LOADERS.cartSummary()).ProductionCartSummaryProvider }));
const DownloadLibrary = lazy(async () => ({ default: (await LOADERS.downloadLibrary()).ProductionDownloadLibraryProvider }));
const Bundle = lazy(async () => ({ default: (await LOADERS.bundle()).ProductionBundleProvider }));
const Wishlist = lazy(async () => ({ default: (await LOADERS.wishlist()).ProductionWishlistProvider }));
const CollectionCart = lazy(async () => ({ default: (await LOADERS.collectionCart()).ProductionCollectionCartProvider }));
const ShoppingAssistant = lazy(async () => ({ default: (await LOADERS.shoppingAssistant()).ProductionShoppingAssistantProvider }));

/** Mount the hosts a document needs around it. Every needed host starts loading
 * at once, before any of them suspends, so nesting never makes them load in turn.
 * The caller places Suspense above. */
export function LiveBlockHosts({ hosts, value, generation, password, children }: {
  hosts: ReadonlySet<LiveHostId>;
  value: PublicCanonicalReady;
  generation: string;
  password?: string;
  children: ReactNode;
}) {
  for (const id of hosts) void LOADERS[id]();
  const installation = `${value.scope.websiteKey}:${value.scope.instanceKey}`;
  const signedIn = value.viewerSubject !== null;
  let tree = children;
  if (hosts.has("shoppingAssistant")) tree = <ShoppingAssistant>{tree}</ShoppingAssistant>;
  if (hosts.has("collectionCart")) tree = <CollectionCart>{tree}</CollectionCart>;
  if (hosts.has("wishlist")) tree = <Wishlist>{tree}</Wishlist>;
  if (hosts.has("bundle")) tree = <Bundle>{tree}</Bundle>;
  if (hosts.has("downloadLibrary")) tree = <DownloadLibrary>{tree}</DownloadLibrary>;
  if (hosts.has("cartSummary")) tree = <CartSummary>{tree}</CartSummary>;
  if (hosts.has("certificate")) tree = <Certificate generation={generation}>{tree}</Certificate>;
  if (hosts.has("rsvp")) tree = <Rsvp instanceKey={value.scope.instanceKey} postId={value.document.id} generation={generation} signedIn={signedIn} password={password}>{tree}</Rsvp>;
  if (hosts.has("poll")) tree = <Poll installationKey={installation} generation={generation} signedIn={signedIn} password={password}>{tree}</Poll>;
  if (hosts.has("formEmbed")) tree = <FormEmbed password={password}>{tree}</FormEmbed>;
  if (hosts.has("leadMagnet")) tree = <LeadMagnet password={password}>{tree}</LeadMagnet>;
  if (hosts.has("newsletter")) tree = <Newsletter installationKey={`${installation}:${generation}`}>{tree}</Newsletter>;
  return tree;
}
