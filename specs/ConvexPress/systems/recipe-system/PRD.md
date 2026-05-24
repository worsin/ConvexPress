# PRD: Recipe System

> **Project:** ConvexPress — unified CMS + commerce. Recipes are a first-class structured content type, modeled after WP Recipe Maker.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/recipe-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** `/experts:recipe-system` (to be created)
> **Status:** Shipped ~55%. Core CRUD + ingredient + instruction structures + categories live; nutrition calc + print-friendly + structured data + commerce integration Wave 11.

---

## Integration with ConvexPress

**Positioning:** internal extension (`recipes`).
**Extension gate:** `recipesEnabled` in Settings.
**Code lives at:** `convex/recipes/` (queries, mutations, actions, validators) + `schema/recipes.ts` (recipe_categories + recipes + recipe_ingredients + recipe_instructions + recipe_nutrition + recipe_reviews).
**Admin UI:** `apps/web/src/routes/.../admin/recipes/`.
**Website UI:** `apps/web/src/routes/_marketing/recipes/` + `_marketing/recipes/$slug.tsx`.

**Consumes these ConvexPress systems:**

- **Content Editor System** — recipe-body Tiptap editor with custom recipe blocks.
- **Taxonomy System** — recipe categories + tags.
- **Media System** — hero image, step-by-step photos, video.
- **Comment System** — recipe reviews (reuses comment infra with rating extension).
- **SEO System** — Schema.org Recipe structured data on public pages (for Google rich results).
- **Search System** — recipes indexed.
- **Product System** — optional "buy ingredients" link-out per ingredient.
- **Revision System** — recipe versioning mirrors post revisions.
- **Event Dispatcher** — emits `recipe.created / published / rated / printed`.

**WordPress analog:** WP Recipe Maker, Tasty Recipes, Recipe Card Blocks. We match WP Recipe Maker's feature set — hero + metadata (prep/cook/serves) + ingredients + instructions + notes + nutrition + rating + video — natively in ConvexPress.

---

## 1. Overview

### 1.1 Purpose

Authoring + publishing of rich recipe content for food blogs, cooking
stores, and restaurant sites. First-class structured fields (ingredients,
instructions, nutrition, timing) produce Schema.org Recipe structured
data for Google, print-friendly single-page layouts, and optional
ingredient → product cart-add integration.

### 1.2 Scope

**In Scope:**
- Recipe CRUD with structured fields: title, slug, hero image, summary, prep/cook/total time, servings, cuisine, course, difficulty, keywords.
- Ingredient list with quantity / unit / name / optional product link + notes.
- Instruction list with ordered steps + per-step image + optional timer.
- Notes + tips field.
- Category + tag assignment.
- Video embed (YouTube/Vimeo/uploaded).
- Customer reviews + 5-star rating with helpful-flag.
- Revision history (mirrors posts).
- Publish / draft / scheduled / archived status.
- **Wave 11:** Nutrition calculator — per-ingredient macro lookup + total per serving (calories, protein, carbs, fat, fiber, sugar).
- **Wave 11:** Print-friendly layout (no sidebar, no ads, compact).
- **Wave 11:** Schema.org Recipe JSON-LD emission for rich-result eligibility.
- **Wave 11:** "Shop ingredients" integration — each ingredient optionally links to a ConvexPress product → one-click add-to-cart all linked items.
- **Wave 11:** Scaling tool — user multiplies servings, ingredient quantities re-calculate.
- **Wave 11:** Imperial/metric unit toggle.

**Out of Scope:**
- Meal planning / weekly menus — separate future Meal Plan System.
- Grocery list export — depends on Meal Plan.

---

## 2. Data Model

### 2.1 Exists

```ts
recipe_categories        // taxonomy (hierarchical)
recipes                  // header with status, title, slug, servings, prepTime, cookTime, difficulty, cuisine, keywords
recipe_ingredients       // per-recipe rows with quantity, unit, name, productId?
recipe_instructions      // per-recipe ordered steps with text, image, timerSeconds
recipe_nutrition         // per-recipe macros block
recipe_reviews           // rating + review text
```

### 2.2 Wave 11

