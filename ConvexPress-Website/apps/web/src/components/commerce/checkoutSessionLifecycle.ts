export function needsNewCheckoutSession(session: { status?: string } | null | undefined): boolean {
  return session === null || Boolean(session && ["completed", "failed", "abandoned"].includes(session.status ?? ""));
}
