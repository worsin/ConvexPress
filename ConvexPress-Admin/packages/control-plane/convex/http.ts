import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import { resolveAuthRouteCorsConfig } from "./authOrigins";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, {
  cors: resolveAuthRouteCorsConfig({
    siteUrl: process.env.CONVEX_SITE_URL ?? "",
    configuredMode: process.env.CONVEXPRESS_AUTH_MODE,
    additionalOrigins: process.env.CONVEXPRESS_AUTH_TRUSTED_ORIGINS,
  }),
});

export default http;
