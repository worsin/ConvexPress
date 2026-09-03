import { describe, expect, test } from "bun:test";

import {
  assessRuntimeCleanliness,
  processBelongsToCheckout,
} from "./runtime-cleanliness.mjs";

const checkout = "/Users/example/Development/ConvexPress";

describe("acceptance runtime cleanliness", () => {
  test("matches only the exact checkout path", () => {
    expect(
      processBelongsToCheckout(
        { command: "bun /Users/example/Development/ConvexPress/app.ts", cwd: "/" },
        checkout,
      ),
    ).toBe(true);
    expect(
      processBelongsToCheckout(
        { command: "bun app.ts", cwd: "/Users/example/Development/ConvexPress/apps/web" },
        checkout,
      ),
    ).toBe(true);
    expect(
      processBelongsToCheckout(
        { command: "bun app.ts", cwd: "/Users/example/Development/ConvexPress-old" },
        checkout,
      ),
    ).toBe(false);
  });

  test("reports owned descendants, reserved listeners, local data, and stale profiles", () => {
    const result = assessRuntimeCleanliness({
      checkoutRoot: checkout,
      excludedPids: new Set([100]),
      processes: [
        { pid: 100, ppid: 1, rssKb: 10, command: "cleanliness", cwd: checkout },
        { pid: 200, ppid: 1, rssKb: 20, command: "bun vite", cwd: `${checkout}/apps/web` },
        { pid: 201, ppid: 200, rssKb: 30, command: "Electron Helper", cwd: "/" },
        { pid: 300, ppid: 1, rssKb: 40, command: "other", cwd: "/tmp" },
        { pid: 400, ppid: 1, rssKb: 50, command: "codex --yolo", cwd: checkout },
        { pid: 401, ppid: 400, rssKb: 60, command: "npm exec @playwright/mcp", cwd: checkout },
      ],
      listeners: [{ pid: 300, port: 4820, command: "docker-proxy" }],
      localDatabasePaths: [`${checkout}/ConvexPress-Admin/.convex/local/db.sqlite3`],
      staleProfilePaths: ["/tmp/convexpress-electron-acceptance-old"],
    });

    expect(result.clean).toBe(false);
    expect(result.ownedProcesses.map((entry) => entry.pid)).toEqual([200, 201]);
    expect(result.totalOwnedRssKb).toBe(50);
    expect(result.reservedListeners).toHaveLength(1);
    expect(result.localDatabasePaths).toHaveLength(1);
    expect(result.staleProfilePaths).toHaveLength(1);
  });

  test("does not count the cleanliness process or its ancestors as leaked work", () => {
    const result = assessRuntimeCleanliness({
      checkoutRoot: checkout,
      excludedPids: new Set([100, 99]),
      processes: [
        { pid: 99, ppid: 1, rssKb: 20, command: "zsh", cwd: checkout },
        { pid: 100, ppid: 99, rssKb: 30, command: "node cleanliness", cwd: checkout },
      ],
      listeners: [],
      localDatabasePaths: [],
      staleProfilePaths: [],
    });

    expect(result.clean).toBe(true);
    expect(result.ownedProcesses).toEqual([]);
  });
});
