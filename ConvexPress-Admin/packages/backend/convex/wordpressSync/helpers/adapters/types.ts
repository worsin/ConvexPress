// @ts-nocheck
/**
 * Shared types for all source adapters.
 */

export type ErrorCategory = "auth" | "capability" | "source_data" | "network" | "rate_limit" | "unknown";

export interface NormalizedError {
  category: ErrorCategory;
  statusCode?: number;
  message: string;
  retryable: boolean;
}

export interface PaginationInfo {
  total: number;
  totalPages: number;
  currentPage: number;
  hasMore: boolean;
}

export interface NormalizedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

export interface ProbeResult {
  reachable: boolean;
  authenticated: boolean;
  error?: NormalizedError;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AdapterError";
  }

  toNormalized(): NormalizedError {
    return {
      category: this.category,
      statusCode: this.statusCode,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
