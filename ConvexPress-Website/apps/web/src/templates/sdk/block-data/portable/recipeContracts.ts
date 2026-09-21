import { z } from "zod";
import { renderMediaSchema } from "./renderResources";
export const recipeArgsSchema = z.strictObject({ recipe: z.string().min(1).max(256).optional() });
const text = z.string().max(12000);
const minutes = z.number().finite().min(0).max(525600).nullable();
export const recipeCardSchema = z.strictObject({
 id: z.string().min(1).max(256), title: z.string().min(1).max(500),
 slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
 href: z.string().max(256), description: text.nullable(), image: renderMediaSchema.nullable(),
 prepMinutes: minutes, cookMinutes: minutes, totalMinutes: minutes,
 servings: z.string().max(500).nullable(), yieldText: z.string().max(500).nullable(),
 difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
 ingredients: z.array(z.string().max(2000)).max(200),
 instructions: z.array(text).max(200), notes: text.nullable(),
 nutrition: z.strictObject({calories:z.string().max(200).optional(),protein:z.string().max(200).optional(),carbs:z.string().max(200).optional(),fat:z.string().max(200).optional(),fiber:z.string().max(200).optional(),sugar:z.string().max(200).optional()}).nullable(),
}).superRefine((recipe,ctx)=>{if(recipe.href!==`/recipes/${recipe.slug}`)ctx.addIssue({code:"custom",path:["href"],message:"Recipe link must match its public slug."});});
export const recipeResultSchema = z.strictObject({recipe:recipeCardSchema.nullable()});
export type RecipeArgs=z.infer<typeof recipeArgsSchema>;
export type RecipeResult=z.infer<typeof recipeResultSchema>;
export function recipeMatchesArgs(args:RecipeArgs,result:RecipeResult):boolean {
 return result.recipe===null || result.recipe.id===args.recipe;
}
