# Admin Settings & Forms UI - Expert Knowledge Document

**System:** Admin Settings & Forms UI
**Status:** Implementation Ready
**Priority:** P1 - High
**WordPress Equivalent:** Settings > General, Settings > Reading, Settings > Writing, Settings > Discussion, Settings > Permalinks, Settings > Privacy, plus the underlying Settings API form rendering (`do_settings_sections()`, `add_settings_field()`, WordPress settings form layout patterns)
**Last Analyzed:** 2026-02-09
**Expert Type:** Admin UI Expert

---

## Quick Reference

### What This Expert Covers

The Admin Settings & Forms UI Expert owns the **shared layout, component library, and form patterns** used across all admin settings pages. This is not a backend system -- it is a **frontend UI pattern expert** that defines how settings are displayed, edited, validated, and saved. It covers the reusable page layout (`SettingsPageLayout`), form section grouping (`SettingsSection`), individual field components (`TextField`, `TextareaField`, `SelectField`, `RadioGroupField`, `CheckboxField`, `ToggleField`, `NumberField`), the unified save mechanism (`SaveButton` with dirty state detection), and shared form hooks (`useSettingsForm`).

This expert does NOT own:
- The Convex mutations/queries (owned by Settings System Expert)
- The admin sidebar navigation (owned by Admin Shell & Navigation UI Expert)
- The SEO, Sitemap, Email, or API settings pages (owned by their respective system experts, but they USE the components defined here)
- Any Convex schema, validation, or event definitions

### Key Concepts

| Concept | Description |
|---------|-------------|
| **SettingsPageLayout** | Top-level wrapper for every settings page: page title, optional description, form sections, and a sticky Save Changes button |
| **SettingsSection** | A visual grouping of related fields with a header, optional description, and a bordered card container |
| **SettingsField** | A single form field with label, description/help text, error message, and the input itself |
| **Dirty State Detection** | Tracks which fields have been modified from their initial (loaded) values. Enables/disables Save button. Triggers navigation guard. |
| **Navigation Guard** | Prevents users from navigating away with unsaved changes. Uses TanStack Router `beforeLoad`/`useBlocker`. |
| **Field Dependencies** | Some fields are only visible/editable when a parent field has a specific value (e.g., thread depth only editable when threaded comments enabled) |
| **Inline Validation** | Per-field validation errors shown beneath the field. Powered by TanStack Form + Zod. |
| **Live Preview** | Some fields show a real-time preview of their effect (e.g., date/time format preview in General Settings) |
| **Optimistic Updates** | Form does not flash or reset on save. Convex optimistic updates ensure immediate feedback. |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Form rendering** | PHP: `do_settings_sections()` + `add_settings_field()` registered dynamically | React components: `SettingsPageLayout` + `SettingsSection` + typed field components |
| **Validation** | Server-side only via `sanitize_callback`, no inline errors | Client-side Zod + TanStack Form with inline errors, plus server-side Convex validation |
| **Save mechanism** | HTML form POST to `options.php` with nonce | Convex mutation via `useMutation` with optimistic updates |
| **Dirty tracking** | None (always shows "Save Changes") | Field-level dirty tracking. Save button disabled when clean. |
| **Navigation guard** | None | TanStack Router `useBlocker` with confirmation dialog |
| **Reactivity** | Full page reload after save | Convex reactive subscriptions push changes to form |
| **Field layout** | `<th><label>` + `<td><input>` table layout | Flexbox/grid layout with `SettingsField` component |
| **Conditional fields** | jQuery show/hide | React state + animated expand/collapse |
| **Toast feedback** | Admin notice banners after redirect | Sonner toast notifications (success/error) |
| **Component library** | WordPress core HTML + jQuery | Base UI (`@base-ui/react`) + Tailwind CSS v4 |

---

## Architecture Overview

### Form Submission Lifecycle

```
User opens settings page (e.g., /admin/settings/general)
  -> Route component renders
  -> useSettingsForm(section) hook:
     1. Calls useQuery(api.settings.getBySection, { section })
     2. Initializes TanStack Form with loaded values (or defaults)
     3. Returns form instance, isDirty, isSubmitting, handleSave
  -> SettingsPageLayout renders:
     - Page title ("General Settings")
     - SettingsSection blocks with SettingsField components
     - SaveButton (disabled when !isDirty or isSubmitting)
  -> User edits fields
     - TanStack Form tracks field values
     - isDirty computed by comparing current vs initial values
     - Inline validation runs on blur (Zod schema per section)
  -> User clicks "Save Changes"
     1. TanStack Form validates all fields against section Zod schema
     2. If validation fails: inline errors shown, toast: "Please fix errors before saving"
     3. If validation passes:
        a. Call Convex mutation: settings.updateSection({ section, values })
        b. Show loading state on SaveButton
        c. On success: toast("Settings saved."), reset dirty state
        d. On error: toast.error("Failed to save settings."), keep form values
  -> Convex reactive subscription updates form if another admin saves
     - If user has unsaved changes: toast("Settings were updated by another administrator.")
     - If user has no unsaved changes: form silently updates
```

### Data Flow

```
Convex Database (settings table)
  |
  v
useQuery(api.settings.getBySection, { section }) -- reactive subscription
  |
  v
useSettingsForm(section) hook
  |-- Merges server values with defaults
  |-- Creates TanStack Form instance
  |-- Tracks dirty state
  |-- Provides handleSave function
  |
  v
SettingsPageLayout
  |-- SettingsSection (visual grouping)
  |   |-- SettingsField (label + input + error)
  |   |   |-- TextField / SelectField / CheckboxField / etc.
  |   |
  |   |-- SettingsField
  |   |   |-- NumberField (with dependent visibility)
  |   |
  |-- SettingsSection
  |   |-- ...
  |
  |-- SaveButton (isDirty, isSubmitting)
```

### Validation Pipeline

```
Client-Side (TanStack Form + Zod)
  |
  |-- Per-field onBlur validation (immediate feedback)
  |-- Per-section onSubmit validation (all fields at once)
  |
  v
Server-Side (Convex mutation handler)
  |
  |-- Section-level typed validator
  |-- Cross-field validation (e.g., postsPageId != homepageId)
  |-- Reference validation (page IDs, category IDs exist)
  |
  v
Success: Write to DB, emit event
Error: Return validation error to client
```

---

## TypeScript Types

### Settings Page Configuration

