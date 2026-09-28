type HydrationLoader = { load: (pack: string, names: readonly string[]) => Promise<unknown> };
/** Finish only server-rendered definitions before effects replace the SSR data
 * grant. Suspending a dehydrated child after that replacement would retry its
 * revoked seed. This loads code only; it neither revives nor extends a grant. */
export async function prepareCanonicalBlockHydration(
  root: ParentNode,
  importLoader: () => Promise<HydrationLoader> = () => import("../block-renderer/discovery").then(module => module.rendererLoader),
): Promise<void> {
  const packs = new Map<string, Set<string>>();
  for (const marker of root.querySelectorAll("template[data-canonical-pack][data-canonical-blocks]")) {
    const pack = marker.getAttribute("data-canonical-pack") ?? "";
    if (!/^[a-z][a-z0-9-]*$/.test(pack)) continue;
    const names = (marker.getAttribute("data-canonical-blocks") ?? "").split(" ").filter(name => /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(name));
    if (!names.length) continue;
    const selected = packs.get(pack) ?? new Set<string>();
    for (const name of names) selected.add(name);
    packs.set(pack, selected);
  }
  if (!packs.size) return;
  const loader = await importLoader();
  // A failed chunk remains failed in the resource; normal document error
  // boundaries must report it without preventing the rest of the app hydrating.
  await Promise.allSettled([...packs].map(([pack, names]) => loader.load(pack, [...names])));
}
