# PRD Template - Shopping Cart

> **Instructions:** Copy this template when creating a PRD for any system.
> Replace `[SYSTEM_NAME]` and fill in all sections based on Airtable data and the Action Plan.

---

# PRD: [SYSTEM_NAME]

> **System Code:** [CODE]
> **Phase:** [X] of 6
> **Priority:** [P0/P1/P2]
> **Complexity:** [Simple/Medium/Complex/Epic]

---

## 1. Overview

### 1.1 Purpose
[One paragraph describing what this system does and why it exists]

### 1.2 Scope
[Bullet list of what's IN scope for this PRD]

### 1.3 Out of Scope
[Bullet list of what's explicitly NOT in this PRD]

---

## 2. Dependencies

### 2.1 Required Before This System
| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| [Name] | [Code] | [X] | [Explanation] |

### 2.2 Systems That Depend on This
| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| [Name] | [Code] | [X] | [What they need from this system] |

### 2.3 Integration Hooks to Implement
[List specific hooks, events, or APIs this system must expose for future systems]

---

## 3. Routes

> Source: Airtable Routes table

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| [Name] | [/path] | [Layout] | [Yes/No] | [Roles] |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| [Name] | [/admin/path] | _admin | Yes | [Roles] |

---

## 4. Data Model

### 4.1 Tables

```typescript
// Convex schema definition
[tableName]: defineTable({
  // Fields with types and descriptions
  field: v.string(), // Description
})
  .index("by_field", ["field"]) // Index for querying
```

### 4.2 Relationships
[Describe how this table relates to others]

### 4.3 Forward-Looking Fields
[Fields added now for future system integration]

| Field | Future System | Purpose |
|-------|---------------|---------|
| [field] | [System Name] | [Why it's included now] |

---

## 5. Actions

> Source: Airtable Actions table

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| [Name] | [action.code] | [Description] | [Roles] |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| [Name] | [action.code] | [Description] | [Roles] |

---

## 6. Events

> Source: Airtable Events table

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| [Name] | [event.code] | [When triggered] | `{ field: type }` |

### 6.2 Events Consumed
[Events from other systems this system listens to]

| Event | Source System | Handler |
|-------|---------------|---------|
| [event.code] | [System] | [What happens] |

---

## 7. Notifications

### 7.1 Email Notifications

> Source: Airtable Email Notifications table

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| [Name] | [event.code] | [customer/admin/staff] | `{{var1}}, {{var2}}` |

### 7.2 Site Notifications

> Source: Airtable Site Notifications table

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| [Name] | [event.code] | [user type] | [Template] |

---

## 8. User Interface

### 8.1 Components Needed
[List of UI components to build]

- [ ] Component 1 - Description
- [ ] Component 2 - Description

### 8.2 Wireframes
[Link to Figma/sketches or describe layouts]

### 8.3 States
[Loading, empty, error, success states to handle]

---

## 9. Business Rules

### 9.1 Validation Rules
[Data validation requirements]

### 9.2 Business Logic
[Core business rules and conditions]

### 9.3 Edge Cases
[Special cases to handle]

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Query name and signature
export const queryName = query({
  args: { /* args */ },
  handler: async (ctx, args) => { /* returns */ },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Mutation name and signature
export const mutationName = mutation({
  args: { /* args */ },
  handler: async (ctx, args) => { /* returns */ },
});
```

### 10.3 Actions (External/Async Operations)

```typescript
// Action name and signature
export const actionName = action({
  args: { /* args */ },
  handler: async (ctx, args) => { /* returns */ },
});
```

---

## 11. Security Considerations

### 11.1 Authentication Requirements
[Who can access what]

### 11.2 Authorization Rules
[Permission checks needed]

### 11.3 Data Privacy
[Sensitive data handling, GDPR considerations]

---

## 12. Testing Strategy

### 12.1 Unit Tests
[Key functions to test]

### 12.2 Integration Tests
[Cross-system tests needed]

### 12.3 E2E Tests
[User flow tests]

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition
- [ ] Basic CRUD mutations
- [ ] Queries with indexes

### Phase 2: Core Features
- [ ] Routes created
- [ ] UI components built
- [ ] Actions implemented

### Phase 3: Integration
- [ ] Events emitted
- [ ] Notifications wired
- [ ] Integration hooks exposed

### Phase 4: Polish
- [ ] Error handling
- [ ] Loading states
- [ ] Edge cases handled

---

## 14. Future Considerations

[What might change or expand in this system later]

---

## Appendix

### A. Airtable Record IDs
[For reference when syncing]

| Entity | Record ID |
|--------|-----------|
| System | [recXXX] |
| Routes | [recXXX, recXXX] |
| Actions | [recXXX, recXXX] |
| Events | [recXXX, recXXX] |

### B. Related Documentation
- [Action Plan](./ACTION-PLAN.md)
- [Tech Stack](../.claude/CLAUDE.md)

---

**PRD Version:** 1.0
**Created:** [Date]
**Last Updated:** [Date]
**Author:** [Name]