```typescript
// ConvexPress-Admin/apps/web/src/types/settings.ts

/** Identifies a settings section */
export type SettingsSection =
  | "general"
  | "reading"
  | "writing"
  | "discussion"
  | "permalinks"
  | "privacy";

/** Extended sections for non-core settings pages that reuse the same layout */
export type ExtendedSettingsSection =
  | SettingsSection
  | "seo"
  | "sitemap"
  | "email"
  | "api";

/** Configuration for a settings page */
export interface SettingsPageConfig {
  /** The section key (matches Convex settings section) */
  section: SettingsSection;
  /** Page title displayed at the top */
  title: string;
  /** Optional page-level description */
  description?: string;
  /** The Zod schema for client-side validation */
  validationSchema: z.ZodObject<any>;
}

/** Configuration for a settings section (visual grouping within a page) */
export interface SettingsSectionConfig {
  /** Unique key for the section */
  id: string;
  /** Section header text */
  title: string;
  /** Optional description below the header */
  description?: string;
  /** Whether the section is collapsible (default: false) */
  collapsible?: boolean;
  /** Whether the section starts collapsed (default: false) */
  defaultCollapsed?: boolean;
}

/** Configuration for a single settings field */
export interface SettingsFieldConfig {
  /** Field name (must match the key in the settings values object) */
  name: string;
  /** Label displayed next to the field */
  label: string;
  /** Optional help text displayed below the field */
  description?: string;
  /** Field type determines which input component is rendered */
  type:
    | "text"
    | "textarea"
    | "number"
    | "email"
    | "url"
    | "select"
    | "combobox"
    | "radio"
    | "checkbox"
    | "toggle"
    | "color"
    | "date";
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Options for select, combobox, and radio fields */
  options?: FieldOption[];
  /** Minimum value (for number fields) */
  min?: number;
  /** Maximum value (for number fields) */
  max?: number;
  /** Maximum character length (for text/textarea fields) */
  maxLength?: number;
  /** Show character count (for textarea fields) */
  showCharCount?: boolean;
  /** Number of rows (for textarea fields) */
  rows?: number;
  /** Field dependency: only visible/editable when parent field matches value */
  dependsOn?: {
    field: string;
    value: unknown;
  };
  /** Whether to show a live preview next to the field */
  livePreview?: boolean;
  /** Suffix text displayed after the input (e.g., "days", "posts") */
  suffix?: string;
  /** Prefix text displayed before the input */
  prefix?: string;
  /** Full width field (default: false, uses label+input side-by-side layout) */
  fullWidth?: boolean;
}

/** Option for select, combobox, and radio fields */
export interface FieldOption {
  /** Display label */
  label: string;
  /** Option value */
  value: string;
  /** Optional description shown below the label (for radio groups) */
  description?: string;
  /** Optional preview text (for radio groups with live preview) */
  preview?: string;
  /** Whether this option is disabled */
  disabled?: boolean;
}

/** State returned by useSettingsForm hook */
export interface SettingsFormState<T extends Record<string, unknown>> {
  /** TanStack Form instance */
  form: FormApi<T>;
  /** Whether any field has been modified from initial values */
  isDirty: boolean;
  /** Whether the form is currently submitting */
  isSubmitting: boolean;
  /** Whether the initial data has loaded from Convex */
  isLoading: boolean;
  /** Handle save -- validates and submits */
  handleSave: () => Promise<void>;
  /** Reset form to server values */
  handleReset: () => void;
  /** The initial values loaded from server (for comparison) */
  initialValues: T;
  /** Metadata: who last updated and when */
  lastUpdated?: {
    at: number;
    by: string;
  };
}

/** Callout/info box configuration */
export interface CalloutConfig {
  type: "info" | "warning" | "error";
  message: string;
  /** Optional link */
  link?: {
    text: string;
    href: string;
  };
}
```

### Section Value Types (re-exported from Settings System)

```typescript
// These types are defined in the Settings System Expert document
// and re-exported here for use in form components.
// See: .claude/docs/SETTINGS-SYSTEM.md -> Section Value Schemas

export type { GeneralSettings } from "@/types/settings/general";
export type { ReadingSettings } from "@/types/settings/reading";
export type { WritingSettings } from "@/types/settings/writing";
export type { DiscussionSettings } from "@/types/settings/discussion";
export type { PermalinkSettings } from "@/types/settings/permalinks";
export type { PrivacySettings } from "@/types/settings/privacy";
```

---

## Component Inventory

### Layout Components

#### `SettingsPageLayout`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/SettingsPageLayout.tsx`

**Purpose:** Top-level wrapper for every settings page. Renders the page title, optional description, child sections, and a sticky Save Changes button at the bottom.

**Props:**
```typescript
interface SettingsPageLayoutProps {
  /** Page title (e.g., "General Settings") */
  title: string;
  /** Optional description text below the title */
  description?: string;
  /** Child content: SettingsSection components */
  children: React.ReactNode;
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether the form is currently saving */
  isSubmitting: boolean;
  /** Called when Save Changes is clicked */
  onSave: () => Promise<void>;
  /** Called when Reset is clicked (optional) */
  onReset?: () => void;
  /** Last updated metadata */
  lastUpdated?: { at: number; by: string };
}
```

**Layout:**
```
+------------------------------------------------------------+
| General Settings                                            |
| Configure your site's basic information.                    |
+------------------------------------------------------------+
|                                                             |
| [SettingsSection children]                                  |
|                                                             |
+------------------------------------------------------------+
| [Save Changes]                      Last saved 2 min ago   |
+------------------------------------------------------------+
```

**Behavior:**
- Page title uses `<h1>` with `text-xl font-semibold`
- Description uses `text-muted-foreground text-sm`
- Children (sections) are rendered in a vertical flex column with `gap-6`
- Save button area is sticky at the bottom with a top border
- "Last saved" timestamp shows relative time (e.g., "2 minutes ago")
- Uses `useBlocker` from TanStack Router for navigation guard when `isDirty`

**Base UI Dependencies:** None (pure HTML + Tailwind)

---

#### `SettingsSection`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/SettingsSection.tsx`

**Purpose:** Visual grouping of related fields within a settings page. Renders a card with a header, optional description, and child fields.

**Props:**
```typescript
interface SettingsSectionProps {
  /** Section title (e.g., "Site Identity") */
  title: string;
  /** Optional description text */
  description?: string;
  /** Child content: SettingsField components */
  children: React.ReactNode;
  /** Whether the section is collapsible */
  collapsible?: boolean;
  /** Whether the section starts collapsed */
  defaultCollapsed?: boolean;
  /** Optional callout/info box at the top of the section */
  callout?: CalloutConfig;
}
```

**Layout:**
```
+------------------------------------------------------------+
| Site Identity                                  [collapse ^] |
| Your site's name and description.                           |
+------------------------------------------------------------+
| [Callout if present]                                        |
|                                                             |
| [SettingsField children]                                    |
|                                                             |
+------------------------------------------------------------+
```

**Behavior:**
- Renders as a `Card` with `CardHeader` and `CardContent`
- Title uses `CardTitle` (text-sm font-medium)
- Description uses `CardDescription` (text-muted-foreground text-xs)
- Collapsible sections use Base UI `Collapsible` with animated expand/collapse
- Children are rendered in a vertical flex column with `gap-4`
- Callout renders as a bordered info/warning box with icon

**Base UI Dependencies:** `@base-ui/react/collapsible` (for collapsible sections)

---

#### `SettingsField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/SettingsField.tsx`

**Purpose:** Wrapper for a single form field. Handles the label, description, error message, and layout. Does NOT render the input itself -- that is passed as children.

**Props:**
```typescript
interface SettingsFieldProps {
  /** Field label */
  label: string;
  /** Optional help text below the input */
  description?: string;
  /** Field name for accessibility (htmlFor) */
  htmlFor?: string;
  /** Validation error message */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Layout mode */
  layout?: "horizontal" | "stacked";
  /** Child input component */
  children: React.ReactNode;
  /** Optional suffix displayed inline after the field */
  suffix?: string;
  /** Optional live preview element */
  preview?: React.ReactNode;
}
```

**Layout (horizontal -- default for most fields):**
```
+------------------------------------------------------------+
| Site Title *          [_________________________]           |
|                       Your site's display name.             |
|                       Error: Title is required              |
+------------------------------------------------------------+
```

**Layout (stacked -- for checkboxes, radio groups, textareas):**
```
+------------------------------------------------------------+
| Moderation Word List                                        |
| [                                                ]          |
| [                                                ]          |
| [                                                ]          |
| Words to hold for moderation, one per line. 234/50000       |
| Error: Exceeds maximum length                               |
+------------------------------------------------------------+
```

