/** A rejected OCC commit has not stored a vote. Keep the exact request identity
 * while giving competing transactions time to finish. Never retry an auth,
 * policy, rate, CAPTCHA, transport or unknown application error automatically. */
export function isPollWriteConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  try {
    const details = JSON.parse(error.message);
    if (details?.code === "OptimisticConcurrencyControlFailure") return true;
  } catch { /* WebSocket errors wrap the original Convex system message. */ }
  return /Documents read from or written to the [\s\S]+ changed while this mutation was being run and on every subsequent retry\./.test(error.message);
}
export async function retryPollWrite<T>(write: () => Promise<T>, options: {
  active?: () => boolean;
  pause?: (milliseconds: number) => Promise<void>;
  random?: () => number;
} = {}): Promise<T> {
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    if (options.active && !options.active()) throw new Error("Poll authority changed before retry");
    try { return await write(); }
    catch (error) {
      if (!isPollWriteConflict(error) || attempt >= 4) throw error;
      await pause(150 * 2 ** attempt + Math.floor((options.random ?? Math.random)() * 150));
    }
  }
}
