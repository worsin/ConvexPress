import { ConvexReactClient } from "convex/react";

export interface SiteClientLike {
  setAuth(fetchToken: () => Promise<string | null>): void;
  close(): void | Promise<void>;
}

export interface SiteClientTarget {
  connectionId: string;
  instanceKey: string;
  deploymentOrigin: string;
}

export interface SiteSession {
  token: string;
  expiresAt: number;
}

export type SiteClientSnapshot<TClient> = {
  status: "idle" | "switching" | "ready" | "error";
  instanceKey: string | null;
  client: TClient | null;
  error: string | null;
};

const TOKEN_EXPIRY_MARGIN_MS = 5_000;

export class SiteClientManager<
  TClient extends SiteClientLike = ConvexReactClient,
> {
  private generation = 0;
  private activeClient: TClient | null = null;
  private activeToken: SiteSession | null = null;
  private listeners = new Set<() => void>();
  private snapshot: SiteClientSnapshot<TClient> = {
    status: "idle",
    instanceKey: null,
    client: null,
    error: null,
  };

  constructor(
    private readonly createClient: (deploymentOrigin: string) => TClient = ((
      deploymentOrigin: string,
    ) => new ConvexReactClient(deploymentOrigin) as unknown as TClient),
  ) {}

  getSnapshot = () => this.snapshot;

  fetchAccessToken = async (): Promise<string | null> => {
    if (
      !this.activeToken ||
      Date.now() >= this.activeToken.expiresAt - TOKEN_EXPIRY_MARGIN_MS
    ) {
      return null;
    }
    return this.activeToken.token;
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async select(
    target: SiteClientTarget,
    exchangeSession: (target: SiteClientTarget) => Promise<SiteSession>,
  ): Promise<void> {
    const selection = ++this.generation;
    this.disposeActiveClient();
    this.setSnapshot({
      status: "switching",
      instanceKey: target.instanceKey,
      client: null,
      error: null,
    });

    try {
      const session = await exchangeSession(target);
      if (selection !== this.generation) return;
      if (
        !session.token ||
        !Number.isSafeInteger(session.expiresAt) ||
        session.expiresAt <= Date.now() + TOKEN_EXPIRY_MARGIN_MS
      ) {
        throw new Error("expired site session");
      }
      const token = session.token;
      const expiresAt = session.expiresAt;
      const client = this.createClient(target.deploymentOrigin);
      client.setAuth(async () =>
        Date.now() < expiresAt - TOKEN_EXPIRY_MARGIN_MS ? token : null,
      );
      if (selection !== this.generation) {
        void client.close();
        return;
      }
      this.activeClient = client;
      this.activeToken = { token, expiresAt };
      this.setSnapshot({
        status: "ready",
        instanceKey: target.instanceKey,
        client,
        error: null,
      });
    } catch {
      if (selection !== this.generation) return;
      this.disposeActiveClient();
      this.setSnapshot({
        status: "error",
        instanceKey: target.instanceKey,
        client: null,
        error: "Site session could not be established",
      });
    }
  }

  clear() {
    this.generation += 1;
    this.disposeActiveClient();
    this.setSnapshot({
      status: "idle",
      instanceKey: null,
      client: null,
      error: null,
    });
  }

  private disposeActiveClient() {
    const active = this.activeClient;
    this.activeClient = null;
    this.activeToken = null;
    if (active) void active.close();
  }

  private setSnapshot(snapshot: SiteClientSnapshot<TClient>) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
