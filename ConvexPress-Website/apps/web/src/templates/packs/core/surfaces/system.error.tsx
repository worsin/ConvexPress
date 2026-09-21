/** Core · system.error — the runtime error screen (root error boundary). */
import { ErrorTemplate } from "@/templates/packs/core/parts/runtime-error";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface ErrorSurfaceData {
  error: Error;
  /** Retry the failed render; when absent the surface invalidates the router. */
  reset?: () => void;
}

export default function CoreSystemError({ data }: SurfaceProps<ErrorSurfaceData>) {
  return <ErrorTemplate error={data.error} reset={data.reset} />;
}
