import { ConvexReactClient } from "convex/react";

export interface SiteClientLike {
  setAuth(
    fetchToken: (args?: { forceRefreshToken?: boolean }) => Promise<string | null>,
  ): void;
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
  private activeTarget: SiteClientTarget | null = null;
  private activeExchange: ((target: SiteClientTarget) => Promise<SiteSession>) | null = null;
  private refreshing: Promise<string | null> | null = null;
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

  /**
   * Token for the active site. When the session is about to expire (or Convex
   * asks for a forced refresh) the operator session is exchanged again for the
   * same target, so a long-lived admin tab does not silently lose auth.
   */
  fetchAccessToken = async (args?: { forceRefreshToken?: boolean }): Promise<string | null> => {
    const fresh =
      this.activeToken !== null &&
      Date.now() < this.activeToken.expiresAt - TOKEN_EXPIRY_MARGIN_MS;
    if (fresh && !args?.forceRefreshToken) return this.activeToken!.token;
    return this.refreshToken();
  };

  private refreshToken(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const target = this.activeTarget;
    const exchange = this.activeExchange;
    if (!target || !exchange) return Promise.resolve(null);
    this.refreshing = exchange(target)
      .then((session) => {
        if (generation !== this.generation) return null;
        if (
          !session.token ||
          !Number.isSafeInteger(session.expiresAt) ||
          session.expiresAt <= Date.now() + TOKEN_EXPIRY_MARGIN_MS
        ) {
          return null;
        }
        this.activeToken = { token: session.token, expiresAt: session.expiresAt };
        return session.token;
      })
      .catch(() => null)
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

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
      if (selection !== this.generation) {
        void client.close();
        return;
      }
      this.activeClient = client;
      this.activeToken = { token, expiresAt };
      this.activeTarget = target;
      this.activeExchange = exchangeSession;
      client.setAuth(this.fetchAccessToken);
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
    // A retired site must never be refreshed again.
    this.activeTarget = null;
    this.activeExchange = null;
    this.refreshing = null;
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
