const TOKEN_KEY = "commerce_session_token";
const OWNER_KEY = "commerce_session_owner";
type Store = Pick<Storage, "getItem" | "setItem">;
export interface CommerceSession { token: string; owner: string }

/** Anonymous carts follow sign-in; sign-out/account-switch starts a fresh token. */
export function resolveCommerceSession(store: Store | undefined, owner: string, fallback?: CommerceSession): CommerceSession {
  let token = fallback?.token, previous = fallback?.owner;
  try {
    token = store?.getItem(TOKEN_KEY) || token;
    previous = store?.getItem(OWNER_KEY) || previous;
  } catch { /* Memory fallback is shared by all consumers in this tab. */ }
  if (!token || (previous && previous !== "anonymous" && previous !== owner)) token = crypto.randomUUID();
  const session = { token, owner };
  try { store?.setItem(TOKEN_KEY, token); store?.setItem(OWNER_KEY, owner); } catch { /* Private browsing/storage restrictions. */ }
  return session;
}
