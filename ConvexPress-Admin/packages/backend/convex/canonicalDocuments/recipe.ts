import type { RenderMedia } from "./foundation/renderResources";
import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { evaluateMembershipAccess } from "../membership/access";
import { SourceByteLedger } from "./sourceBudget";
import { recipeArgsSchema, recipeResultSchema, type RecipeResult } from "./foundation/recipeContracts";

/** Only the saved recipe in this installation may be projected. Drafts, scan
 * originals, author account details and extraction metadata never reach a block. */
export async function readRecipe(ctx:QueryCtx,rawArgs:unknown,budget=new RequestReadLedger(),sources=new SourceByteLedger(),now=Date.now()):Promise<RecipeResult> {
 const args=recipeArgsSchema.parse(rawArgs);
 const id=args.recipe?ctx.db.normalizeId("recipes",args.recipe):null;
 if(!id||!await isPluginEnabled(ctx,"recipes",budget))return {recipe:null};
 if(!(await evaluateMembershipAccess(ctx,{resourceType:"route",resourceIdOrKey:"/recipes"},budget)).allowed)return {recipe:null};
 sources.beforeRead();budget.beforeRead();
 const recipe=budget.record(await ctx.db.get("recipes",id));
 if(!recipe)return {recipe:null};
 sources.record("recipe",recipe);
 if(recipe.status!=="publish")return {recipe:null};
 if(recipe.publishedAt!==undefined&&recipe.publishedAt>now){budget.noteAuthorizationBoundary(recipe.publishedAt,now);return {recipe:null};}
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.slug)||recipe.slug.length>120)return {recipe:null};
 const href=`/recipes/${recipe.slug}`;
 if(!(await evaluateMembershipAccess(ctx,{resourceType:"route",resourceIdOrKey:href},budget)).allowed)return {recipe:null};
 let image:RenderMedia|null=null;
 if(recipe.featuredImageId){
  sources.beforeRead();budget.beforeRead();const media=budget.record(await ctx.db.get("media",recipe.featuredImageId));
  if(media)sources.record("media",media);
  if(media&&media.status==="active"&&media.mimeType?.startsWith("image/")){
   let src:string|null=null;
   if(media.storageId){budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}
   src??=media.url??null;
   if(src)image={src,alt:media.altText??recipe.title};
  }
 }
 return recipeResultSchema.parse({recipe:{id:recipe._id,title:recipe.title,slug:recipe.slug,href,
  description:recipe.description??recipe.excerpt??null,image,
  prepMinutes:recipe.prepMinutes??null,cookMinutes:recipe.cookMinutes??null,totalMinutes:recipe.totalMinutes??null,
  servings:recipe.servings??null,yieldText:recipe.yieldText??null,difficulty:recipe.difficulty??null,
  ingredients:recipe.ingredients,instructions:recipe.instructions,notes:recipe.notes??null,nutrition:recipe.nutrition??null}});
}
