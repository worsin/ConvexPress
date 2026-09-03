import { describe, expect, test } from "bun:test";

import { SiteClientManager } from "../siteClientManager";

class FakeClient {
  closed = false;
  tokenFetcher: (() => Promise<string | null>) | null = null;

  setAuth(fetcher: () => Promise<string | null>) {
    this.tokenFetcher = fetcher;
  }

  close() {
    this.closed = true;
  }
}

const target = (instanceKey: string, deploymentOrigin: string) => ({
  connectionId: `connection:${instanceKey}`,
  instanceKey,
  deploymentOrigin,
});

describe("replaceable site client manager", () => {
  test("keeps no old client visible while a new site session is exchanged", async () => {
    const clients: FakeClient[] = [];
    const manager = new SiteClientManager<FakeClient>((_origin) => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    });
    await manager.select(target("instance_live", "https://live.convex.cloud"), async () => ({
      token: "token-live",
      expiresAt: Date.now() + 60_000,
    }));
    expect(manager.getSnapshot().status).toBe("ready");
    expect(await manager.fetchAccessToken()).toBe("token-live");

    let finishExchange!: (value: { token: string; expiresAt: number }) => void;
    const pending = manager.select(
      target("instance_staging", "https://staging.convex.cloud"),
      () => new Promise((resolve) => (finishExchange = resolve)),
    );
    expect(clients[0]?.closed).toBe(false);
    expect(manager.getSnapshot()).toMatchObject({
      status: "switching",
      instanceKey: "instance_staging",
      client: null,
    });
    expect(await manager.fetchAccessToken()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(clients[0]?.closed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 275));
    expect(clients[0]?.closed).toBe(true);

    finishExchange({ token: "token-staging", expiresAt: Date.now() + 60_000 });
    await pending;
    expect(manager.getSnapshot()).toMatchObject({
      status: "ready",
      instanceKey: "instance_staging",
      client: clients[1],
    });
    expect(await clients[1]?.tokenFetcher?.()).toBe("token-staging");
  });

  test("discards a stale exchange and closes every replaced client", async () => {
    const clients: FakeClient[] = [];
    const manager = new SiteClientManager<FakeClient>(() => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    });
    let finishFirst!: (value: { token: string; expiresAt: number }) => void;
    const first = manager.select(
      target("instance_one", "https://one.convex.cloud"),
      () => new Promise((resolve) => (finishFirst = resolve)),
    );
    const second = manager.select(
      target("instance_two", "https://two.convex.cloud"),
      async () => ({ token: "token-two", expiresAt: Date.now() + 60_000 }),
    );
    finishFirst({ token: "token-one", expiresAt: Date.now() + 60_000 });
    await Promise.all([first, second]);
    expect(manager.getSnapshot()).toMatchObject({
      status: "ready",
      instanceKey: "instance_two",
    });
    expect(clients).toHaveLength(1);

    manager.clear();
    expect(clients[0]?.closed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(clients[0]?.closed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 275));
    expect(clients[0]?.closed).toBe(true);
    expect(manager.getSnapshot()).toMatchObject({ status: "idle", client: null });
    expect(await manager.fetchAccessToken()).toBeNull();
  });

  test("fails closed when exchange fails or a token expires", async () => {
    const manager = new SiteClientManager<FakeClient>(() => new FakeClient());
    await manager.select(
      target("instance_failed", "https://failed.convex.cloud"),
      async () => {
        throw new Error("network detail must not persist");
      },
    );
    expect(manager.getSnapshot()).toMatchObject({
      status: "error",
      client: null,
      error: "Site session could not be established",
    });

    await manager.select(target("instance_expired", "https://expired.convex.cloud"), async () => ({
      token: "expired-token",
      expiresAt: Date.now() - 1,
    }));
    expect(manager.getSnapshot()).toMatchObject({ status: "error", client: null });
  });
});
