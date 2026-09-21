import { test, expect } from "bun:test";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { createPublicWebsiteFetch, isPublicWebsiteAddress, pinnedPublicLookup } from "../publicWebsiteFetch";

test("Website DNS rejects private, loopback, special, translated and documentation addresses", () => {
  for (const address of ["127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "198.18.0.1", "192.0.2.1", "192.88.99.1", "224.0.0.1", "255.255.255.255", "::1", "::", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "64:ff9b::a00:1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "3fff::1", "not-an-ip"])
    expect(isPublicWebsiteAddress(address)).toBe(false);
  for (const address of ["1.1.1.1", "8.8.8.8", "104.21.1.1", "2606:4700::1111", "2001:4860:4860::8888"]) expect(isPublicWebsiteAddress(address)).toBe(true);
  expect(() => pinnedPublicLookup([{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }])).toThrow("public");
  expect(() => pinnedPublicLookup([{ address: "1.1.1.1", family: 6 }])).toThrow("public");
});
test("Socket lookup retains the validated addresses even if its source changes", async () => {
  const addresses = [{ address: "1.1.1.1", family: 4 }];
  const pinned = pinnedPublicLookup(addresses); addresses[0].address = "127.0.0.1";
  const result = await new Promise(resolve => pinned("public.example", { all: true }, (error, answer) => { expect(error).toBeNull(); resolve(answer); }));
  expect(result).toEqual([{ address: "1.1.1.1", family: 4 }]);
});
test("Private DNS fails before any socket and only fixed same-origin HTTPS routes are allowed", async () => {
  let sockets = 0;
  const transport = createPublicWebsiteFetch("https://public.example", { resolve: async () => [{ address: "127.0.0.1", family: 4 }], request: (() => { sockets++; throw Error("must not connect"); }) as any });
  await expect(transport("https://public.example/", {})).rejects.toThrow("public");
  for (const url of ["http://public.example/", "https://other.example/", "https://user:pass@public.example/", "https://public.example/admin", "https://public.example/#fragment"])
    await expect(transport(url)).rejects.toThrow("probe");
  expect(sockets).toBe(0);
});
test("Pinned HTTPS retains TLS hostname and anonymous headers, streams status and never follows redirects", async () => {
  let sockets = 0, resolutions = 0;
  const transport = createPublicWebsiteFetch("https://public.example", {
    resolve: async () => { resolutions++; return [{ address: "1.1.1.1", family: 4 }]; },
    request: ((url: URL, options: any, receive: any) => {
      sockets++; expect(url.hostname).toBe("public.example"); expect(options.servername).toBe("public.example"); expect(options.rejectUnauthorized).toBe(true); expect(options.agent).toBe(false);
      expect(options.headers.authorization).toBeUndefined(); expect(options.headers.cookie).toBeUndefined();
      options.lookup(url.hostname, {}, (error: unknown, address: string) => { expect(error).toBeNull(); expect(address).toBe("1.1.1.1"); });
      const req = new EventEmitter() as any;
      req.end = () => { const response = Object.assign(Readable.from([Buffer.from("redirect")]), { statusCode: 302, rawHeaders: ["location", "http://127.0.0.1/private"] }); receive(response); };
      return req;
    }) as any,
  });
  const response = await transport("https://public.example/", { headers: { authorization: "synthetic-secret", cookie: "synthetic" } });
  expect(response.status).toBe(302); expect(await response.text()).toBe("redirect"); expect(sockets).toBe(1); expect(resolutions).toBe(1);
});
test("Aborted DNS observation cannot open a late socket", async () => {
  let finish: (addresses: { address: string; family: number }[]) => void = () => {}, sockets = 0;
  const controller = new AbortController();
  const transport = createPublicWebsiteFetch("https://public.example", { resolve: () => new Promise(resolve => { finish = resolve; }), request: (() => { sockets++; throw Error("must not connect"); }) as any });
  const pending = transport("https://public.example/", { signal: controller.signal }); controller.abort(); await expect(pending).rejects.toThrow();
  finish([{ address: "1.1.1.1", family: 4 }]); await Promise.resolve(); expect(sockets).toBe(0);
});
