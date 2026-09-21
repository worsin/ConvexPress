import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
const handlers = new Map<string, Function>();
mock.module("electron", () => ({ ipcMain: { handle: (name: string, handler: Function) => handlers.set(name, handler), removeHandler: (name: string) => handlers.delete(name) }, app: { isPackaged: true } }));
const { registerWebsiteEditingHandlers, unregisterWebsiteEditingHandlers } = await import("../ipc/websiteEditing");
const code = "ab".repeat(32);
const origin = "https://site.example";
function windowEvent(id: number, url = "convexpress-app://shell/index.html") {
  const sender = Object.assign(new EventEmitter(), { id, mainFrame: {}, getURL: () => url, isDestroyed: () => false, send: (channel: string, input: unknown) => sender.emit(channel, input) });
  return { sender, senderFrame: sender.mainFrame };
}
const call = (name: string, ...args: unknown[]) => handlers.get(`website-editing:${name}`)!(...args);

test("actual IPC handlers bind renewals to the top frame and owning window; closing cancels access", async () => {
  registerWebsiteEditingHandlers();
  const event = windowEvent(1), other = windowEvent(2);
  const leaseId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  try {
    await expect(call("start", { ...event, senderFrame: {} }, { leaseId, siteUrl: origin })).rejects.toThrow();
    await expect(call("start", windowEvent(3, origin), { leaseId, siteUrl: origin })).rejects.toThrow();
    const descriptor = await call("start", event, { leaseId, siteUrl: origin });
    let request: { requestId: string; leaseId: string } | undefined;
    event.sender.once("website-editing:request", async input => {
      request = input;
      expect(call("respond", other, { requestId: input.requestId, url: `${origin}/#cp-customize=${code}` })).toBe(false);
      expect(call("respond", event, { requestId: input.requestId, url: `${origin}/#cp-customize=${code}` })).toBe(true);
    });
    const response = await fetch(descriptor.endpoint, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ key: descriptor.key, action: "renew" }) });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ code });
    expect(request?.leaseId).toBe(leaseId);
    expect(call("stop", other, leaseId)).toBe(false);
    let closed = false; event.sender.once("website-editing:closed", () => { closed = true; });
    event.sender.emit("will-navigate");
    expect(closed).toBe(true);
    expect(call("respond", event, { requestId: request!.requestId, url: `${origin}/#cp-customize=${code}` })).toBe(false);
    await expect(fetch(descriptor.endpoint)).rejects.toThrow();
  } finally { unregisterWebsiteEditingHandlers(); }
});

test("window destruction rejects an outstanding renewal instead of accepting a late response", async () => {
  registerWebsiteEditingHandlers();
  const event = windowEvent(5), leaseId = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee";
  try {
    const descriptor = await call("start", event, { leaseId, siteUrl: origin });
    const requested = new Promise<{ requestId: string }>(resolve => event.sender.once("website-editing:request", resolve));
    const result = fetch(descriptor.endpoint, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ key: descriptor.key, action: "renew" }) }).then(r => r.status, () => 0);
    const request = await requested;
    event.sender.emit("destroyed");
    expect(call("respond", event, { requestId: request.requestId, url: `${origin}/#cp-customize=${code}` })).toBe(false);
    expect(await result).toBe(410);
  } finally { unregisterWebsiteEditingHandlers(); }
});
