export function isClosedCart(cart: { status: string } | null | undefined): boolean {
  return cart?.status === "converted" || cart?.status === "merged";
}

export function isActiveCheckoutSession(session: {status: string}): boolean {
  return ["draft", "collecting_shipping", "collecting_payment", "ready_for_review", "payment_pending"].includes(session.status);
}

export function selectCheckoutSession<T extends {status: string}>(sessions: T[]): T | null {
  return sessions.find(isActiveCheckoutSession)
    ?? sessions.find((session) => session.status === "abandoned")
    ?? sessions[0]
    ?? null;
}
