import { createFileRoute } from '@tanstack/react-router';
import { servePublicStorageDownload } from '@/lib/downloads/public-storage';
import { readServerSiteRuntime } from '@/lib/site-runtime';
function handle(request: Request, storageId: string) {
  return servePublicStorageDownload(request, storageId, { backendOrigin: readServerSiteRuntime().convexUrl ?? '', fetch });
}
export const Route = createFileRoute('/api/public-files/$storageId')({
  server: { handlers: {
    GET: ({ request, params }) => handle(request, params.storageId),
    HEAD: ({ request, params }) => handle(request, params.storageId),
  } },
});
