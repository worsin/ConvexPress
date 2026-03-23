/**
 * Audit Log System - Object Extractors
 *
 * Maps each event code to a function that extracts the objectId and
 * objectLabel from the event payload. These are used to populate the
 * object context fields on audit entries.
 *
 * Object extractors enable:
 *   - "Show history for this post" (query by_object index)
 *   - Clickable object labels in the audit log UI
 *   - Object-level filtering ("show all post changes")
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExtractedObject {
  objectId?: string;
  objectLabel?: string;
}

type ObjectExtractor = (payload: Record<string, unknown>) => ExtractedObject;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Safely convert a value to a string for objectId. */
function toStr(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  return String(val);
}

// ─── Extractors ─────────────────────────────────────────────────────────────

/** Post events: objectId = postId, objectLabel = title */
const postExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.postId),
  objectLabel: toStr(p.title),
});

/** Page events: objectId = pageId, objectLabel = title */
const pageExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.pageId),
  objectLabel: toStr(p.title),
});

/** Comment events: objectId = commentId, objectLabel = postTitle */
const commentExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.commentId),
  objectLabel: toStr(p.postTitle),
});

/** Media events: objectId = mediaId, objectLabel = fileName */
const mediaExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.mediaId),
  objectLabel: toStr(p.fileName),
});

/** Auth events: objectId = userId, objectLabel = email */
const authExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.userId),
  objectLabel: toStr(p.email),
});

/** Registration events: objectId = userId, objectLabel = email */
const registrationExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.userId),
  objectLabel: toStr(p.email),
});

/** Profile events: objectId = userId, objectLabel = email or targetName */
const profileExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.userId ?? p.targetUserId),
  objectLabel: toStr(p.email ?? p.targetName),
});

/** Role events: objectId = roleId, objectLabel = role name */
const roleExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.roleId),
  objectLabel: toStr(p.name ?? p.roleName),
});

/** Role assignment: objectId = targetUserId, objectLabel = transition */
const roleAssignedExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.targetUserId ?? p.userId),
  objectLabel: p.roleName
    ? `${p.targetEmail ?? p.targetName ?? "user"} -> ${p.roleName}`
    : toStr(p.targetEmail ?? p.targetName),
});

/** Password events: objectId = userId, objectLabel = email */
const passwordExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.userId),
  objectLabel: toStr(p.email),
});

/** Taxonomy events: objectId = termId, objectLabel = name */
const taxonomyExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.termId ?? p.categoryId ?? p.tagId),
  objectLabel: toStr(p.name ?? p.termName),
});

/** Menu events: objectId = menuId, objectLabel = name */
const menuExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.menuId),
  objectLabel: toStr(p.name),
});

/** Settings events: objectLabel = section name */
const settingsExtractor: ObjectExtractor = (p) => ({
  objectId: undefined,
  objectLabel: toStr(p.section),
});

/** SEO events: objectId = postId or url, objectLabel = title or url */
const seoExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.postId),
  objectLabel: toStr(p.title ?? p.url),
});

/** API events: objectId = keyId or endpointId */
const apiExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.keyId ?? p.endpointId ?? p.webhookId),
  objectLabel: toStr(p.name ?? p.url),
});

/** Notification events: objectLabel = subject or type */
const notificationExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.notificationId),
  objectLabel: toStr(p.subject ?? p.type ?? p.title),
});

/** Revision events: objectId = postId, objectLabel = revision info */
const revisionExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.postId ?? p.revisionId),
  objectLabel: toStr(p.postTitle ?? p.title),
});

/** Custom field events: objectId = groupId or fieldId, objectLabel = name */
const customFieldExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.groupId ?? p.fieldId),
  objectLabel: toStr(p.name ?? p.fieldName),
});

/** Editor events: objectId = postId, objectLabel = title */
const editorExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.postId),
  objectLabel: toStr(p.title),
});

/** Email events: objectLabel = subject */
const emailExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.emailId),
  objectLabel: toStr(p.subject),
});

/** Search events: no specific object */
const searchExtractor: ObjectExtractor = (p) => ({
  objectId: undefined,
  objectLabel: p.indexedCount ? `${p.indexedCount} records` : undefined,
});

/** Event system events: objectId = listenerId, objectLabel = listener name */
const eventSystemExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.listenerId),
  objectLabel: toStr(p.listenerName ?? p.eventCode),
});

/** Audit system self-events: objectLabel = summary */
const auditExtractor: ObjectExtractor = (p) => ({
  objectId: undefined,
  objectLabel: p.mode
    ? `mode: ${p.mode}, count: ${p.count ?? 0}`
    : p.format
      ? `${p.recordCount ?? 0} records as ${p.format}`
      : undefined,
});

/** Default extractor: tries common field names */
const defaultExtractor: ObjectExtractor = (p) => ({
  objectId: toStr(p.id ?? p.objectId),
  objectLabel: toStr(p.name ?? p.title ?? p.label),
});

// ─── Event Code to Extractor Map ────────────────────────────────────────────

/**
 * Maps event code prefixes (systems) to their object extractor.
 * Individual event codes can override the system-level extractor.
 */
const EXTRACTOR_OVERRIDES: Record<string, ObjectExtractor> = {
  "role.assigned": roleAssignedExtractor,
};

const SYSTEM_EXTRACTORS: Record<string, ObjectExtractor> = {
  post: postExtractor,
  page: pageExtractor,
  comment: commentExtractor,
  media: mediaExtractor,
  auth: authExtractor,
  registration: registrationExtractor,
  profile: profileExtractor,
  role: roleExtractor,
  password: passwordExtractor,
  taxonomy: taxonomyExtractor,
  menu: menuExtractor,
  settings: settingsExtractor,
  seo: seoExtractor,
  api: apiExtractor,
  notification: notificationExtractor,
  revision: revisionExtractor,
  custom_field: customFieldExtractor,
  editor: editorExtractor,
  email: emailExtractor,
  search: searchExtractor,
  event: eventSystemExtractor,
  audit: auditExtractor,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract object ID and label from an event's payload.
 *
 * Resolution order:
 *   1. Check EXTRACTOR_OVERRIDES for exact event code match
 *   2. Check SYSTEM_EXTRACTORS for the event's system prefix
 *   3. Fall back to defaultExtractor
 *
 * @param eventCode - The event code (e.g., "post.published")
 * @param payload - The parsed event payload
 * @returns Object with optional objectId and objectLabel
 */
export function extractObject(
  eventCode: string,
  payload: Record<string, unknown>,
): ExtractedObject {
  // Check for exact event code override
  const override = EXTRACTOR_OVERRIDES[eventCode];
  if (override) {
    try {
      return override(payload);
    } catch {
      return {};
    }
  }

  // Extract system from event code
  const dotIndex = eventCode.indexOf(".");
  const system = dotIndex > 0 ? eventCode.slice(0, dotIndex) : eventCode;

  // Check for system-level extractor
  const systemExtractor = SYSTEM_EXTRACTORS[system];
  if (systemExtractor) {
    try {
      return systemExtractor(payload);
    } catch {
      return {};
    }
  }

  // Fall back to default
  try {
    return defaultExtractor(payload);
  } catch {
    return {};
  }
}
