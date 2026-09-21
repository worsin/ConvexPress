const TOKEN_KEY = "commerce_session_token";
const OWNER_KEY = "commerce_session_owner";
const LEGACY_SCOPE_KEY = "commerce_session_legacy_scope";
type Store = Pick<Storage, "getItem" | "setItem">;
export interface CommerceSession { token: string; owner: string; scope: string }

export function persistCommerceSession(store: Store | undefined, session: CommerceSession): void {
  try { store?.setItem(`commerce_session_v2:${session.scope}`, JSON.stringify(session)); } catch { /* Memory fallback remains available. */ }
}

/** Anonymous carts follow sign-in; sign-out/account-switch starts a fresh token. */
export function resolveCommerceSession(store: Store | undefined, owner: string, scope: string, fallback?: CommerceSession): CommerceSession {
  let token = fallback?.scope === scope ? fallback.token : undefined;
  let previous = fallback?.scope === scope ? fallback.owner : undefined;
  // A settled tab-local session is newer than storage (which may be full or
  // changed by another signed-in tab). Apply owner rotation below as usual.
  if (!token) {
    try {
      const stored = store?.getItem(`commerce_session_v2:${scope}`);
      if (stored) {
        const value: unknown = JSON.parse(stored);
        if (value && typeof value === "object" && "scope" in value && value.scope === scope &&
            "token" in value && typeof value.token === "string" && value.token &&
            "owner" in value && typeof value.owner === "string" && value.owner) {
          token = value.token; previous = value.owner;
        }
      } else if (store) {
        // Old releases stored one basket per public origin. Let only the first
        // upgraded site at that origin adopt it, then retain separate site records.
        const legacyScope = store.getItem(LEGACY_SCOPE_KEY);
        if (!legacyScope || legacyScope === scope) {
          store.setItem(LEGACY_SCOPE_KEY, scope);
          token = store.getItem(TOKEN_KEY) || token;
          previous = store.getItem(OWNER_KEY) || previous;
        }
      }
    } catch { /* Memory fallback is shared by all consumers in this tab. */ }
  }
  if (!token || (previous && previous !== "anonymous" && previous !== owner)) token = crypto.randomUUID();
  const session = { token, owner, scope };
  persistCommerceSession(store, session);
  return session;
}
