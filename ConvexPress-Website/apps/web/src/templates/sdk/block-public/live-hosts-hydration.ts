type HostLoader = { loadLiveHosts: (ids: Iterable<string>) => Promise<void> };
/** Load the live hosts a server-rendered body names (`<template data-live-hosts>`,
 * written by LiveBlockHosts) before the page hydrates, as block-preview/
 * hydration.ts does for block renderers. Loads code only. */
export async function prepareLiveHostHydration(
  root: ParentNode,
  importHosts: () => Promise<HostLoader> = () => import("./live-hosts"),
): Promise<void> {
  const ids = new Set<string>();
  for (const marker of root.querySelectorAll("template[data-live-hosts]")) {
    for (const id of (marker.getAttribute("data-live-hosts") ?? "").split(" ")) if (/^[a-zA-Z]+$/.test(id)) ids.add(id);
  }
  if (!ids.size) return;
  await (await importHosts()).loadLiveHosts(ids);
}
