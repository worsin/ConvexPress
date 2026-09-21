import { lazy, Suspense } from "react";
import type { ConvexPressBlock } from "@/lib/blocks/types";

export interface BlockListRendererProps {
  blocks: ConvexPressBlock[];
  /**
   * Override the disabled-block list from settings (mostly for tests/storybook).
   * Production code should rely on the SettingsContext.
   */
  disabledBlockNames?: string[];
}

let resolved: typeof import("./BlockListRenderer.implementation").BlockListRenderer | undefined;
let pending: Promise<{ default: NonNullable<typeof resolved> }> | undefined;
function load() {
  return pending ??= import("./BlockListRenderer.implementation").then((module) => {
    resolved = module.BlockListRenderer;
    return { default: resolved };
  });
}
const DeferredRenderer = lazy(load);

/** Legacy content remains supported without loading its registry on canonical pages. */
export function BlockListRenderer(props: BlockListRendererProps) {
  const Renderer = resolved ?? DeferredRenderer;
  return <Suspense fallback={null}><Renderer {...props} /></Suspense>;
}

/** Called before hydrateRoot, alongside selected template surfaces. */
export async function prepareLegacyBlockHydration(root: ParentNode): Promise<void> {
  if (root.querySelector('[data-slot="block-list-renderer"]')) await load();
}