**Behavior:**
- Horizontal layout: label on the left (w-1/3), input on the right (w-2/3)
- Stacked layout: label above, input below (full width)
- Label rendered using the `Label` component
- Required fields show a `*` after the label in `text-destructive`
- Error messages shown in `text-destructive text-xs` with an alert icon
- Description shown in `text-muted-foreground text-xs`
- Disabled fields have `opacity-50 pointer-events-none` via group styling
- When `suffix` is provided, it appears inline after the input (e.g., "days")
- When `preview` is provided, it appears below the input

**Base UI Dependencies:** None (uses the `Label` component from `ui/label.tsx`)

---

### Field Components

All field components are designed to work with TanStack Form's `field.state.value` and `field.handleChange` pattern. They accept a `field` prop from TanStack Form's `form.Field` render prop.

---

#### `TextField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/TextField.tsx`

**Purpose:** Standard text input for string values (site title, tagline, URLs, email, etc.).

**Props:**
```typescript
interface TextFieldProps {
  /** TanStack Form field API */
  field: FieldApi<string>;
  /** Input type: text, email, url, password */
  type?: "text" | "email" | "url" | "password";
  /** Placeholder text */
  placeholder?: string;
  /** Maximum character length */
  maxLength?: number;
  /** Whether to show character count */
  showCharCount?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}
```

**Behavior:**
- Renders the `Input` component from `ui/input.tsx` (which uses `@base-ui/react/input`)
- Binds `value` to `field.state.value`, `onChange` to `field.handleChange`
- Binds `onBlur` to `field.handleBlur` for blur validation
- When `showCharCount` is true, shows "X/Y" below the input
- Sets `aria-invalid` when field has errors
- Sets `aria-describedby` linking to error/description elements

**Base UI Dependencies:** `@base-ui/react/input` (via `ui/input.tsx`)

---

#### `TextareaField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/TextareaField.tsx`

**Purpose:** Multi-line text input for large text values (moderation word list, disallowed word list).

**Props:**
```typescript
interface TextareaFieldProps {
  /** TanStack Form field API */
  field: FieldApi<string>;
  /** Placeholder text */
  placeholder?: string;
  /** Number of visible rows */
  rows?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Whether to show character count */
  showCharCount?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Resize behavior */
  resize?: "none" | "vertical" | "both";
}
```

**Behavior:**
- Renders a styled `<textarea>` element (no Base UI primitive needed for textarea)
- Same styling pattern as `Input` component: border, focus ring, dark mode
- Character count shown as "234 / 50,000" in `text-muted-foreground text-xs`
- Character count turns `text-destructive` when approaching limit (>90%)
- Default `rows={4}`, `resize="vertical"`

**Base UI Dependencies:** None (native textarea with matching styles)

---

#### `SelectField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/SelectField.tsx`

**Purpose:** Dropdown select for choosing from a predefined list of options (default role, comment order, week starts on, etc.).

**Props:**
```typescript
interface SelectFieldProps {
  /** TanStack Form field API */
  field: FieldApi<string>;
  /** Options to display */
  options: FieldOption[];
  /** Placeholder text when no option selected */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
}
```

**Behavior:**
- Renders using `@base-ui/react/select` primitive
- Trigger shows selected option label (or placeholder)
- Popup is a positioned popover with scrollable option list
- Selected option shows a check icon
- Keyboard navigation: arrow keys, type-to-search, Enter to select, Escape to close
- Width matches the trigger element

**Base UI Dependencies:** `@base-ui/react/select`

---

#### `ComboboxField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/ComboboxField.tsx`

**Purpose:** Searchable select for large option lists (timezone picker, page select, category select, language select).

**Props:**
```typescript
interface ComboboxFieldProps {
  /** TanStack Form field API */
  field: FieldApi<string | null>;
  /** Options to display (may be grouped) */
  options: FieldOption[] | FieldOptionGroup[];
  /** Placeholder text */
  placeholder?: string;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Whether to allow clearing the selection */
  clearable?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state (for async options) */
  isLoading?: boolean;
}

interface FieldOptionGroup {
  label: string;
  options: FieldOption[];
}
```

**Behavior:**
- Renders a text input that filters options as the user types
- Options can be grouped (e.g., timezone by region: Americas, Europe, Asia)
- Shows a dropdown popover with filtered results
- "No results found" message when filter yields no matches
- Clear button (X) when `clearable` and a value is selected
- Keyboard navigation: arrow keys, Enter to select, Escape to close
- Used for: timezone picker (250+ options), page selects, category selects

**Base UI Dependencies:** `@base-ui/react/popover`, `@base-ui/react/input`

---

#### `RadioGroupField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/RadioGroupField.tsx`

**Purpose:** Radio button group for selecting one option from a small set (date format, time format, homepage display, permalink structure, feed content display, avatar rating).

**Props:**
```typescript
interface RadioGroupFieldProps {
  /** TanStack Form field API */
  field: FieldApi<string>;
  /** Options to display */
  options: FieldOption[];
  /** Layout direction */
  direction?: "vertical" | "horizontal";
  /** Whether to show a custom input for a specific option value */
  customOption?: {
    value: string;
    inputPlaceholder?: string;
    inputField: FieldApi<string>;
  };
  /** Disabled state */
  disabled?: boolean;
}
```

**Layout (vertical with preview):**
```
+------------------------------------------------------------+
| ( ) MMMM d, yyyy              February 9, 2026             |
| ( ) MM/dd/yyyy                02/09/2026                    |
| ( ) dd/MM/yyyy                09/02/2026                    |
| ( ) yyyy-MM-dd                2026-02-09                    |
| (o) Custom:  [yyyy/MM/dd]     2026/02/09                    |
+------------------------------------------------------------+
```

**Behavior:**
- Uses `@base-ui/react/radio-group` primitive
- Each option renders as a radio button with label
- When `option.preview` is provided, preview text shown on the right
- When `option.description` is provided, description shown below the label
- Custom option: selecting the "Custom" radio enables an inline text input
- Keyboard: arrow keys cycle through options, selecting immediately

**Base UI Dependencies:** `@base-ui/react/radio-group`, `@base-ui/react/radio`

---

#### `CheckboxField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/CheckboxField.tsx`

**Purpose:** Single checkbox for boolean toggle values (membership enabled, allow comments, require name/email, search engine visibility, etc.).

**Props:**
```typescript
interface CheckboxFieldProps {
  /** TanStack Form field API */
  field: FieldApi<boolean>;
  /** Label text displayed next to the checkbox */
  label: string;
  /** Optional description below the label */
  description?: string;
  /** Disabled state */
  disabled?: boolean;
}
```

**Layout:**
```
+------------------------------------------------------------+
| [x] Anyone can register                                     |
|     Allow public user registration on the site.             |
+------------------------------------------------------------+
```

**Behavior:**
- Uses the `Checkbox` component from `ui/checkbox.tsx` (which uses `@base-ui/react/checkbox`)
- Checkbox on the left, label on the right (inline flex)
- Clicking the label toggles the checkbox
- Description (if provided) appears below the label in `text-muted-foreground text-xs`
- Disabled state dims the checkbox and label

**Base UI Dependencies:** `@base-ui/react/checkbox` (via `ui/checkbox.tsx`)

---

#### `ToggleField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/ToggleField.tsx`

**Purpose:** Toggle switch for on/off boolean values. Alternative to CheckboxField for settings where the on/off state is more prominent (e.g., "Show Avatars").

