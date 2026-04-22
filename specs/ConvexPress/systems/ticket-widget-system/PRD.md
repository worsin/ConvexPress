# PRD: Ticket Widget System

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard. Customer-facing widget serves `Subscriber` + guests.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/ticket-widget-system/PRD.md`
> **Airtable Record:** `recmtwJdC2Qy8cbY2`
> **Expert:** `/experts:ticket-widget-system` (may consolidate under `/experts:support-system`)
> **Status:** Shipped ~72%. Widget UI + ticket-creation flow + KB-search deflection live. Live chat + proactive-messaging polish Wave 11.

---

## Integration with ConvexPress

**Positioning:** customer-facing front-end for the `tickets` extension; lives on the website.
**Code lives at:**
- Backend: shared with `tickets` system.
- Website: `ConvexPress-Website/apps/web/src/components/support/TicketWidget.tsx` + related components.
- Widget entry: `<TicketWidget />` mounted in `_marketing.tsx` layout (show/hide by settings).

**Consumes these ConvexPress systems:**

- **Ticket Lifecycle System** — creates tickets + threads messages.
- **Support Deflection System** — runs article suggestion before ticket create.
- **KB Article System** — article links in deflection results open in a drawer.
- **Users + Customer System** — authenticated customers attach to `users._id`; guests submit with email.
- **Authentication (Clerk)** — widget detects auth state to skip email entry for logged-in customers.
- **Event Dispatcher** — emits `widget.opened / closed / ticket_started / submitted / live_chat_started`.

**SaaS analog:** Intercom Messenger / HelpScout Beacon / Crisp chat widget — floating bubble with search + ticket form + live chat.

---

## 1. Overview

### 1.1 Purpose

The floating support bubble + expanded panel that customers click to
search the KB, start a ticket, or chat live with an agent. First line
of defense — most support interactions happen here.

### 1.2 Scope

**In Scope:**
- Floating launcher bubble (position configurable via Settings).
- Expanded panel with three tabs: Home / Messages / Help.
- KB article search inside the Help tab.
- Ticket creation form (subject, message, optional attachment).
- Authenticated + guest flows (guest requires email).
- Deflection step — before submitting a ticket, show KB matches.
- Past-messages view for logged-in customers (their own tickets).
- Widget state persistence (collapsed / expanded).
- Unread-message badge on launcher.
- **Wave 11:** Live chat via Convex reactivity (agent presence + real-time message push).
- **Wave 11:** Proactive messages — trigger-based greetings ("Offer help on the checkout page").
- **Wave 11:** File upload (direct to Convex Storage).
- **Wave 11:** Custom fields on the contact form (name, order number, category).
- **Wave 11:** Widget theming (brand color, position, greeting text) via Settings UI.

**Out of Scope:**
- Ticket CRUD → `ticket-lifecycle-system`.
- Agent-side reply UI → `ticket-agent-tools`.
- Deflection matching logic → `support-deflection-system`.
- Analytics → `support-analytics-system`.

---

## 2. Data Model

### 2.1 Wave 11

```ts
// Settings: commerce.support.widget (or integrations.widget)
{
  widgetEnabled: boolean,
  widgetPosition: "bottom-right" | "bottom-left",
  widgetBrandColorHex: string,
  widgetGreeting: string,
  widgetShowOnRoutes: string[],   // ["*"] or specific globs
  widgetHideFromRoles: string[],  // e.g., ["administrator"]
  proactiveRules: Array<{
    trigger: "time_on_page" | "exit_intent" | "error_detected",
    threshold: number,
    message: string,
    routeGlob: string,
  }>,
}

// NEW chat session table:
tickets_chat_sessions: defineTable({
  ticketId: v.id("tickets_tickets"),
  customerUserId: v.optional(v.id("users")),
  guestEmail: v.optional(v.string()),
  agentId: v.optional(v.id("users")),
  status: v.union(
    v.literal("open"),
    v.literal("agent_assigned"),
    v.literal("closed"),
  ),
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
})
  .index("by_ticket", ["ticketId"])
  .index("by_status", ["status"]);
```

---

## 3. Functions

### 3.1 Exists
- Shared with Ticket Lifecycle.

### 3.2 Wave 11
- `tickets.widget.queries.getConfig` — returns widget theming from Settings (public query).
- `tickets.widget.mutations.startChat(subject, message, email?)` — creates ticket + opens chat session.
- `tickets.widget.mutations.endChat(sessionId)`.
- `tickets.widget.queries.listProactiveRules(routePath)` — for the current page.
- `tickets.widget.actions.uploadAttachment` — `_storage` upload.

---

## 4. Website UI

### 4.1 Exists
- Launcher bubble + expanded panel
- Home/Messages/Help tab structure
- KB search
- Ticket form
- Past messages for authenticated users

### 4.2 Wave 11
- Live-chat tab with real-time message flow
- Proactive-message toasts
- File-upload in the ticket form
- Custom fields configured per site
- Dark-mode variant

### 4.3 Admin UI for widget config
- `/admin/support/widget` — theming + position + proactive rules + visibility rules

---

## 5. Events

- `widget.opened / closed`
- `widget.kb_searched / article_clicked`
- `widget.ticket_started / submitted`
- `widget.live_chat_started / live_chat_ended`
- `widget.proactive_triggered / dismissed`
- `widget.file_uploaded`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Launcher bubble mounted on marketing pages
- [x] Three-tab panel
- [x] KB search + deflection
- [x] Ticket form (auth + guest)
- [x] Past-messages view for auth users
- [x] Unread badge

### 6.2 Wave 11
- [ ] Live chat with real-time message flow via Convex reactivity
- [ ] Agent-assignment indicator (customer sees "Alice is helping")
- [ ] Proactive rules engine + dismissable toast
- [ ] File upload
- [ ] Custom-fields-per-site configuration
- [ ] Widget theming settings UI
- [ ] Dark-mode styling

---

## 7. References

- Code: `convex/tickets/*` (shared); `convex/support/widget.ts`
- Website UI: `ConvexPress-Website/apps/web/src/components/support/`
- Sibling PRDs: `ticket-lifecycle-system`, `ticket-agent-tools`, `support-deflection-system`, `support-analytics-system`, `support-integration-system`, `kb-article-system`, `kb-search-and-analytics`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recmtwJdC2Qy8cbY2`
