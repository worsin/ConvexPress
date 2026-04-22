# PRD: Support Integration System

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/support-integration-system/PRD.md`
> **Airtable Record:** `recUwSvmOCTneKU1H`
> **Expert:** `/experts:support-integration-system` (may consolidate under `/experts:support-system`)
> **Status:** Scaffolded ~10%. This system handles **inbound channels** — the pipes that feed tickets into the Ticket Lifecycle System. Most code lives as integration modules, not end-to-end channel adapters yet.

---

## Integration with ConvexPress

**Positioning:** part of the `tickets` extension; specifically the inbound-channel adapter layer.
**Extension gate:** `tickets.channelsEnabled` (coarse) + per-channel toggles (`inboundEmailEnabled`, `slackEnabled`, etc.).
**Code lives at:** `convex/support/integration.ts` (KB ↔ ticket bridge for deflection) + `convex/tickets/integration.ts` (documentation-only reference today) + future channel adapters.

**Consumes these ConvexPress systems:**

- **Ticket Lifecycle System** — creates `tickets_tickets` via `tickets.create({ source: "email" | "slack" | "form" | "chat" | "api" })`.
- **Email Notification System** — outbound replies to ticketing use the email queue; inbound email is handled via webhook (this system).
- **HTTP Routes** — each channel gets a dedicated endpoint under `/webhooks/<channel>`.
- **Settings System** — stores per-channel credentials + signing secrets via `helpers/serviceKeys.ts`.
- **Event Dispatcher** — emits `ticket.inbound_received_from_<channel>`.
- **Audit Log** — every inbound event logged.
- **Users + Customer System** — inbound email matches against `users.email`; unknown senders create a guest `tickets_tickets` record.

**SaaS analog:** HelpScout Mailbox (inbound email), Intercom Channels, Zendesk Triggers. We provide the same "email comes in → ticket appears" pipe.

---

## 1. Overview

### 1.1 Purpose

Pull inbound customer contact from every channel into the unified
Ticket Lifecycle. The current code has documentation-only reference
files; Wave 11 builds the real channel adapters.

### 1.2 Scope

**In Scope (Wave 11):**
- **Inbound email adapter** — Postmark or Mailgun or SendGrid inbound-parse webhook → `/webhooks/inbound-email` httpAction → `tickets.create({ source: "email", rawEmail })`.
- **Slack integration** — OAuth install flow; channel messages tagged with a keyword create tickets; support team replies in-thread.
- **Discord integration** — same shape as Slack (webhooks in, webhooks out).
- **Twilio SMS integration** — inbound SMS → ticket; outbound reply via Messages API.
- **Form integration** — public contact form on the website posts to `/api/support/contact` → `tickets.create({ source: "form" })`.
- **Chat bridge** — connect the Ticket Widget's live chat to the same ticket record (widget → chat session → ticket conversion).
- Per-channel parsing: attachments, threading by Message-ID / thread_ts, reply detection.
- Per-channel settings UI with credential input + webhook URL display.
- Channel-health checks (last inbound timestamp per channel; alert on silence).

**Out of Scope:**
- Ticket lifecycle + assignment → `ticket-lifecycle-system`.
- Agent-side tools → `ticket-agent-tools`.
- Widget UX → `ticket-widget-system`.
- KB-based auto-reply → `support-deflection-system`.

---

## 2. Data Model

### 2.1 NEW for Wave 11

```ts
support_channels: defineTable({
  code: v.string(),                  // "inbound_email_postmark", "slack_workspace_xyz"
  kind: v.union(
    v.literal("email"),
    v.literal("slack"),
    v.literal("discord"),
    v.literal("twilio_sms"),
    v.literal("form"),
    v.literal("chat"),
    v.literal("api"),
  ),
  label: v.string(),
  isActive: v.boolean(),
  config: v.any(),                   // per-kind credential blob (encrypted)
  webhookUrl: v.optional(v.string()),
  lastInboundAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_code", ["code"]).index("by_kind", ["kind"]);

support_inbound_events: defineTable({
  channelId: v.id("support_channels"),
  externalId: v.string(),            // provider's message/thread ID (idempotency)
  rawPayload: v.string(),
  parsedPayload: v.optional(v.any()),
  ticketId: v.optional(v.id("tickets_tickets")),
  status: v.union(
    v.literal("received"),
    v.literal("parsed"),
    v.literal("ticket_created"),
    v.literal("ticket_updated"),
    v.literal("error"),
  ),
  errorMessage: v.optional(v.string()),
  receivedAt: v.number(),
})
  .index("by_channel_external_id", ["channelId", "externalId"])
  .index("by_ticket", ["ticketId"])
  .index("by_status", ["status"]);
```

---

## 3. Functions

### 3.1 Wave 11 new

- `support.integration.actions.handleInboundEmail(channelCode, payload)` — Node action (parses raw email, resolves user by From, upserts ticket).
- `support.integration.actions.handleSlackEvent(channelCode, payload)`.
- `support.integration.actions.handleDiscordEvent`.
- `support.integration.actions.handleTwilioSms`.
- `support.integration.mutations.handleFormSubmit`.
- `support.channels.mutations.create / update / toggleActive / delete`
- `support.channels.queries.list / getByCode / healthReport` — which channels are silent?
- `/webhooks/inbound-email`, `/webhooks/slack`, `/webhooks/discord`, `/webhooks/twilio-sms` — new HTTP routes in `http.ts`.

---

## 4. Admin UI

### 4.1 Wave 11

- `/admin/support/channels` — list + per-kind add flow
- Connect-Slack button launches OAuth flow and persists workspace credentials
- Channel-health indicator (green / silent / error)
- Webhook-URL copy-to-clipboard helper per channel
- Signing-secret management with rotate button

---

## 5. Events

- `ticket.inbound_received_from_email / slack / discord / twilio / form / chat`
- `support.channel_health_alert` — fires when a channel is silent > N hours

---

## 6. Acceptance criteria

### 6.1 Wave 11 new
- [ ] Inbound email webhook end-to-end: send test email to channel address → ticket created.
- [ ] Slack reply flow: support team reply in thread appears as ticket message.
- [ ] Form submission creates ticket.
- [ ] Twilio SMS: test number → ticket; outbound reply sends SMS back.
- [ ] Channel-health cron runs + alerts on silence.
- [ ] Per-channel idempotency (re-delivered webhook does not create duplicate ticket).
- [ ] Settings UI for each channel with secret rotation.

---

## 7. Definition of Done

1. All §6.1 boxes ticked.
2. One real production channel (inbound email via Postmark) running for 7 days with zero dropped messages.
3. Signed-secret verification on every webhook.
4. Rate-limit protection on each webhook endpoint via the existing `tickets/rateLimit.ts` helpers.

---

## 8. References

- Code: `convex/support/integration.ts` (current — KB↔ticket bridge), `convex/tickets/integration.ts` (reference)
- Sibling PRDs: `ticket-lifecycle-system`, `ticket-agent-tools`, `ticket-widget-system`, `support-deflection-system`, `email-notification-system`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recUwSvmOCTneKU1H`
