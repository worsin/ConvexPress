// @ts-nocheck
import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  LoaderIcon,
  SparklesIcon,
  TimerIcon,
  UtensilsCrossedIcon,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Difficulty = "easy" | "medium" | "hard";
type Status = "draft" | "publish" | "trash";

interface RecipeEditorProps {
  recipeId?: Id<"recipes">;
}

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value: readonly string[] | undefined) {
  return (value ?? []).join("\n");
}

export function RecipeEditor({ recipeId }: RecipeEditorProps) {
  const navigate = useNavigate();
  const recipe = useQuery(
    api.recipes.queries.get,
    recipeId ? { recipeId } : "skip",
  );
  const categories = useQuery(api.recipes.queries.listCategories, {}) ?? [];
  const createRecipe = useMutation(api.recipes.mutations.createRecipe);
  const updateRecipe = useMutation(api.recipes.mutations.updateRecipe);
  const extractRecipeFromImage = useAction(api.recipes.actions.extractRecipeFromImage);

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [featuredImageId, setFeaturedImageId] = useState<Id<"media"> | undefined>();
  const [scanMediaId, setScanMediaId] = useState<Id<"media"> | undefined>();
  const [prepMinutes, setPrepMinutes] = useState("");
  const [cookMinutes, setCookMinutes] = useState("");
  const [totalMinutes, setTotalMinutes] = useState("");
  const [servings, setServings] = useState("");
  const [yieldText, setYieldText] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [instructionsText, setInstructionsText] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!recipeId || !recipe) return;
    setTitle(recipe.title ?? "");
    setExcerpt(recipe.excerpt ?? "");
    setDescription(recipe.description ?? "");
    setStatus((recipe.status as Status) ?? "draft");
    setFeaturedImageId(recipe.featuredImageId);
    setScanMediaId(recipe.scanMediaId);
    setPrepMinutes(recipe.prepMinutes ? String(recipe.prepMinutes) : "");
    setCookMinutes(recipe.cookMinutes ? String(recipe.cookMinutes) : "");
    setTotalMinutes(recipe.totalMinutes ? String(recipe.totalMinutes) : "");
    setServings(recipe.servings ?? "");
    setYieldText(recipe.yieldText ?? "");
    setDifficulty((recipe.difficulty as Difficulty | undefined) ?? "");
    setIngredientsText(arrayToLines(recipe.ingredients));
    setInstructionsText(arrayToLines(recipe.instructions));
    setNotes(recipe.notes ?? "");
    setSelectedCategories(
      new Set(recipe.categoryIds.map((categoryId) => categoryId.toString())),
    );
    setIsFeatured(Boolean(recipe.isFeatured));
  }, [recipe, recipeId]);

  if (recipeId && recipe === undefined) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (recipeId && recipe === null) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">Recipe not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The requested recipe could not be loaded.
        </p>
      </div>
    );
  }

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleImport = async () => {
    if (!scanMediaId) {
      toast.error("Select a scanned recipe image first.");
      return;
    }

    setIsImporting(true);
    try {
      const extracted = await extractRecipeFromImage({ mediaId: scanMediaId });
      setTitle(extracted.title ?? title);
      setExcerpt(extracted.excerpt ?? excerpt);
      setDescription(extracted.description ?? description);
      setPrepMinutes(extracted.prepMinutes ? String(extracted.prepMinutes) : "");
      setCookMinutes(extracted.cookMinutes ? String(extracted.cookMinutes) : "");
      setTotalMinutes(extracted.totalMinutes ? String(extracted.totalMinutes) : "");
      setServings(extracted.servings ?? servings);
      setYieldText(extracted.yieldText ?? yieldText);
      setDifficulty((extracted.difficulty as Difficulty | undefined) ?? "");
      setIngredientsText(arrayToLines(extracted.ingredients));
      setInstructionsText(arrayToLines(extracted.instructions));
      setNotes(extracted.notes ?? notes);

      if (extracted.categorySuggestions?.length) {
        const matched = categories
          .filter((category) =>
            extracted.categorySuggestions.some(
              (suggestion) =>
                suggestion.toLowerCase() === category.name.toLowerCase(),
            ),
          )
          .map((category) => category._id.toString());
        setSelectedCategories(new Set(matched));
      }

      toast.success("Recipe draft extracted from the image.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to extract recipe",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Recipe title is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title,
        excerpt,
        description,
        status,
        featuredImageId,
        scanMediaId,
        categoryIds: [...selectedCategories] as Id<"recipe_categories">[],
        prepMinutes: prepMinutes ? Number(prepMinutes) : undefined,
        cookMinutes: cookMinutes ? Number(cookMinutes) : undefined,
        totalMinutes: totalMinutes ? Number(totalMinutes) : undefined,
        servings,
        yieldText,
        difficulty: difficulty || undefined,
        ingredients: linesToArray(ingredientsText),
        instructions: linesToArray(instructionsText),
        notes,
        aiExtractedFromScan: Boolean(scanMediaId),
        isFeatured,
      };

      if (recipeId) {
        await updateRecipe({ recipeId, ...payload });
        toast.success("Recipe updated.");
      } else {
        const newRecipeId = await createRecipe(payload);
        toast.success("Recipe created.");
        await navigate({
          to: "/recipes/$recipeId/edit",
          params: { recipeId: newRecipeId },
          replace: true,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save recipe",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {recipeId ? "Edit Recipe" : "Add New Recipe"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a public recipe with shared media attachments and optional AI
            import from a photographed recipe card.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/recipes">
            <Button variant="outline">Back to Recipes</Button>
          </Link>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <LoaderIcon className="mr-2 size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save Recipe"
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="recipe-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="recipe-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Sunday Tomato Soup"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="recipe-excerpt" className="text-sm font-medium">
                Short description
              </label>
              <Textarea
                id="recipe-excerpt"
                name="excerpt"
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                rows={3}
                placeholder="A cozy, weeknight-ready tomato soup with roasted garlic."
              />
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="recipe-description"
                className="text-sm font-medium"
              >
                Story / Notes
              </label>
              <Textarea
                id="recipe-description"
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                placeholder="Add the intro, cooking notes, substitutions, and serving ideas."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <label htmlFor="recipe-prep" className="text-sm font-medium">
                  Prep minutes
                </label>
                <Input
                  id="recipe-prep"
                  name="prepMinutes"
                  type="number"
                  value={prepMinutes}
                  onChange={(event) => setPrepMinutes(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="recipe-cook" className="text-sm font-medium">
                  Cook minutes
                </label>
                <Input
                  id="recipe-cook"
                  name="cookMinutes"
                  type="number"
                  value={cookMinutes}
                  onChange={(event) => setCookMinutes(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="recipe-total" className="text-sm font-medium">
                  Total minutes
                </label>
                <Input
                  id="recipe-total"
                  name="totalMinutes"
                  type="number"
                  value={totalMinutes}
                  onChange={(event) => setTotalMinutes(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <label
                  htmlFor="recipe-servings"
                  className="text-sm font-medium"
                >
                  Servings
                </label>
                <Input
                  id="recipe-servings"
                  name="servings"
                  value={servings}
                  onChange={(event) => setServings(event.target.value)}
                  placeholder="6"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="recipe-yield" className="text-sm font-medium">
                  Yield
                </label>
                <Input
                  id="recipe-yield"
                  name="yieldText"
                  value={yieldText}
                  onChange={(event) => setYieldText(event.target.value)}
                  placeholder="1 large pot"
                />
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="recipe-difficulty"
                  className="text-sm font-medium"
                >
                  Difficulty
                </label>
                <Select
                  value={difficulty || undefined}
                  onValueChange={(value) => setDifficulty(value as Difficulty)}
                >
                  <SelectTrigger id="recipe-difficulty" className="w-full">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="recipe-ingredients"
                className="text-sm font-medium"
              >
                Ingredients
              </label>
              <Textarea
                id="recipe-ingredients"
                name="ingredients"
                value={ingredientsText}
                onChange={(event) => setIngredientsText(event.target.value)}
                rows={8}
                placeholder={"1 tbsp olive oil\n1 yellow onion, diced\n2 cloves garlic"}
              />
              <p className="text-xs text-muted-foreground">
                One ingredient per line.
              </p>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="recipe-instructions"
                className="text-sm font-medium"
              >
                Instructions
              </label>
              <Textarea
                id="recipe-instructions"
                name="instructions"
                value={instructionsText}
                onChange={(event) => setInstructionsText(event.target.value)}
                rows={8}
                placeholder={"Heat the oil in a large pot.\nAdd onions and cook until translucent."}
              />
              <p className="text-xs text-muted-foreground">
                One instruction step per line.
              </p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="recipe-notes" className="text-sm font-medium">
                Cook notes
              </label>
              <Textarea
                id="recipe-notes"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Storage, swaps, or serving notes."
              />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Recipe settings
            </h2>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="recipe-status" className="text-sm font-medium">
                  Status
                </label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as Status)}
                >
                  <SelectTrigger id="recipe-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="publish">Published</SelectItem>
                    <SelectItem value="trash">Trash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label
                htmlFor="recipe-featured"
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  id="recipe-featured"
                  checked={isFeatured}
                  onCheckedChange={(value) => setIsFeatured(Boolean(value))}
                />
                Feature this recipe on the frontend
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <UtensilsCrossedIcon className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Media</h2>
            </div>
            <div className="mt-4 grid gap-4">
              <MediaPicker
                label="Featured Image"
                allowedTypes={["image"]}
                selectedId={featuredImageId}
                onSelect={(mediaId) => setFeaturedImageId(mediaId)}
                onClear={() => setFeaturedImageId(undefined)}
              />
              <MediaPicker
                label="Scanned Recipe Image"
                allowedTypes={["image"]}
                selectedId={scanMediaId}
                onSelect={(mediaId) => setScanMediaId(mediaId)}
                onClear={() => setScanMediaId(undefined)}
              />
              <Button
                variant="outline"
                onClick={() => void handleImport()}
                disabled={isImporting || !scanMediaId}
              >
                {isImporting ? (
                  <>
                    <LoaderIcon className="mr-2 size-4 animate-spin" />
                    Extracting recipe
                  </>
                ) : (
                  <>
                    <SparklesIcon className="mr-2 size-4" />
                    Import from Recipe Image
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                This uses the shared media library. Select an uploaded recipe
                scan and let AI turn it into ingredients and instructions.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <TimerIcon className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Categories
              </h2>
            </div>
            <div className="mt-4 grid gap-2">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recipe categories yet.
                </p>
              ) : (
                categories.map((category) => (
                  <label
                    htmlFor={`recipe-category-${category._id}`}
                    key={category._id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={`recipe-category-${category._id}`}
                      checked={selectedCategories.has(category._id.toString())}
                      onCheckedChange={() =>
                        toggleCategory(category._id.toString())
                      }
                    />
                    <span>{category.name}</span>
                  </label>
                ))
              )}
              <Link to="/recipes/categories" className="text-xs text-primary underline-offset-4 hover:underline">
                Manage categories
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