```ts
// Add to recipes:
videoEmbedUrl: v.optional(v.string()),
ratingAverage: v.optional(v.number()),       // denormalized
printLayoutPreference: v.optional(v.string()),

// NEW ingredient → product link table (multi-store support):
recipe_ingredient_products: defineTable({
  ingredientId: v.id("recipe_ingredients"),
  productId: v.id("commerce_products"),
  storeName: v.optional(v.string()),         // "Local Harvest Co-op"
  quantity: v.number(),                      // how many product units equal the recipe quantity
  isDefault: v.optional(v.boolean()),
}).index("by_ingredient", ["ingredientId"]).index("by_product", ["productId"]);

// NEW nutrition lookup table (shared across recipes):
nutrition_ingredients: defineTable({
  name: v.string(),                          // "chicken breast, boneless"
  caloriesPer100g: v.number(),
  proteinPer100g: v.number(),
  carbsPer100g: v.number(),
  fatPer100g: v.number(),
  fiberPer100g: v.optional(v.number()),
  sugarPer100g: v.optional(v.number()),
  sodiumPer100mg: v.optional(v.number()),
}).index("by_name", ["name"]);
```

---

## 3. Functions

### 3.1 Exists
- `recipes.queries.list / getById / getBySlug / listByCategory / listByTag`
- `recipes.mutations.create / update / publish / archive / delete`
- `recipes.mutations.upsertIngredients / upsertInstructions / upsertNutrition`
- `recipes.reviews.add / delete / list`
- `recipes.actions.*` — future room for import actions

### 3.2 Wave 11
- `recipes.nutrition.computeFromIngredients(recipeId)` — sums `nutrition_ingredients` data
- `recipes.nutrition.lookup(name)` — fuzzy match ingredient → nutrition row
- `recipes.seo.buildJsonLd(recipeId)` — Schema.org Recipe emission
- `recipes.mutations.linkIngredientToProducts(ingredientId, productIds, defaults)` — cart-add integration
- `recipes.queries.getShopableIngredients(recipeId)` — returns linked products
- `recipes.mutations.addAllIngredientsToCart(recipeId, userId)` — cart helper

---

## 4. Admin UI

### 4.1 Exists
- `/admin/recipes` — list + filter
- `/admin/recipes/new` + `/admin/recipes/$id/edit` — rich editor with tabbed sections (Ingredients, Instructions, Nutrition, Reviews)

### 4.2 Wave 11
- Nutrition auto-calc button on the editor
- Ingredient-to-product link picker
- Print-preview button
- Schema.org preview panel

---

## 5. Website UI

### 5.1 Exists
- `/recipes` — grid + category filter
- `/recipes/$slug` — recipe detail page

### 5.2 Wave 11
- Print-friendly route `/recipes/$slug/print`
- "Shop ingredients" button with cart-add
- Imperial/metric toggle
- Serving-scaler (2× / 0.5×)
- Schema.org JSON-LD in the `<head>`

---

## 6. Events

- `recipe.created / published / updated / archived / deleted`
- `recipe.rated / review_posted`
- `recipe.printed` — analytics signal
- `recipe.ingredients_added_to_cart`

---

## 7. Acceptance criteria

### 7.1 Existing (must not regress)
- [x] Recipe CRUD with structured fields
- [x] Ingredient + instruction lists
- [x] Category + tag
- [x] Reviews + 5-star ratings
- [x] Publish / draft state
- [x] Revision history

### 7.2 Wave 11
- [ ] Nutrition table + computation + admin UI button
- [ ] Schema.org Recipe JSON-LD on public pages
- [ ] Print-friendly layout
- [ ] Ingredient-to-product linking + "Shop ingredients" cart-add
- [ ] Imperial/metric toggle
- [ ] Serving-scaler
- [ ] Video embed field + player
- [ ] Denormalized `ratingAverage`

---

## 8. Definition of Done

1. §7.2 boxes ticked.
2. Google Rich Results Test validates JSON-LD on 3 sample published recipes.
3. Print view renders one recipe in <1 page with no site chrome.
4. "Shop ingredients" flow from a recipe into cart on a test store completes.

---

## 9. References

- Code: `convex/recipes/*`, `convex/schema/recipes.ts`
- Admin UI: `apps/web/src/routes/.../admin/recipes/`
- Website UI: `apps/web/src/routes/_marketing/recipes/`
- Sibling PRDs: `post-system`, `page-system`, `content-editor-system`, `taxonomy-system`, `media-system`, `seo-system`, `search-system`, `product-system`, `cart-system`, `revision-system`, `comment-system`
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
