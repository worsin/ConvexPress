import { expect, test } from 'bun:test';
import { publicStorageDownloadHref } from '../../templates/sdk/block-renderer/public-file-href';
import { servePublicStorageDownload } from './public-storage';
const origin = 'https://backend.example';
const src = origin + '/api/storage/file-123';
const request = (suffix = '', init?: RequestInit) => new Request('https://site.example/api/public-files/file-123' + suffix, init);
test('only configured storage capabilities become same-origin attachments', () => {
  expect(publicStorageDownloadHref(src, 'guide.txt', origin)).toBe('/api/public-files/file-123?filename=guide.txt');
  for (const value of ['https://other.example/api/storage/file-123', origin + '/admin', src + '?token=secret', src + '#a', 'https://user@backend.example/api/storage/file-123', '/guide.txt']) expect(publicStorageDownloadHref(value, 'a', origin)).toBe(value);
  expect(publicStorageDownloadHref(src, 'a', null)).toBe(src);
});
test('streams exact bytes as a safe attachment without forwarding credentials', async () => {
  const bytes = new Uint8Array([0, 1, 2, 255]);
  let received: { url: string; init: RequestInit } | undefined;
  const response = await servePublicStorageDownload(request('?filename=' + encodeURIComponent('../guide"\r\n.txt'), { headers: { cookie: 'private', authorization: 'private' } }), 'file-123', { backendOrigin: origin, fetch: (async (url, init) => { received = { url: String(url), init: init! }; return new Response(bytes, { headers: { 'content-type': 'text/html', 'set-cookie': 'private' } }); }) as typeof fetch });
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(received!.url).toBe(src);
  const headers = new Headers(received!.init.headers);
  expect(headers.get('cookie')).toBeNull(); expect(headers.get('authorization')).toBeNull();
  expect(received!.init.redirect).toBe('error'); expect(received!.init.credentials).toBe('omit');
  expect(response.headers.get('set-cookie')).toBeNull(); expect(response.headers.get('content-type')).toBe('application/octet-stream');
  expect(response.headers.get('content-disposition')?.startsWith('attachment;')).toBe(true);
  expect(response.headers.get('content-disposition')).not.toContain('\r');
  expect(response.headers.get('content-disposition')).not.toContain('../');
  expect(response.headers.get('cache-control')).toBe('no-store');
});
test('forwards a single range and makes HEAD bodyless', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await servePublicStorageDownload(request('', { method, headers: { range: 'bytes=10-14', 'if-range': '"v1"' } }), 'file-123', { backendOrigin: origin, fetch: (async (_url, init) => {
      const headers = new Headers(init!.headers);
      expect(init!.method).toBe(method); expect(headers.get('range')).toBe(method === 'GET' ? 'bytes=10-14' : null);
      return new Response(method === 'GET' ? '12345' : null, { status: method === 'GET' ? 206 : 200, headers: { 'content-length': method === 'GET' ? '5' : '100', 'content-range': 'bytes 10-14/100', etag: '"v1"' } });
    }) as typeof fetch });
    expect(response.status).toBe(method === 'GET' ? 206 : 200);
    expect(await response.text()).toBe(method === 'GET' ? '12345' : '');
  }
});
test('rejects malformed paths, parameters, methods and ranges before fetch', async () => {
  const deps = { backendOrigin: origin, fetch: (async () => { throw Error('must not fetch'); }) as typeof fetch };
  for (const id of ['../admin', 'a/b', '%2fadmin', '', 'a'.repeat(129)]) expect((await servePublicStorageDownload(request(), id, deps)).status).toBe(404);
  expect((await servePublicStorageDownload(request('', { method: 'POST' }), 'file-123', deps)).status).toBe(405);
  for (const query of ['?url=https://other.example', '?filename=a&filename=b', '?filename=' + 'x'.repeat(2001)]) expect((await servePublicStorageDownload(request(query), 'file-123', deps)).status).toBe(400);
  expect((await servePublicStorageDownload(request('', { headers: { range: 'bytes=0-1,3-4' } }), 'file-123', deps)).status).toBe(416);
});
test('does not relay redirects, errors, encoded bodies or private error details', async () => {
  for (const [upstream, expected] of [[404,404], [403,404], [302,502], [500,502]]) {
    const result = await servePublicStorageDownload(request(), 'file-123', { backendOrigin: origin, fetch: (async () => new Response('private detail', { status: upstream })) as typeof fetch });
    expect(result.status).toBe(expected); expect(await result.text()).not.toContain('private detail');
  }
  expect((await servePublicStorageDownload(request(), 'file-123', { backendOrigin: origin, fetch: (async () => new Response('encoded', { headers: { 'content-encoding': 'gzip' } })) as typeof fetch })).status).toBe(502);
  expect((await servePublicStorageDownload(request(), 'file-123', { backendOrigin: origin, fetch: (async () => { throw Error('offline'); }) as typeof fetch })).status).toBe(502);
});