**Props:**
```typescript
interface ToggleFieldProps {
  /** TanStack Form field API */
  field: FieldApi<boolean>;
  /** Label text */
  label: string;
  /** Optional description */
  description?: string;
  /** Disabled state */
  disabled?: boolean;
}
```

**Behavior:**
- Uses `@base-ui/react/switch` primitive
- Switch on the left, label on the right
- Animated slide between on/off states
- Visual distinction: uses `bg-primary` when on, `bg-muted` when off

**Base UI Dependencies:** `@base-ui/react/switch`

---

#### `NumberField`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/fields/NumberField.tsx`

**Purpose:** Numeric input with optional min/max constraints and step (posts per page, feed item count, auto-close days, thread depth, comments per page, hold if links exceed).

**Props:**
```typescript
interface NumberFieldProps {
  /** TanStack Form field API */
  field: FieldApi<number>;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Disabled state */
  disabled?: boolean;
  /** Width (narrow for inline use) */
  width?: "narrow" | "default";
}
```

**Behavior:**
- Uses `@base-ui/react/number-field` primitive
- Renders a numeric input with increment/decrement buttons
- Constrains value to min/max range
- "narrow" width is `w-20` for inline use (e.g., "Show at most [10] posts")
- "default" width follows the standard field width
- Up/Down arrow keys increment/decrement

**Base UI Dependencies:** `@base-ui/react/number-field`

---

### Shared Components

#### `SaveButton`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/SaveButton.tsx`

**Purpose:** The "Save Changes" button at the bottom of every settings page. Manages loading state, disabled state based on dirty tracking, and keyboard shortcut.

**Props:**
```typescript
interface SaveButtonProps {
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether the form is currently submitting */
  isSubmitting: boolean;
  /** Called when clicked */
  onSave: () => Promise<void>;
  /** Optional: last updated metadata */
  lastUpdated?: { at: number; by: string };
}
```

**Behavior:**
- Renders the `Button` component from `ui/button.tsx` with `variant="default"`
- Disabled when `!isDirty || isSubmitting`
- Shows `Loader2` spinning icon when `isSubmitting`
- Text: "Save Changes" (idle), "Saving..." (submitting)
- Keyboard shortcut: `Ctrl+S` / `Cmd+S` triggers save (when dirty)
- Last updated info shown to the right: "Last saved 2 minutes ago by admin@example.com"
- Bottom of the page with a top border separator

**Base UI Dependencies:** `@base-ui/react/button` (via `ui/button.tsx`)

---

#### `SettingsCallout`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/SettingsCallout.tsx`

**Purpose:** Info/warning/error callout boxes used within settings sections to provide important context.

**Props:**
```typescript
interface SettingsCalloutProps {
  /** Callout type determines icon and colors */
  type: "info" | "warning" | "error";
  /** Message text */
  children: React.ReactNode;
  /** Optional link */
  link?: { text: string; href: string };
}
```

**Behavior:**
- Info: `bg-primary/5 border-primary/20` with `Info` icon
- Warning: `bg-warning/10 border-warning/30` with `TriangleAlert` icon
- Error: `bg-destructive/10 border-destructive/30` with `OctagonX` icon
- Link renders as an inline anchor with underline

**Base UI Dependencies:** None (pure HTML + Tailwind + Lucide icons)

---

#### `PermalinkTagButtons`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/PermalinkTagButtons.tsx`

**Purpose:** Row of tag insertion buttons for the custom permalink structure input. Clicking a tag inserts it at the cursor position in the custom structure input.

**Props:**
```typescript
interface PermalinkTagButtonsProps {
  /** Reference to the custom structure input element */
  inputRef: React.RefObject<HTMLInputElement>;
  /** TanStack Form field for customStructure */
  field: FieldApi<string>;
}
```

**Tags:** `%year%`, `%monthnum%`, `%day%`, `%hour%`, `%minute%`, `%second%`, `%post_id%`, `%postname%`, `%category%`, `%author%`

**Behavior:**
- Renders a row of small buttons, each labeled with the tag name
- Clicking a button inserts the tag at the cursor position in the input
- Uses `inputRef.current.selectionStart` to determine cursor position
- After insertion, focuses the input and positions cursor after the inserted tag
- Buttons use `variant="outline" size="xs"`

**Base UI Dependencies:** `@base-ui/react/button` (via `ui/button.tsx`)

---

#### `PermalinkPreview`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/PermalinkPreview.tsx`

**Purpose:** Live preview of the permalink structure showing what a URL would look like with the selected pattern.

**Props:**
```typescript
interface PermalinkPreviewProps {
  /** The selected structure type */
  structure: string;
  /** The custom structure pattern (when structure="custom") */
  customStructure?: string;
  /** The site URL for display */
  siteUrl: string;
}
```

**Behavior:**
- Replaces tags with sample data: `%year%` -> "2026", `%postname%` -> "sample-post", etc.
- Shows the full URL: `https://example.com/2026/02/sample-post/`
- Updates in real-time as the user selects different structures or types custom patterns
- Styled in `text-muted-foreground text-xs font-mono bg-muted/50 px-2 py-1`

**Base UI Dependencies:** None

---

#### `DateFormatPreview`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/DateFormatPreview.tsx`

**Purpose:** Shows a live preview of the selected date format using the current date and selected timezone.

**Props:**
```typescript
interface DateFormatPreviewProps {
  /** The date-fns format string */
  format: string;
  /** The selected IANA timezone */
  timezone: string;
}
```

**Behavior:**
- Uses `date-fns` and `date-fns-tz` to format `new Date()` with the given format and timezone
- Updates every second (for formats that include seconds)
- Displayed inline next to the format option in the radio group

**Base UI Dependencies:** None

---

#### `TimeFormatPreview`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/TimeFormatPreview.tsx`

**Purpose:** Shows a live preview of the selected time format using the current time and selected timezone.

**Props:**
```typescript
interface TimeFormatPreviewProps {
  /** The date-fns format string */
  format: string;
  /** The selected IANA timezone */
  timezone: string;
}
```

**Behavior:**
- Same as DateFormatPreview but for time formats
- Updates every second

**Base UI Dependencies:** None

---

#### `TimezoneSelect`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/TimezoneSelect.tsx`

**Purpose:** Searchable timezone picker with grouped options (Americas, Europe, Asia, etc.).

**Props:**
```typescript
interface TimezoneSelectProps {
  /** TanStack Form field API */
  field: FieldApi<string>;
  /** Disabled state */
  disabled?: boolean;
}
```

**Behavior:**
- Wraps `ComboboxField` with pre-populated timezone options
- Options grouped by region: Africa, Americas, Asia, Atlantic, Australia, Europe, Indian, Pacific, UTC
- Each option shows the timezone name and current UTC offset (e.g., "America/New_York (UTC-5)")
- Searchable by city name, region, or UTC offset

**Base UI Dependencies:** Inherits from `ComboboxField`

---

#### `PageSelect`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/PageSelect.tsx`

**Purpose:** Searchable page selector for choosing a page (homepage, posts page, privacy policy page).

**Props:**
```typescript
interface PageSelectProps {
  /** TanStack Form field API */
  field: FieldApi<string | null>;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to allow clearing the selection */
  clearable?: boolean;
  /** Optional filter: only show pages matching criteria */
  filter?: { status?: string };
  /** Disabled state */
  disabled?: boolean;
}
```

**Behavior:**
- Wraps `ComboboxField` with pages loaded from `useQuery(api.pages.list)`
- Shows page title and status (Published, Draft)
- Warning badge if selected page is unpublished or deleted
- Clearable (can set to "-- Select --" / null)

