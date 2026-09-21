import { useEffect, useMemo, useState } from "react";
import { createContentPageDisplayStore, type PageDisplayContext } from "./installed-page-data";
import type { DataEnvelope, ResolverPolicy } from "./portable/contracts";
import { resolveDocumentDisplayTree, documentComposedContext, type CanonicalDocumentDto } from "./portable/documentContracts";
import type { SyncedDisplay } from "./portable/syncedDisplay";

type DisplaySource = {
  scope: PageDisplayContext["scope"];
  document: Pick<CanonicalDocumentDto["document"], "id" | "revision" | "blocks" | "composedDefinitions">;
  policy: ResolverPolicy;
  data: DataEnvelope;
  synced?: SyncedDisplay;
  displayBlocks?: CanonicalDocumentDto["displayBlocks"];
};

function install(source: DisplaySource, viewerKey: string) {
  const store = createContentPageDisplayStore();
  const tree = resolveDocumentDisplayTree(source);
  const composed = documentComposedContext(source, tree);
  const current: PageDisplayContext = {
    scope: source.scope,
    documentKey: source.document.id,
    revision: String(source.document.revision),
    viewerKey,
    request: source.data.request ?? {},
  };
  return { store, composed, data: { current, grant: store.install({
    tree, policy: source.policy, context: current, envelope: source.data, composed,
  }) } };
}

/** SSR needs a synchronous installation. Each committed effect lifetime then
 * receives its own grant, including React's setup/cleanup/setup replay. A grant
 * revoked by cleanup is never reactivated, and changed inputs never render the
 * previous viewer's installation while waiting for an effect.
 */
export function useDisplayInstallation(source: DisplaySource, viewerKey: string) {
  const seed = useMemo(() => install(source, viewerKey), [source, viewerKey]);
  const [active, setActive] = useState<({ seed: typeof seed } & ReturnType<typeof install>) | null>(null);
  useEffect(() => {
    const next = install(source, viewerKey);
    seed.store.invalidate();
    setActive({ seed, ...next });
    return () => next.store.invalidate();
  }, [seed]);
  return active?.seed === seed ? active : seed;
}
