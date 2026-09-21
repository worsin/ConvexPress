import { createFileRoute } from "@tanstack/react-router";
import { serveDownload } from "@/lib/downloads/serve";
import { readServerSiteRuntime } from "@/lib/site-runtime";

function handle(request: Request, leaseId: string) {
  return serveDownload(request, leaseId, { kind: "lead-magnet", backendSiteOrigin: readServerSiteRuntime().convexSiteUrl ?? "", fetch });
}
export const Route = createFileRoute("/api/lead-magnets/$leaseId")({
  server: { handlers: {
    POST: ({ request, params }) => handle(request, params.leaseId),
    GET: ({ request, params }) => handle(request, params.leaseId),
    HEAD: ({ request, params }) => handle(request, params.leaseId),
  } },
});