**Base UI Dependencies:** Inherits from `ComboboxField`

---

#### `CategorySelect`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/CategorySelect.tsx`

**Purpose:** Searchable category selector for choosing a default category.

**Props:**
```typescript
interface CategorySelectProps {
  /** TanStack Form field API */
  field: FieldApi<string | null>;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
}
```

**Behavior:**
- Wraps `ComboboxField` with categories loaded from `useQuery(api.taxonomies.list)`
- Shows category name and post count
- Hierarchical display with indentation for child categories

**Base UI Dependencies:** Inherits from `ComboboxField`

---

#### `ImportExport`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/ImportExport.tsx`

**Purpose:** Settings import and export UI. Not a standalone page -- rendered as a section or accessible from a button on any settings page.

**Props:**
```typescript
interface ImportExportProps {
  /** Optional: limit to specific sections */
  sections?: SettingsSection[];
}
```

**Behavior:**
- **Export:** Button triggers `useQuery(api.settings.exportAll)`. Downloads as JSON file.
- **Import:** File upload input accepts `.json`. Validates format. Shows diff preview per section. Checkboxes to select which sections to import. Warnings for missing references. "Import Selected" and "Cancel" buttons. Calls `useMutation(api.settings.importAll)`.
- Uses `@base-ui/react/dialog` for the import preview modal (this is acceptable since it is NOT content management -- it is a destructive confirmation flow)

**Base UI Dependencies:** `@base-ui/react/dialog` (import preview is a confirmation flow, not content management)

---

### Confirmation Dialog

#### `PermalinkChangeDialog`

**File:** `ConvexPress-Admin/apps/web/src/components/settings/PermalinkChangeDialog.tsx`

**Purpose:** Confirmation dialog shown before saving permalink changes. Warns about SEO impact and bookmark breakage.

**Props:**
```typescript
interface PermalinkChangeDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  oldStructure: string;
  newStructure: string;
}
```

**Behavior:**
- Title: "Confirm Permalink Change"
- Body: "Changing permalink structure will affect all existing post URLs. This may impact SEO and existing bookmarks. Old structure: X. New structure: Y."
- Buttons: "Cancel" (ghost) and "Save Changes" (default/primary)
- Uses `@base-ui/react/dialog` (acceptable: destructive confirmation)

**Base UI Dependencies:** `@base-ui/react/dialog`

---

## Hooks

### `useSettingsForm`

**File:** `ConvexPress-Admin/apps/web/src/hooks/useSettingsForm.ts`

**Purpose:** The core hook that powers every settings page. Connects Convex reactive data to TanStack Form with dirty tracking, validation, save, and reset.

**Signature:**
```typescript
function useSettingsForm<T extends Record<string, unknown>>(
  section: SettingsSection,
  validationSchema: z.ZodObject<any>,
): SettingsFormState<T>
```

**Implementation Pattern:**
```typescript
export function useSettingsForm<T extends Record<string, unknown>>(
  section: SettingsSection,
  validationSchema: z.ZodObject<any>,
): SettingsFormState<T> {
  // 1. Subscribe to settings data from Convex
  const settingsData = useQuery(api.settings.getBySection, { section });
  const updateSettings = useMutation(api.settings.updateSection);

  // 2. Track initial values for dirty comparison
  const [initialValues, setInitialValues] = useState<T | null>(null);

  // 3. Create TanStack Form instance
  const form = useForm<T>({
    defaultValues: initialValues ?? ({} as T),
    validators: {
      onSubmit: validationSchema,
    },
  });

  // 4. When server data loads/changes, update form if not dirty
  useEffect(() => {
    if (settingsData && !isDirty) {
      const values = settingsData.values as T;
      setInitialValues(values);
      form.reset(values);
    } else if (settingsData && isDirty) {
      // Another admin saved -- show toast but don't overwrite local changes
      toast.info("Settings were updated by another administrator.");
    }
  }, [settingsData]);

  // 5. Compute dirty state by deep comparing current vs initial
  const isDirty = useMemo(() => {
    if (!initialValues) return false;
    return !deepEqual(form.state.values, initialValues);
  }, [form.state.values, initialValues]);

  // 6. Save handler
  const handleSave = async () => {
    const result = await form.handleSubmit();
    if (result) return; // validation errors

    try {
      await updateSettings({
        section,
        values: form.state.values,
      });
      setInitialValues(form.state.values as T);
      toast.success("Settings saved.");
    } catch (error) {
      toast.error("Failed to save settings.");
    }
  };

  // 7. Reset handler
  const handleReset = () => {
    if (initialValues) {
      form.reset(initialValues);
    }
  };

  return {
    form,
    isDirty,
    isSubmitting: form.state.isSubmitting,
    isLoading: settingsData === undefined,
    handleSave,
    handleReset,
    initialValues: initialValues ?? ({} as T),
    lastUpdated: settingsData
      ? { at: settingsData.updatedAt, by: settingsData.updatedBy }
      : undefined,
  };
}
```

**Key Behaviors:**
1. **Reactive updates:** When Convex subscription fires, form updates only if not dirty
2. **Dirty state resets immediately on save**, not on subscription update (avoids race condition)
3. **Deep comparison** for dirty state (not reference equality)
4. **Validation runs on submit** (not on every change -- settings forms are save-all-at-once)
5. **Toast notifications** for save success, save error, and concurrent edit detection

---

### `useNavigationGuard`

**File:** `ConvexPress-Admin/apps/web/src/hooks/useNavigationGuard.ts`

**Purpose:** Warns the user before navigating away from a settings page with unsaved changes.

**Signature:**
```typescript
function useNavigationGuard(isDirty: boolean): void
```

**Implementation Pattern:**
```typescript
export function useNavigationGuard(isDirty: boolean): void {
  // TanStack Router navigation guard
  useBlocker({
    blockerFn: () =>
      window.confirm("You have unsaved changes. Are you sure you want to leave?"),
    condition: isDirty,
  });

  // Browser navigation guard (back button, close tab)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
```

---

### `useKeyboardSave`

**File:** `ConvexPress-Admin/apps/web/src/hooks/useKeyboardSave.ts`

**Purpose:** Adds Ctrl+S / Cmd+S keyboard shortcut to trigger save on settings pages.

**Signature:**
```typescript
function useKeyboardSave(onSave: () => Promise<void>, isDirty: boolean): void
```

**Implementation Pattern:**
```typescript
export function useKeyboardSave(
  onSave: () => Promise<void>,
  isDirty: boolean,
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) {
          onSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave, isDirty]);
}
```

---

## Routes

### Settings Layout Route

**File:** `ConvexPress-Admin/apps/web/src/routes/_admin/settings.tsx`

**Purpose:** Parent layout route for all settings pages. Handles auth check and capability guard.

```typescript
export const Route = createFileRoute("/_admin/settings")({
  beforeLoad: async ({ context }) => {
    // Only Administrators can access settings
    if (!context.auth.hasCapability("manage_options")) {
      throw redirect({ to: "/admin" });
    }
  },
  component: SettingsLayout,
});

function SettingsLayout() {
  return <Outlet />;
}
```

### Settings Index (Redirect)

**File:** `ConvexPress-Admin/apps/web/src/routes/_admin/settings/index.tsx`

**Purpose:** Redirects `/admin/settings` to `/admin/settings/general`.

```typescript
export const Route = createFileRoute("/_admin/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/settings/general" });
  },
});
```

### Individual Settings Pages

