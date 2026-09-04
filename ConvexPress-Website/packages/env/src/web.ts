import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Build-time environment. `VITE_CONVEX_URL` is optional here because the
 * storefront resolves its Convex deployment at runtime (see
 * `apps/web/src/lib/site-runtime.ts`); one build can serve many sites.
 */
export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.url().optional(),
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});
