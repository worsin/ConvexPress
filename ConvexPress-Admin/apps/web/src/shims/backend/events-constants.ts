export const SYSTEM = {} as const;
export type SystemSlug = string;

export const POST_EVENTS: string[] = [];
export const PAGE_EVENTS: string[] = [];
export const MEDIA_EVENTS: string[] = [];
export const TAXONOMY_EVENTS: string[] = [];
export const COMMENT_EVENTS: string[] = [];
export const ROLE_EVENTS: string[] = [];
export const PROFILE_EVENTS: string[] = [];
export const AUTH_EVENTS: string[] = [];
export const PASSWORD_EVENTS: string[] = [];
export const REGISTRATION_EVENTS: string[] = [];
export const EDITOR_EVENTS: string[] = [];
export const CUSTOM_FIELD_EVENTS: string[] = [];
export const REVISION_EVENTS: string[] = [];
export const SEO_EVENTS: string[] = [];
export const SEARCH_EVENTS: string[] = [];
export const MENU_EVENTS: string[] = [];
export const SETTINGS_EVENTS: string[] = [];
export const EMAIL_EVENTS: string[] = [];
export const NOTIFICATION_EVENTS: string[] = [];
export const API_EVENTS: string[] = [];
export const EVENT_EVENTS: string[] = [];
export const ALL_EVENT_CODES: string[] = [];
export const EVENT_CODE_SET = new Set<string>();
export const EVENT_CODES_BY_SYSTEM: Record<string, string[]> = {};
export const WILDCARD_ALL = "*";
export const WILDCARD_SYSTEM_SUFFIX = ".*";
export const RETENTION: Record<string, number> = {};
export const LISTENER_DEFAULTS = {} as const;

export function isValidEventCode(value: string): boolean {
  return EVENT_CODE_SET.has(value);
}

export function isWildcard(value: string): boolean {
  return value === WILDCARD_ALL || value.endsWith(WILDCARD_SYSTEM_SUFFIX);
}

export function matchesEventCode(pattern: string, code: string): boolean {
  if (pattern === WILDCARD_ALL) return true;
  if (pattern.endsWith(WILDCARD_SYSTEM_SUFFIX)) {
    return code.startsWith(pattern.slice(0, -1));
  }
  return pattern === code;
}

export function getRetentionMs(system: string): number {
  return RETENTION[system] ?? 0;
}
