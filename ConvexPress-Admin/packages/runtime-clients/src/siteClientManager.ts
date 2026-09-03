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
const CLIENT_RETIREMENT_GRACE_MS = 250;

export class SiteClientManager<
  TClient extends SiteClientLike = ConvexReactClient,
> {
  private generation = 0;
  private activeRequestKey: string | null = null;
  private pendingSelection: Promise<void> | null = null;
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

  select(
    target: SiteClientTarget,
    exchangeSession: (target: SiteClientTarget) => Promise<SiteSession>,
    requestKey = `${target.connectionId}|${target.instanceKey}|${target.deploymentOrigin}`,
  ): Promise<void> {
    if (requestKey === this.activeRequestKey) {
      return this.pendingSelection ?? Promise.resolve();
    }

    const selection = ++this.generation;
    this.activeRequestKey = requestKey;
    this.disposeActiveClient();
    this.setSnapshot({
      status: "switching",
      instanceKey: target.instanceKey,
      client: null,
      error: null,
    });

    const operation = this.runSelection(selection, target, exchangeSession);
    this.pendingSelection = operation;
    void operation.then(
      () => {
        if (selection === this.generation) this.pendingSelection = null;
      },
      () => {
        if (selection === this.generation) this.pendingSelection = null;
      },
    );
    return operation;
  }

  private async runSelection(
    selection: number,
    target: SiteClientTarget,
    exchangeSession: (target: SiteClientTarget) => Promise<SiteSession>,
  ): Promise<void> {
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
    this.activeRequestKey = null;
    this.pendingSelection = null;
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
    if (active) {
      // React providers still run passive cleanup against the previous client
      // after the external-store snapshot changes, and development/HMR may
      // schedule that passive cleanup on a later task. Retire it immediately
      // from application state, then close it after a bounded grace window so
      // cleanup can clear auth/subscriptions without touching a closed client.
      setTimeout(() => void active.close(), CLIENT_RETIREMENT_GRACE_MS);
    }
  }

  private setSnapshot(snapshot: SiteClientSnapshot<TClient>) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
