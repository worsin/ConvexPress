/**
 * Compile-pressure adapter for the management boundary. The full legacy site
 * schema is already large enough to reach TypeScript's generic-instantiation
 * ceiling. Runtime validators and tests remain strict, while the small set of
 * database operations here use an intentionally narrow structural context.
 */
export interface ManagementQueryCtx {
  db: any;
}

export interface ManagementMutationCtx extends ManagementQueryCtx {}
