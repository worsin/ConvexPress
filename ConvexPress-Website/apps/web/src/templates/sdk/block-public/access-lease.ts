import type { PublicAccessLease } from '../block-data/portable/publicDocumentContracts';

export interface PublicLeaseTimers {
  now(): number;
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
}
/** Use elapsed time, not an assumed agreement between client and server clocks.
 * Starting before the query means network latency shortens the lease; it never
 * grants extra display time. Wall elapsed time also catches suspended devices. */
export function publicLeaseTimers(): PublicLeaseTimers {
  const monotonicStart = performance.now(), wallStart = Date.now();
  return {
    now: () => Math.max(performance.now() - monotonicStart, Date.now() - wallStart),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}
export function createPublicLeaseClock(timers: PublicLeaseTimers, expired: () => void) {
  const startedAt = timers.now();
  let serverAnchor: number | null = null, lastEvaluation: number | null = null;
  let deadline: number | null = null, timer: unknown, disposed = false;
  const cancel = () => { if (timer !== undefined) timers.cancel(timer); timer = undefined; };
  const check = () => {
    if (disposed || deadline === null) return;
    cancel();
    const remaining = deadline - timers.now();
    if (remaining <= 0) { deadline = null; expired(); }
    else timer = timers.schedule(check, remaining);
  };
  return {
    install(lease: PublicAccessLease | null): boolean {
      cancel(); deadline = null;
      if (disposed) return false;
      if (lease === null) return true;
      if (lastEvaluation !== null && lease.evaluatedAt < lastEvaluation) return false;
      serverAnchor ??= lease.evaluatedAt;
      lastEvaluation = lease.evaluatedAt;
      deadline = Math.min(startedAt + lease.expiresAt - serverAnchor, timers.now() + lease.expiresAt - lease.evaluatedAt);
      if (deadline <= timers.now()) { deadline = null; return false; }
      check(); return true;
    },
    check,
    dispose() { disposed = true; deadline = null; cancel(); },
  };
}
