import type { Plugin } from "vite";

export type SiteEnvFormat = "url" | "path" | "hosts" | "text";

export interface SiteEnvRule {
  format: SiteEnvFormat;
  description?: string;
  oneOf?: string[];
  pattern?: string;
}

export interface SiteEnvSpec {
  build?: Record<string, SiteEnvRule>;
  start?: Record<string, SiteEnvRule>;
}

export const SITE_ENV_FILE: "site-env.json";
export function readSiteEnvSpec(appDir: string): SiteEnvSpec | null;
export function siteEnvProblems(spec: SiteEnvSpec | null, phase: "build" | "start", env: Record<string, string | undefined>): string[];
/** Vite's loadEnv, or anything that reads a mode's variables the same way. */
export type LoadEnv = (mode: string, envDir: string, prefixes?: string | string[]) => Record<string, string>;

export function requiredSiteEnv(options: { appDir: string; loadEnv: LoadEnv }): Plugin & {
  config(config: unknown, env: { command: "build" | "serve"; mode: string }): void;
};
