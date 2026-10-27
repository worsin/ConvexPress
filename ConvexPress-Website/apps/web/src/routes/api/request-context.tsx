// The visitor's address and browser, sealed for the backend (lib/request-context-seal.ts).
// The browser asks for a token just before it submits a form or records a
// sign-in, and passes it along; it never states an address itself.
import { createFileRoute } from "@tanstack/react-router";

import { requestContextFor } from "@/lib/request-context-seal";

export const Route = createFileRoute("/api/request-context")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        Response.json(
          { token: await requestContextFor(request.headers, process.env, Date.now()) },
          { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
        ),
    },
  },
});
