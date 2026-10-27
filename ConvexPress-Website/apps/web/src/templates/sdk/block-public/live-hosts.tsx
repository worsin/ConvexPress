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
import type { ReactNode } from "react";

import type { PublicCanonicalReady } from "../block-data/portable/publicDocumentContracts";
import { suspenseResource } from "../block-renderer/suspense-resource";

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

const HOST_MODULES = {
  newsletter: suspenseResource(() => import("../block-renderer/newsletter-production")),
  leadMagnet: suspenseResource(() => import("../block-renderer/lead-magnet-production")),
  formEmbed: suspenseResource(() => import("../block-renderer/form-embed-production")),
  poll: suspenseResource(() => import("../block-renderer/poll-production")),
  rsvp: suspenseResource(() => import("../block-renderer/rsvp-production")),
  certificate: suspenseResource(() => import("../block-renderer/certificate-production")),
  cartSummary: suspenseResource(() => import("../block-renderer/cart-summary-production")),
  downloadLibrary: suspenseResource(() => import("../block-renderer/download-library-production")),
  bundle: suspenseResource(() => import("../block-renderer/bundle-production")),
  wishlist: suspenseResource(() => import("../block-renderer/wishlist-production")),
  collectionCart: suspenseResource(() => import("../block-renderer/collection-cart-production")),
  shoppingAssistant: suspenseResource(() => import("../block-renderer/shopping-assistant-production")),
} satisfies Record<LiveHostId, { start(): Promise<void> }>;

export const isLiveHostId = (id: string): id is LiveHostId => Object.hasOwn(LIVE_HOSTS, id);

/** Load these hosts' code; settles when each has loaded or failed (a failed
 * chunk is reported by the document's boundary when it renders). */
export async function loadLiveHosts(ids: Iterable<string>): Promise<void> {
  await Promise.allSettled([...ids].filter(isLiveHostId).map((id) => HOST_MODULES[id].start()));
}

/** Mount the hosts a document needs around it, after a marker naming them
 * (`<template data-live-hosts>`): the client loads those hosts before it
 * hydrates (live-hosts-hydration.ts), because hydrating a body whose code is
 * still downloading lets any change above it swap the server HTML for the
 * loading state. Every needed host starts loading at once, before any of them
 * suspends, so nesting never makes them load in turn; a loaded host renders
 * synchronously. The caller places Suspense above. */
export function LiveBlockHosts({ hosts, value, generation, password, children }: {
  hosts: ReadonlySet<LiveHostId>;
  value: PublicCanonicalReady;
  generation: string;
  password?: string;
  children: ReactNode;
}) {
  for (const id of hosts) void HOST_MODULES[id].start();
  const installation = `${value.scope.websiteKey}:${value.scope.instanceKey}`;
  const signedIn = value.viewerSubject !== null;
  let tree = children;
  if (hosts.has("shoppingAssistant")) {
    const { ProductionShoppingAssistantProvider: Host } = HOST_MODULES.shoppingAssistant.read();
    tree = <Host>{tree}</Host>;
  }
  if (hosts.has("collectionCart")) {
    const { ProductionCollectionCartProvider: Host } = HOST_MODULES.collectionCart.read();
    tree = <Host>{tree}</Host>;
  }
  if (hosts.has("wishlist")) {
    const { ProductionWishlistProvider: Host } = HOST_MODULES.wishlist.read();
    tree = <Host>{tree}</Host>;
  }
  if (hosts.has("bundle")) {
    const { ProductionBundleProvider: Host } = HOST_MODULES.bundle.read();
    tree = <Host>{tree}</Host>;
  }
  if (hosts.has("downloadLibrary")) {
    const { ProductionDownloadLibraryProvider: Host } = HOST_MODULES.downloadLibrary.read();
    tree = <Host>{tree}</Host>;
  }
  if (hosts.has("cartSummary")) {
    const { ProductionCartSummaryProvider: Host } = HOST_MODULES.cartSummary.read();
    tree = <Host>{tree}</Host>;
  }
  if (hosts.has("certificate")) {
    const { ProductionCertificateProvider: Host } = HOST_MODULES.certificate.read();
    tree = <Host generation={generation}>{tree}</Host>;
  }
  if (hosts.has("rsvp")) {
    const { ProductionRsvpProvider: Host } = HOST_MODULES.rsvp.read();
    tree = <Host instanceKey={value.scope.instanceKey} postId={value.document.id} generation={generation} signedIn={signedIn} password={password}>{tree}</Host>;
  }
  if (hosts.has("poll")) {
    const { ProductionPollProvider: Host } = HOST_MODULES.poll.read();
    tree = <Host installationKey={installation} generation={generation} signedIn={signedIn} password={password}>{tree}</Host>;
  }
  if (hosts.has("formEmbed")) {
    const { ProductionFormEmbedProvider: Host } = HOST_MODULES.formEmbed.read();
    tree = <Host password={password}>{tree}</Host>;
  }
  if (hosts.has("leadMagnet")) {
    const { ProductionLeadMagnetProvider: Host } = HOST_MODULES.leadMagnet.read();
    tree = <Host password={password}>{tree}</Host>;
  }
  if (hosts.has("newsletter")) {
    const { ProductionNewsletterProvider: Host } = HOST_MODULES.newsletter.read();
    tree = <Host installationKey={`${installation}:${generation}`}>{tree}</Host>;
  }
  if (hosts.size === 0) return tree;
  return (
    <>
      <template data-live-hosts={[...hosts].sort().join(" ")} />
      {tree}
    </>
  );
}
