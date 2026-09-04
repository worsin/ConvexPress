/**
 * Core · system.notFound — the 404 screen.
 *
 * `kind: "root"` is the bare not-found outside the marketing chrome (root
 * route); `kind: "page"` is the in-layout 404 with search, which also logs
 * the hit for the admin's 404 report.
 */
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { NotFoundTemplate } from "@/templates/NotFoundTemplate";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface NotFoundSurfaceData {
  kind: "root" | "page";
  /** Payload attached to the not-found error, when the router supplied one. */
  data?: unknown;
}

export default function CoreSystemNotFound({ data }: SurfaceProps<NotFoundSurfaceData>) {
  if (data.kind === "root") return <NotFoundTemplate data={data.data} />;
  return <NotFoundPage data={data.data} />;
}
