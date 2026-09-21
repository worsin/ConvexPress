"use node";
import { lookup } from "node:dns/promises";
import { request, type RequestOptions } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

const denied = new BlockList(), globalV6 = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const)
  denied.addSubnet(address, prefix, "ipv4");
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) denied.addSubnet(address, prefix, "ipv6");
export function isPublicWebsiteAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !denied.check(address, "ipv4") : family === 6 && globalV6.check(address, "ipv6") && !denied.check(address, "ipv6");
}
type Address = { address: string; family: number };
export function pinnedPublicLookup(addresses: Address[]): LookupFunction {
  if (!addresses.length || addresses.length > 32 || addresses.some(item => item.family !== isIP(item.address) || !isPublicWebsiteAddress(item.address))) throw Error("Website address must resolve only to public IP addresses");
  const pinned = addresses.map(item => ({ ...item }));
  return (_hostname, options, callback) => {
    const candidates = options.family ? pinned.filter(item => item.family === options.family) : pinned;
    if (!candidates.length) { callback(Error("No supported public website address"), "", 4); return; }
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  };
}
async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    })]);
  } finally { signal.removeEventListener("abort", abort); }
}
/** Anonymous fixed-route HTTPS only. DNS is checked once and pinned into the
 * actual socket lookup; TLS still verifies the original hostname. No proxy,
 * redirects, credential forwarding or second DNS lookup can change the target. */
export function createPublicWebsiteFetch(origin: string, options: { resolve?: (hostname: string) => Promise<Address[]>; request?: typeof request } = {}): typeof fetch {
  const base = new URL(origin);
  if (base.origin !== origin || base.protocol !== "https:" || base.port || isIP(base.hostname)) throw Error("Invalid public website origin");
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin || url.username || url.password || url.hash || !["/", "/document-preview/"].includes(url.pathname) ||
      (init?.method && init.method !== "GET") || init?.body || input instanceof Request) throw Error("Invalid public website probe");
    const signal = AbortSignal.any([AbortSignal.timeout(6000), ...(init?.signal ? [init.signal] : [])]);
    const addresses = await abortable((options.resolve ?? (hostname => lookup(hostname, { all: true, verbatim: true })))(url.hostname), signal);
    const socketLookup = pinnedPublicLookup(addresses); signal.throwIfAborted();
    return new Promise<Response>((resolve, reject) => {
      const requestOptions: RequestOptions = { method: "GET", agent: false, lookup: socketLookup, servername: url.hostname,
        rejectUnauthorized: true, signal, maxHeaderSize: 32 * 1024,
        headers: { accept: "text/html", "cache-control": "no-cache", "accept-encoding": "identity" } };
      const req = (options.request ?? request)(url, requestOptions, response => {
        try {
          const headers = new Headers();
          for (let i = 0; i < response.rawHeaders.length; i += 2) headers.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
          const status = response.statusCode ?? 502;
          if ([204, 205, 304].includes(status)) { response.destroy(); resolve(new Response(null, { status, headers })); }
          else resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status, headers }));
        } catch { response.destroy(); reject(Error("Invalid public website response")); }
      });
      req.once("error", () => reject(Error("Public website connection failed")));
      req.end();
    });
  }) as typeof fetch;
}
