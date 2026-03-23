/**
 * Event Dispatcher System - Retry Logic
 *
 * Calculates retry delays for failed listener executions.
 * Supports linear and exponential backoff strategies with jitter.
 *
 * Linear:      delay * attempt
 *   attempt 1: 1000ms, attempt 2: 2000ms, attempt 3: 3000ms
 *
 * Exponential:  delay * 2^(attempt-1) + jitter
 *   attempt 1: ~1000ms, attempt 2: ~2000ms, attempt 3: ~4000ms
 *
 * Jitter is added to exponential backoff to prevent thundering herd
 * when multiple listeners retry simultaneously.
 */

/** Maximum retry delay to prevent absurdly long waits (5 minutes). */
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

/**
 * Calculate the retry delay for a given attempt.
 *
 * @param attempt - The attempt number that just failed (1-based)
 * @param baseDelayMs - Base delay in milliseconds (e.g., 1000)
 * @param backoff - "linear" or "exponential"
 * @returns Delay in milliseconds before the next retry
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelayMs: number,
  backoff: "linear" | "exponential",
): number {
  let delay: number;

  if (backoff === "linear") {
    // Linear: baseDelay * attempt
    delay = baseDelayMs * attempt;
  } else {
    // Exponential: baseDelay * 2^(attempt-1) + random jitter (0-25% of delay)
    delay = baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * delay * 0.25;
    delay += jitter;
  }

  // Cap at maximum
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/**
 * Determine if a failed execution should be retried.
 *
 * @param currentAttempt - The attempt number that just failed (1-based)
 * @param maxRetries - Maximum number of retry attempts allowed
 * @returns true if another retry should be scheduled
 */
export function shouldRetry(
  currentAttempt: number,
  maxRetries: number,
): boolean {
  return currentAttempt < maxRetries;
}

/**
 * Calculate the absolute timestamp for the next retry.
 *
 * @param now - Current timestamp in milliseconds
 * @param attempt - The attempt number that just failed
 * @param baseDelayMs - Base delay in milliseconds
 * @param backoff - Backoff strategy
 * @returns Absolute timestamp (ms) when the retry should execute
 */
export function getNextRetryAt(
  now: number,
  attempt: number,
  baseDelayMs: number,
  backoff: "linear" | "exponential",
): number {
  return now + calculateRetryDelay(attempt, baseDelayMs, backoff);
}
