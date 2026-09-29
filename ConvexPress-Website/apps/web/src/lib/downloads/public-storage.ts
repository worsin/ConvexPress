import { attachment } from './serve';
type Dependencies = { backendOrigin: string; fetch: typeof fetch };
const safeHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' };
function failure(status: number) { return new Response('File download unavailable.', { status, headers: safeHeaders }); }
/** Streams an already-public storage capability as an attachment. The only
 * upstream is this deployment's configured storage origin. No credentials,
 * arbitrary URLs, redirects, media lookups or private delivery leases. */
export async function servePublicStorageDownload(request: Request, storageId: string, deps: Dependencies): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(storageId)) return failure(404);
  if (!['GET', 'HEAD'].includes(request.method)) return failure(405);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== 'filename') || params.getAll('filename').length > 1) return failure(400);
  const filename = params.get('filename') || 'download';
  if (filename.length > 2000) return failure(400);
  const headers = new Headers({ 'Accept-Encoding': 'identity' });
  const range = request.method === 'GET' ? request.headers.get('range') : null;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]) || [match[1], match[2]].some(part => part && !Number.isSafeInteger(Number(part))) || (match[1] && match[2] && Number(match[1]) > Number(match[2])) || (!match[1] && Number(match[2]) === 0)) return failure(416);
    headers.set('Range', range);
    const ifRange = request.headers.get('if-range');
    if (ifRange && ifRange.length <= 256) headers.set('If-Range', ifRange);
  }
  try {
    const origin = new URL(deps.backendOrigin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) return failure(503);
    const upstream = await deps.fetch(`${origin.origin}/api/storage/${storageId}`, { method: request.method, headers, redirect: 'error', credentials: 'omit', signal: request.signal });
    if (![200, 206].includes(upstream.status) || (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity')) {
      await upstream.body?.cancel();
      return failure([403,404].includes(upstream.status) ? 404 : upstream.status === 416 ? 416 : 502);
    }
    const responseHeaders = new Headers(safeHeaders);
    responseHeaders.set('Content-Type', 'application/octet-stream');
    responseHeaders.set('Content-Disposition', attachment(filename));
    for (const key of ['content-length', 'etag', 'last-modified', 'accept-ranges']) {
      const value = upstream.headers.get(key); if (value) responseHeaders.set(key, value);
    }
    if (upstream.status === 206 && upstream.headers.has('content-range')) responseHeaders.set('Content-Range', upstream.headers.get('content-range')!);
    if (request.method === 'HEAD') await upstream.body?.cancel();
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch { return failure(502); }
}
