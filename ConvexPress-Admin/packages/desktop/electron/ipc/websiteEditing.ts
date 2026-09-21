import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDev } from "../utils/platform";
import { isAppRendererSender, isDevAppRendererSender } from "./setupSender";
import { startWebsiteEditingBridge } from "../websiteEditing/loopback";
const { ipcMain } = require("electron") as typeof import("electron");

type Lease = { senderId: number; close(): void };
const leases = new Map<string, Lease>();
const pending = new Map<string, { leaseId: string; senderId: number; finish(url: string | null): void }>();

function assertSender(event: Electron.IpcMainInvokeEvent) {
  if (event.senderFrame !== event.sender.mainFrame || !(isDev()
    ? isDevAppRendererSender(event.sender.getURL())
    : isAppRendererSender(event.sender.getURL(), { rendererIndexPath: path.join(__dirname, "..", "dist", "index.html") }))) throw Error("Website editing is only available from the ConvexPress app");
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) throw Error("Invalid website editing request");
  return value;
}

export function registerWebsiteEditingHandlers() {
  ipcMain.handle("website-editing:start", async (event, input: unknown) => {
    assertSender(event);
    const raw = input as { leaseId?: unknown; siteUrl?: unknown } | null;
    const leaseId = identifier(raw?.leaseId);
    if (typeof raw?.siteUrl !== "string" || raw.siteUrl.length > 2048 || leases.has(leaseId) || leases.size >= 32) throw Error("Close an existing website editing connection and try again");
    const sender = event.sender;
    let listener: Awaited<ReturnType<typeof startWebsiteEditingBridge>> | undefined;
    let cancelled = false;
    const close = () => {
      if (cancelled) return;
      cancelled = true; listener?.close(); leases.delete(leaseId);
      sender.removeListener("destroyed", close);
      sender.removeListener("render-process-gone", close);
      sender.removeListener("will-navigate", close);
      for (const request of pending.values()) if (request.leaseId === leaseId) request.finish(null);
      if (!sender.isDestroyed()) sender.send("website-editing:closed", { leaseId });
    };
    // Reserve before listening: concurrent starts cannot exceed the bound.
    leases.set(leaseId, { senderId: sender.id, close });
    sender.once("destroyed", close); sender.once("render-process-gone", close); sender.once("will-navigate", close);
    try {
      listener = await startWebsiteEditingBridge({ siteUrl: raw.siteUrl, onClose: close,
        renew: () => new Promise<string>((resolve, reject) => {
          if (cancelled || sender.isDestroyed()) { reject(Error("Editing window closed")); return; }
          const requestId = randomUUID();
          const timer = setTimeout(() => finish(null), 18_000);
          const finish = (url: string | null) => {
            clearTimeout(timer); pending.delete(requestId);
            if (url && !cancelled) resolve(url); else reject(Error("Desktop authorization unavailable"));
          };
          pending.set(requestId, { leaseId, senderId: sender.id, finish });
          try { sender.send("website-editing:request", { requestId, leaseId }); }
          catch { finish(null); }
        }),
      });
      if (cancelled) { listener.close(); throw Error("Editing window closed"); }
      return listener.descriptor;
    } catch { close(); throw Error("Could not establish the website editing connection"); }
  });
  ipcMain.handle("website-editing:respond", (event, input: unknown) => {
    assertSender(event);
    const raw = input as { requestId?: unknown; url?: unknown } | null;
    const request = pending.get(identifier(raw?.requestId));
    if (!request || request.senderId !== event.sender.id) return false;
    request.finish(typeof raw?.url === "string" && raw.url.length <= 4096 ? raw.url : null);
    return true;
  });
  ipcMain.handle("website-editing:stop", (event, leaseId: unknown) => {
    assertSender(event);
    const lease = leases.get(identifier(leaseId));
    if (!lease || lease.senderId !== event.sender.id) return false;
    lease.close(); return true;
  });
}

export function unregisterWebsiteEditingHandlers() {
  for (const lease of leases.values()) lease.close();
  for (const channel of ["website-editing:start", "website-editing:respond", "website-editing:stop"]) ipcMain.removeHandler(channel);
}
