/**
 * Web-only Convex API shim.
 *
 * The generated Convex API type imports every backend function module. In this
 * repo that pulls large server-only validator unions into the web tsc pass and
 * hits TypeScript's instantiation-depth limit. The frontend already treats API
 * references as a runtime boundary in most routes, so keep web typechecking
 * focused on renderer code and validate backend functions with backend-specific
 * checks.
 */
export declare const api: any;
export declare const internal: any;
export declare const components: {};
