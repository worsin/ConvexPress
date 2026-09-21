import { ConvexError, getDocumentSize, type Value } from "convex/values";
/** Canonical endpoint budget. Counts actual full returned DB documents, including
 * auth/policy/settings fields omitted from display DTOs. Index engine overhead is
 * not materialized document size; policy pagination also enforces server bounds. */
export const CANONICAL_READ_LIMITS: Readonly<RequestReadLimits> = Object.freeze<RequestReadLimits>({ queries: 256, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 });
export type MeasuredPolicyPage<T> = { items: T[]; rows: number; bytes: number };
export interface RequestReadLimits { queries:number; documents:number; bytes:number; documentBytes:number }
export class RequestReadLedger {
  /** Earliest time at which authority read by this request may change. */
  authorizationRecheckAt: number | null = null;
  noteAuthorizationBoundary(time: number | undefined, now = Date.now()): void {
    if (time !== undefined && Number.isFinite(time) && time > now)
      this.authorizationRecheckAt = Math.min(this.authorizationRecheckAt ?? time, time);
  }
  queries = 0;
  documents = 0;
  bytes = 0;
  constructor(readonly limits: Readonly<RequestReadLimits> = CANONICAL_READ_LIMITS) {}
  private refuse(): never { throw new ConvexError({ code: "CANONICAL_READ_BUDGET", message: "The document exceeds its safe read budget. No dependent data was loaded after refusal." }); }
  beforeRead(): void {
    if (this.queries >= this.limits.queries || this.documents >= this.limits.documents || this.bytes >= this.limits.bytes) this.refuse();
    this.queries++;
  }
  record<T extends object | null>(document: T): T {
    if (document) {
      const size = getDocumentSize(document as Record<string, Value>);
      if (size > this.limits.documentBytes) this.refuse();
      this.recordPage({ rows: 1, bytes: size });
    }
    return document;
  }
  recordPage(stats: { rows: number; bytes: number }): void {
    if (!Number.isSafeInteger(stats.rows) || !Number.isSafeInteger(stats.bytes) || stats.rows < 0 || stats.bytes < 0) this.refuse();
    this.documents += stats.rows;
    this.bytes += stats.bytes;
    if (this.documents > this.limits.documents || this.bytes > this.limits.bytes) this.refuse();
  }
}
export function isRequestReadBudgetError(error: unknown): boolean {
  return error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "code" in error.data && error.data.code === "CANONICAL_READ_BUDGET";
}