| Route | File | Section | Title |
|-------|------|---------|-------|
| `/admin/settings/general` | `routes/_admin/settings/general.tsx` | `"general"` | General Settings |
| `/admin/settings/reading` | `routes/_admin/settings/reading.tsx` | `"reading"` | Reading Settings |
| `/admin/settings/writing` | `routes/_admin/settings/writing.tsx` | `"writing"` | Writing Settings |
| `/admin/settings/discussion` | `routes/_admin/settings/discussion.tsx` | `"discussion"` | Discussion Settings |
| `/admin/settings/permalinks` | `routes/_admin/settings/permalinks.tsx` | `"permalinks"` | Permalink Settings |
| `/admin/settings/privacy` | `routes/_admin/settings/privacy.tsx` | `"privacy"` | Privacy Settings |

### Route Component Pattern

Every settings page follows the same pattern:

```typescript
// Example: routes/_admin/settings/general.tsx

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { TextField } from "@/components/settings/fields/TextField";
import { CheckboxField } from "@/components/settings/fields/CheckboxField";
import { SelectField } from "@/components/settings/fields/SelectField";
import { RadioGroupField } from "@/components/settings/fields/RadioGroupField";
import { TimezoneSelect } from "@/components/settings/TimezoneSelect";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { useKeyboardSave } from "@/hooks/useKeyboardSave";
import type { GeneralSettings } from "@/types/settings";
import { generalSettingsSchema } from "@/lib/settings/schemas";

export const Route = createFileRoute("/_admin/settings/general")({
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const { form, isDirty, isSubmitting, isLoading, handleSave, lastUpdated } =
    useSettingsForm<GeneralSettings>("general", generalSettingsSchema);

  useNavigationGuard(isDirty);
  useKeyboardSave(handleSave, isDirty);

  if (isLoading) {
    return <SettingsPageSkeleton />;
  }

  return (
    <SettingsPageLayout
      title="General Settings"
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      onSave={handleSave}
      lastUpdated={lastUpdated}
    >
      <SettingsSection title="Site Identity" description="Your site's name and tagline.">
        <form.Field name="siteTitle">
          {(field) => (
            <SettingsField label="Site Title" htmlFor="siteTitle" required error={field.state.meta.errors[0]}>
              <TextField field={field} placeholder="My Site" maxLength={200} />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="tagline">
          {(field) => (
            <SettingsField label="Tagline" htmlFor="tagline" error={field.state.meta.errors[0]}>
              <TextField field={field} placeholder="Just another ConvexPress site" maxLength={500} />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* More sections... */}
    </SettingsPageLayout>
  );
}
```

---

## Backend Integration

This expert does NOT define Convex functions. It CONSUMES functions defined by the Settings System Expert. Here is the mapping of which queries/mutations each page calls:

### Queries Used

| Query | Used By | Purpose |
|-------|---------|---------|
| `api.settings.getBySection` | All 6 settings pages | Load current values for the section being edited |
| `api.pages.list` | Reading, Privacy | Populate page select dropdowns (homepage, posts page, privacy page) |
| `api.taxonomies.list` | Writing | Populate category select dropdown (default category) |
| `api.settings.exportAll` | Import/Export UI | Generate JSON export |

### Mutations Used

| Mutation | Used By | Purpose |
|----------|---------|---------|
| `api.settings.updateSection` | All 6 settings pages (via `useSettingsForm`) | Save updated values for the section |
| `api.settings.importAll` | Import/Export UI | Import settings from JSON |

### How Settings Pages Call Backend

```typescript
// Every settings page uses the same pattern via useSettingsForm:

// 1. Read (reactive subscription)
const settingsData = useQuery(api.settings.getBySection, { section: "general" });

// 2. Write (on save)
const updateSettings = useMutation(api.settings.updateSection);
await updateSettings({ section: "general", values: formValues });

// 3. Additional data for specific pages
// Reading page:
const pages = useQuery(api.pages.list, { status: "publish" });

// Writing page:
const categories = useQuery(api.taxonomies.list, { type: "category" });
```

---

## Accessibility

### Form Labels

- Every input has an associated `<label>` element via `htmlFor` / `id` pairing
- Required fields have `aria-required="true"` on the input
- Fields with errors have `aria-invalid="true"` and `aria-describedby` pointing to the error message element
- Fields with descriptions have `aria-describedby` pointing to the description element (combined with error if both present)

### Error Announcements

- Validation errors on submit trigger an `aria-live="polite"` announcement: "Please fix N errors before saving"
- Individual field errors are announced when the field loses focus (blur validation)
- Server errors trigger a Sonner toast which is automatically accessible (Sonner handles `aria-live`)

### Focus Management

- On page load, focus is not automatically moved (settings pages are navigation targets, not modals)
- On validation error, focus moves to the first field with an error
- After successful save, focus remains on the Save Changes button
- Keyboard shortcut Ctrl+S is documented with a visually hidden tooltip on the Save button
- Radio groups support arrow key navigation per WAI-ARIA radio group pattern
- Select/Combobox components support full keyboard navigation (arrow keys, type-to-search, Enter, Escape)

### Color Contrast

- Error text uses `text-destructive` which meets WCAG AA contrast requirements
- Disabled fields use `opacity-50` which is acceptable for disabled state
- All interactive elements have visible focus indicators via `focus-visible:ring`

### Screen Reader Support

- Settings sections use `role="group"` with `aria-labelledby` pointing to the section title
- Radio groups use `role="radiogroup"` with `aria-labelledby`
- Checkboxes use native semantics from Base UI
- Callout boxes use `role="alert"` for warnings/errors, `role="note"` for info

---

## Known Gaps & Decisions

### Open Questions

1. **Form section design: Card-based vs flat with dividers?**
   - **Decision:** Card-based. Each `SettingsSection` renders as a `Card` component. This provides clear visual boundaries between sections, especially on the Discussion page which has 6 sections.
   - **Rationale:** WordPress uses `<h2>` headings with horizontal rules. Cards are more visually structured and match the modern admin aesthetic. Each card is its own visual unit.

2. **Dependent field animation: Instant show/hide vs expand/collapse?**
   - **Decision:** Animated expand/collapse using CSS transitions (height auto, opacity). Provides visual feedback that a field appeared/disappeared.
   - **Implementation:** Use `@base-ui/react/collapsible` for dependent field groups. 200ms transition duration.

3. **Settings change audit trail UI: Show who changed what when?**
   - **Deferred.** The backend (Settings System) stores `updatedAt` and `updatedBy` per section, and the Audit Log System records full change diffs. The UI currently shows "Last saved X ago by Y" at the bottom of the page. A full audit trail view (list of all changes to a section) is deferred to a future iteration.

4. **Multi-tab settings vs single long page for Discussion (24 fields)?**
   - **Decision:** Single long page with collapsible sections. Discussion Settings has 6 sections, each clearly labeled. Users can collapse sections they are not interested in.
   - **Rationale:** WordPress uses a single long page. Tabs within a settings page would add navigation complexity. Collapsible sections provide the ability to focus on specific areas without losing context.

5. **Settings reset to defaults pattern?**
   - **Decision:** Each section has an optional "Reset to Defaults" link in the section footer. Clicking it shows a confirmation dialog, then resets all fields in that section to their code-defined defaults. The reset is NOT a backend operation -- it simply sets the form values to defaults. The user must still click "Save Changes" to persist the reset.
   - **Rationale:** Destructive operations should require explicit confirmation. Two-step process (reset form + save) prevents accidental data loss.

