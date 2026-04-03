/**
 * KB System Integration Reference
 *
 * This file documents all cross-system integration points for the Knowledge
 * Base system. It is a reference/seed file — NOT runtime code that runs on
 * every request.
 *
 * Capabilities to seed in Role & Capability System:
 * - kb.view               — Read published articles and categories
 * - kb.create             — Create new articles
 * - kb.edit               — Edit any article
 * - kb.editOwn            — Edit own articles only
 * - kb.delete             — Archive and permanently delete articles
 * - kb.publish            — Publish, unpublish, and feature articles
 * - kb.manageCategories   — Create, update, and delete KB categories
 * - kb.manageTags         — Create, update, and delete KB tags
 * - kb.manageCollections  — Create, update, and manage KB collections
 * - kb.manageWorkflows    — Create and manage editorial workflows
 * - kb.manageTemplates    — Create and manage article templates
 * - kb.moderateComments   — Approve, reject, and delete KB article comments
 * - kb.viewAnalytics      — Access KB analytics dashboard and reports
 *
 * Events emitted (defined in events/constants.ts as KB_EVENTS):
 * - kb.article_created    — Fired when a new article is created
 * - kb.article_published  — Fired when an article is published (or scheduled)
 * - kb.article_updated    — Fired when an article's content or metadata changes
 * - kb.article_archived   — Fired when an article is archived
 * - kb.comment_created    — Fired when a comment is posted on an article
 * - kb.feedback_submitted — Fired when helpful/rating feedback is submitted
 *
 * Email templates needed (seed in Email Notification System):
 * - kb_workflow_step_ready  — Notify reviewer that a workflow step is ready for review
 * - kb_workflow_approved    — Notify author that their article was approved in the workflow
 * - kb_workflow_rejected    — Notify author that their article was rejected with a reason
 * - kb_comment_notification — Notify article author or moderators of a new comment
 *
 * Audit actions logged (via existing auditLogs/internals.ts):
 * - kb.article.create     — Article created
 * - kb.article.update     — Article content or metadata updated
 * - kb.article.publish    — Article published
 * - kb.article.archive    — Article archived
 * - kb.article.delete     — Article permanently deleted
 * - kb.category.create    — KB category created
 * - kb.category.update    — KB category updated
 * - kb.category.delete    — KB category deleted
 * - kb.tag.create         — KB tag created
 * - kb.tag.delete         — KB tag deleted
 * - kb.collection.create  — KB collection created
 * - kb.collection.update  — KB collection updated
 * - kb.template.create    — Article template created
 * - kb.template.update    — Article template updated
 * - kb.workflow.create    — Editorial workflow created
 * - kb.workflow.update    — Editorial workflow updated
 */

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const KB_CAPABILITIES = [
  { slug: "kb.view",               label: "View KB Articles",        description: "Read published articles, categories, and tags" },
  { slug: "kb.create",             label: "Create KB Articles",      description: "Create new knowledge base articles" },
  { slug: "kb.edit",               label: "Edit Any KB Article",     description: "Edit any knowledge base article regardless of authorship" },
  { slug: "kb.editOwn",            label: "Edit Own KB Articles",    description: "Edit only articles authored by the current user" },
  { slug: "kb.delete",             label: "Delete KB Articles",      description: "Archive and permanently delete knowledge base articles" },
  { slug: "kb.publish",            label: "Publish KB Articles",     description: "Publish, unpublish, schedule, and feature articles" },
  { slug: "kb.manageCategories",   label: "Manage KB Categories",    description: "Create, update, and delete knowledge base categories" },
  { slug: "kb.manageTags",         label: "Manage KB Tags",          description: "Create, update, and delete knowledge base tags" },
  { slug: "kb.manageCollections",  label: "Manage KB Collections",   description: "Create, update, and manage article collections" },
  { slug: "kb.manageWorkflows",    label: "Manage KB Workflows",     description: "Create and manage editorial review workflows" },
  { slug: "kb.manageTemplates",    label: "Manage KB Templates",     description: "Create and manage article content templates" },
  { slug: "kb.moderateComments",   label: "Moderate KB Comments",    description: "Approve, reject, and delete article comments" },
  { slug: "kb.viewAnalytics",      label: "View KB Analytics",       description: "Access KB analytics dashboard and search reports" },
] as const;

// ─── Email Templates ──────────────────────────────────────────────────────────

export const KB_EMAIL_TEMPLATES = [
  {
    slug: "kb_workflow_step_ready",
    subject: "Action required: Article ready for your review",
    description: "Sent to a reviewer when a KB article workflow step reaches them",
    variables: ["reviewerName", "articleTitle", "articleUrl", "stepName", "authorName"],
  },
  {
    slug: "kb_workflow_approved",
    subject: "Your article has been approved",
    description: "Sent to the article author when a workflow step is approved",
    variables: ["authorName", "articleTitle", "articleUrl", "reviewerName", "nextStep"],
  },
  {
    slug: "kb_workflow_rejected",
    subject: "Your article needs revisions",
    description: "Sent to the article author when a workflow step is rejected",
    variables: ["authorName", "articleTitle", "articleUrl", "reviewerName", "rejectionReason"],
  },
  {
    slug: "kb_comment_notification",
    subject: "New comment on: {{articleTitle}}",
    description: "Sent to the article author or moderators when a comment is posted",
    variables: ["recipientName", "articleTitle", "articleUrl", "commentAuthor", "commentExcerpt"],
  },
] as const;

// ─── Audit Actions ────────────────────────────────────────────────────────────

export const KB_AUDIT_ACTIONS = [
  "kb.article.create",
  "kb.article.update",
  "kb.article.publish",
  "kb.article.archive",
  "kb.article.delete",
  "kb.category.create",
  "kb.category.update",
  "kb.category.delete",
  "kb.tag.create",
  "kb.tag.delete",
  "kb.collection.create",
  "kb.collection.update",
  "kb.template.create",
  "kb.template.update",
  "kb.workflow.create",
  "kb.workflow.update",
] as const;
