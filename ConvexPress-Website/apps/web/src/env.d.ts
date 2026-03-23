/// <reference types="vite/client" />

/**
 * Type declarations for environment variables.
 * All VITE_ prefixed variables are exposed to client-side code.
 */
interface ImportMetaEnv {
  /** Convex deployment URL (required) */
  readonly VITE_CONVEX_URL: string;
  /** Admin app URL for "Edit in Admin" links */
  readonly VITE_ADMIN_APP_URL?: string;
  /** Meilisearch host URL for search functionality */
  readonly VITE_MEILISEARCH_HOST?: string;
  /** Meilisearch search-only API key (safe to expose) */
  readonly VITE_MEILISEARCH_KEY?: string;
  /** Public URL of this app */
  readonly VITE_APP_URL?: string;
  /** Comma-separated list of allowed redirect hosts */
  readonly VITE_ALLOWED_REDIRECT_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