6. **Permalink structure live preview?**
   - **Decision:** Use the `PermalinkPreview` component that shows a sample URL with the selected structure, updated in real-time as the user selects options or types a custom pattern. Sample data uses: year=2026, month=02, day=09, postname=sample-post, post_id=123, category=uncategorized, author=admin.

### Implementation Notes

7. **Skeleton loading state:** When `useSettingsForm` returns `isLoading: true`, the page should render a skeleton layout matching the expected section structure. Use the `Skeleton` component from `ui/skeleton.tsx`. Each SettingsSection renders as a card with skeleton rectangles for the header and fields.

8. **Responsive layout:** The horizontal field layout (label left, input right) collapses to stacked layout on small screens (`md:` breakpoint). On screens below `md`, all fields use stacked layout.

9. **Discussion page performance:** With 24 fields, the Discussion page should NOT re-render all fields on every change. TanStack Form's `form.Field` render prop pattern already provides field-level re-render isolation -- each `<form.Field>` only re-renders when its own value changes.

10. **Optimistic updates strategy:** Use Convex's built-in optimistic update mechanism. On save, immediately update the local cache with the new values, then let the server subscription confirm. If the server rejects (validation error), the optimistic update is rolled back automatically.

11. **Import preview modal:** The import preview shows a two-column diff (current vs imported) per section. Sections with no changes are grayed out. Sections with changes show a checkbox and colored diff. This is the ONE modal in the settings system (acceptable for import/export which is a destructive confirmation flow, not content management).

---

## File Inventory

### Components (Planned)

| File | Component | Purpose |
|------|-----------|---------|
| `ConvexPress-Admin/apps/web/src/components/settings/SettingsPageLayout.tsx` | `SettingsPageLayout` | Top-level page wrapper |
| `ConvexPress-Admin/apps/web/src/components/settings/SettingsSection.tsx` | `SettingsSection` | Visual section grouping |
| `ConvexPress-Admin/apps/web/src/components/settings/SettingsField.tsx` | `SettingsField` | Single field wrapper |
| `ConvexPress-Admin/apps/web/src/components/settings/SaveButton.tsx` | `SaveButton` | Save Changes button |
| `ConvexPress-Admin/apps/web/src/components/settings/SettingsCallout.tsx` | `SettingsCallout` | Info/warning/error boxes |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/TextField.tsx` | `TextField` | Text/email/url input |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/TextareaField.tsx` | `TextareaField` | Multi-line text input |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/SelectField.tsx` | `SelectField` | Dropdown select |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/ComboboxField.tsx` | `ComboboxField` | Searchable select |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/RadioGroupField.tsx` | `RadioGroupField` | Radio button group |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/CheckboxField.tsx` | `CheckboxField` | Boolean checkbox |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/ToggleField.tsx` | `ToggleField` | Toggle switch |
| `ConvexPress-Admin/apps/web/src/components/settings/fields/NumberField.tsx` | `NumberField` | Numeric input |
| `ConvexPress-Admin/apps/web/src/components/settings/TimezoneSelect.tsx` | `TimezoneSelect` | Timezone picker |
| `ConvexPress-Admin/apps/web/src/components/settings/PageSelect.tsx` | `PageSelect` | Page selector |
| `ConvexPress-Admin/apps/web/src/components/settings/CategorySelect.tsx` | `CategorySelect` | Category selector |
| `ConvexPress-Admin/apps/web/src/components/settings/PermalinkTagButtons.tsx` | `PermalinkTagButtons` | Tag inserters |
| `ConvexPress-Admin/apps/web/src/components/settings/PermalinkPreview.tsx` | `PermalinkPreview` | URL preview |
| `ConvexPress-Admin/apps/web/src/components/settings/DateFormatPreview.tsx` | `DateFormatPreview` | Date format preview |
| `ConvexPress-Admin/apps/web/src/components/settings/TimeFormatPreview.tsx` | `TimeFormatPreview` | Time format preview |
| `ConvexPress-Admin/apps/web/src/components/settings/ImportExport.tsx` | `ImportExport` | Settings import/export |
| `ConvexPress-Admin/apps/web/src/components/settings/PermalinkChangeDialog.tsx` | `PermalinkChangeDialog` | Permalink change confirmation |

### Hooks (Planned)

| File | Hook | Purpose |
|------|------|---------|
| `ConvexPress-Admin/apps/web/src/hooks/useSettingsForm.ts` | `useSettingsForm` | Core settings form hook |
| `ConvexPress-Admin/apps/web/src/hooks/useNavigationGuard.ts` | `useNavigationGuard` | Unsaved changes guard |
| `ConvexPress-Admin/apps/web/src/hooks/useKeyboardSave.ts` | `useKeyboardSave` | Ctrl+S shortcut |

### Types (Planned)

| File | Exports | Purpose |
|------|---------|---------|
| `ConvexPress-Admin/apps/web/src/types/settings.ts` | `SettingsSection`, `SettingsPageConfig`, `SettingsSectionConfig`, `SettingsFieldConfig`, `FieldOption`, `SettingsFormState`, `CalloutConfig` | Shared type definitions |

### Validation Schemas (Planned)

| File | Exports | Purpose |
|------|---------|---------|
| `ConvexPress-Admin/apps/web/src/lib/settings/schemas.ts` | `generalSettingsSchema`, `readingSettingsSchema`, `writingSettingsSchema`, `discussionSettingsSchema`, `permalinkSettingsSchema`, `privacySettingsSchema` | Zod schemas for client-side validation |

### Routes (Planned)

| File | Route | Purpose |
|------|-------|---------|
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings.tsx` | `/admin/settings` | Layout + auth guard |
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings/index.tsx` | `/admin/settings` | Redirect to general |
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings/general.tsx` | `/admin/settings/general` | General Settings page |
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings/reading.tsx` | `/admin/settings/reading` | Reading Settings page |
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings/writing.tsx` | `/admin/settings/writing` | Writing Settings page |
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings/discussion.tsx` | `/admin/settings/discussion` | Discussion Settings page |
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings/permalinks.tsx` | `/admin/settings/permalinks` | Permalink Settings page |
| `ConvexPress-Admin/apps/web/src/routes/_admin/settings/privacy.tsx` | `/admin/settings/privacy` | Privacy Settings page |

### Existing UI Components Used

