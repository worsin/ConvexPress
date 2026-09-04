/**
 * `<Surface name="shop.product" data={state} fallback={Classic} />`
 *
 * Routes load data and hand it to a named surface; the active template pack
 * decides how it looks. When no pack implements the surface, `fallback`
 * (the route's own default, i.e. Core) renders, so extraction can happen one
 * surface at a time with nothing breaking.
 */

import type { ReactElement } from "react";

import type { SurfaceComponent } from "./types";
import { useTemplate } from "./useTemplate";
import { useDraftVariants } from "./useTemplateSettings";

export function Surface<TData>({
  name,
  data,
  fallback: Fallback,
}: {
  name: string;
  data: TData;
  fallback?: SurfaceComponent<TData>;
}): ReactElement | null {
  const template = useTemplate();
  const draftVariants = useDraftVariants();
  const resolved = template.resolve(name);
  const { packId, component: Component } = resolved;
  const variant = draftVariants[name] ?? resolved.variant;
  const Render = (Component ?? Fallback) as SurfaceComponent<TData> | undefined;
  if (!Render) return null;
  return (
    <div data-surface={name} data-template={packId} data-variant={variant} className="contents">
      <Render data={data} variant={variant} packId={packId} />
    </div>
  );
}
