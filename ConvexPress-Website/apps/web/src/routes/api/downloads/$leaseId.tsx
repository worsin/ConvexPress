import { createFileRoute } from "@tanstack/react-router";
import { serveDownload } from "@/lib/downloads/serve";
import { readServerSiteRuntime } from "@/lib/site-runtime";

function handle(request: Request, leaseId: string) {
  return serveDownload(request, leaseId, { backendSiteOrigin: readServerSiteRuntime().convexSiteUrl ?? "", fetch });
}
export const Route = createFileRoute("/api/downloads/$leaseId")({
  server: { handlers: {
    POST: ({ request, params }) => handle(request, params.leaseId),
    GET: ({ request, params }) => handle(request, params.leaseId),
    HEAD: ({ request, params }) => handle(request, params.leaseId),
  } },
});