| File | Component | Usage |
|------|-----------|-------|
| `ConvexPress-Admin/apps/web/src/components/ui/button.tsx` | `Button` | SaveButton, PermalinkTagButtons, Import/Export buttons |
| `ConvexPress-Admin/apps/web/src/components/ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | SettingsSection |
| `ConvexPress-Admin/apps/web/src/components/ui/checkbox.tsx` | `Checkbox` | CheckboxField |
| `ConvexPress-Admin/apps/web/src/components/ui/input.tsx` | `Input` | TextField |
| `ConvexPress-Admin/apps/web/src/components/ui/label.tsx` | `Label` | SettingsField |
| `ConvexPress-Admin/apps/web/src/components/ui/skeleton.tsx` | `Skeleton` | Loading states |
| `ConvexPress-Admin/apps/web/src/components/ui/sonner.tsx` | `Toaster` | Toast notifications |

---

## Dependencies

### Depends On

| System/Expert | Type | What Is Needed |
|---------------|------|----------------|
| **Settings System Expert** | **Hard** | All Convex queries (`getBySection`) and mutations (`updateSection`, `importAll`) that power the forms. This UI expert renders forms; the Settings System Expert defines the backend. |
| **Admin Shell & Navigation UI Expert** | **Hard** | The admin layout shell (`_admin` route), sidebar navigation with Settings menu item and sub-items (General, Reading, Writing, Discussion, Permalinks, Privacy). |
| **Role & Capability System Expert** | **Medium** | `manage_options` capability check at the route level to prevent non-administrators from accessing settings pages. |
| **Auth System Expert** | **Medium** | Convex Auth authentication required for all settings routes. AuthKit pattern for admin auth flow. |

### Depended On By

| System/Expert | Type | What They Need |
|---------------|------|----------------|
| **SEO System Expert** | **Medium** | The SEO Settings page (`/admin/seo/settings`) reuses `SettingsPageLayout`, `SettingsSection`, `SettingsField`, and field components from this expert. |
| **Sitemap System Expert** | **Medium** | The Sitemap Settings page reuses the same layout and field components. |
| **Email Notification System Expert** | **Medium** | The Email Settings page reuses the same layout and field components. |
| **API System Expert** | **Medium** | The API Settings page reuses the same layout and field components. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| `@base-ui/react` | Interactive UI primitives (input, checkbox, switch, select, radio-group, collapsible, dialog, number-field, popover) |
| `@tanstack/react-form` | Form state management, field tracking, validation integration |
| `@tanstack/react-router` | Route definitions, `useBlocker` for navigation guard, `redirect` for auth |
| `zod` | Client-side validation schemas |
| `sonner` | Toast notifications (success, error, info) |
| `lucide-react` | Icons (Check, Info, TriangleAlert, OctagonX, Loader2, ChevronDown, X) |
| `class-variance-authority` | Variant-based styling (used by Button and other UI components) |
| `clsx` + `tailwind-merge` | Conditional class composition |
| `date-fns` + `date-fns-tz` | Date/time format preview in General Settings |
| `convex/react` | `useQuery`, `useMutation` for Convex integration |

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] `src/types/settings.ts` -- Type definitions
- [ ] `src/lib/settings/schemas.ts` -- Zod validation schemas for all 6 sections
- [ ] `src/hooks/useSettingsForm.ts` -- Core form hook
- [ ] `src/hooks/useNavigationGuard.ts` -- Navigation guard hook
- [ ] `src/hooks/useKeyboardSave.ts` -- Keyboard shortcut hook

### Phase 2: Layout & Shared Components
- [ ] `src/components/settings/SettingsPageLayout.tsx` -- Page layout wrapper
- [ ] `src/components/settings/SettingsSection.tsx` -- Section card
- [ ] `src/components/settings/SettingsField.tsx` -- Field wrapper
- [ ] `src/components/settings/SaveButton.tsx` -- Save button with dirty state
- [ ] `src/components/settings/SettingsCallout.tsx` -- Info/warning boxes

### Phase 3: Field Components
- [ ] `src/components/settings/fields/TextField.tsx` -- Text input
- [ ] `src/components/settings/fields/TextareaField.tsx` -- Textarea
- [ ] `src/components/settings/fields/SelectField.tsx` -- Select dropdown
- [ ] `src/components/settings/fields/ComboboxField.tsx` -- Searchable select
- [ ] `src/components/settings/fields/RadioGroupField.tsx` -- Radio group
- [ ] `src/components/settings/fields/CheckboxField.tsx` -- Checkbox
- [ ] `src/components/settings/fields/ToggleField.tsx` -- Toggle switch
- [ ] `src/components/settings/fields/NumberField.tsx` -- Number input

### Phase 4: Specialized Components
- [ ] `src/components/settings/TimezoneSelect.tsx` -- Timezone picker
- [ ] `src/components/settings/PageSelect.tsx` -- Page selector
- [ ] `src/components/settings/CategorySelect.tsx` -- Category selector
- [ ] `src/components/settings/DateFormatPreview.tsx` -- Date format preview
- [ ] `src/components/settings/TimeFormatPreview.tsx` -- Time format preview
- [ ] `src/components/settings/PermalinkTagButtons.tsx` -- Tag inserters
- [ ] `src/components/settings/PermalinkPreview.tsx` -- URL preview
- [ ] `src/components/settings/PermalinkChangeDialog.tsx` -- Permalink confirmation

### Phase 5: Routes (Core 6 Settings Pages)
- [ ] `src/routes/_admin/settings.tsx` -- Layout + auth guard
- [ ] `src/routes/_admin/settings/index.tsx` -- Redirect to general
- [ ] `src/routes/_admin/settings/general.tsx` -- General Settings
- [ ] `src/routes/_admin/settings/reading.tsx` -- Reading Settings
- [ ] `src/routes/_admin/settings/writing.tsx` -- Writing Settings
- [ ] `src/routes/_admin/settings/discussion.tsx` -- Discussion Settings
- [ ] `src/routes/_admin/settings/permalinks.tsx` -- Permalink Settings
- [ ] `src/routes/_admin/settings/privacy.tsx` -- Privacy Settings

### Phase 6: Import/Export
- [ ] `src/components/settings/ImportExport.tsx` -- Import/export UI

---

## Edge Cases & Gotchas

1. **Concurrent editing detection:** When the Convex subscription fires with new data while the user has unsaved changes, do NOT overwrite the form. Instead, show a toast: "Settings were updated by another administrator." The user can choose to save (their changes win) or reset (loads the other admin's changes). Deep comparison is needed to detect if the incoming data actually differs from the user's current values.

2. **Form reset race condition:** After calling `handleSave`, the dirty state must be reset IMMEDIATELY (by updating `initialValues` to the current form values), not after the Convex subscription fires with the new data. Otherwise, there is a brief window where `isDirty` is still true, and the navigation guard could trigger falsely.

3. **Stale page/category references:** When a page or category referenced in settings is deleted, the select component should show a warning badge: "Selected page no longer exists." The form should still be savable (clearing the reference saves null), but the user should be informed.

4. **Timezone data size:** The full IANA timezone list has 250+ entries. The ComboboxField must handle this efficiently with virtualized rendering or search-first (showing only search results, not the full list on open).

5. **Date format custom input:** When the user selects "Custom" in the date format radio group, they need to type a custom format string. The live preview must handle invalid format strings gracefully (show "Invalid format" instead of crashing).

6. **Discussion page re-renders:** With 24 fields, naive implementation would re-render the entire page on every field change. Use TanStack Form's `form.Field` with proper scope to ensure only the changed field's subtree re-renders.

7. **Word list textarea scrolling:** The moderation word list and disallowed word list textareas may contain thousands of lines. The textarea must have a sensible max-height with vertical scrolling. Consider `rows={8}` with `resize="vertical"`.

8. **Permalink change requires confirmation:** Before saving permalink changes, show the `PermalinkChangeDialog`. The save flow must be: validate -> show dialog -> wait for confirm -> save. If the user cancels, the save does not proceed.

9. **Save button keyboard shortcut vs browser save:** Ctrl+S in browsers triggers a "Save Page" dialog. The keyboard shortcut handler must call `e.preventDefault()` to suppress the browser behavior.

10. **Loading state skeleton:** The skeleton must match the expected layout dimensions to prevent layout shift when data loads. Each settings page has a known number of sections and approximate number of fields per section.

11. **Mobile layout:** On small screens, the horizontal field layout (label left, input right) must collapse to stacked (label above, input below). Use Tailwind responsive classes: `flex-col md:flex-row`.

12. **Empty initial state (fresh installation):** On first load with no settings stored, `useSettingsForm` receives `null` from the query. The form initializes with code-defined defaults from the Settings System. All fields should render with default values, and saving writes the first settings document.
