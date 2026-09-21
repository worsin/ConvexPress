import { useState } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import type { RecipeResult } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/recipeContracts";
import "./render.css";
type Recipe=NonNullable<RecipeResult["recipe"]>;
export function recipeStructuredData(recipe:Recipe) {
 const duration=(minutes:number|null)=>minutes===null?undefined:`PT${Math.round(minutes*60)}S`;
 const nutrition=recipe.nutrition;
 return {"@context":"https://schema.org","@type":"Recipe",name:recipe.title,
  ...(recipe.description?{description:recipe.description}:{}),...(recipe.image?{image:recipe.image.src}:{}),
  prepTime:duration(recipe.prepMinutes),cookTime:duration(recipe.cookMinutes),totalTime:duration(recipe.totalMinutes),
  recipeYield:recipe.yieldText||recipe.servings||undefined,recipeIngredient:recipe.ingredients,
  recipeInstructions:recipe.instructions.map(text=>({"@type":"HowToStep",text})),
  ...(nutrition&&Object.values(nutrition).some(Boolean)?{nutrition:{"@type":"NutritionInformation",calories:nutrition.calories,proteinContent:nutrition.protein,carbohydrateContent:nutrition.carbs,fatContent:nutrition.fat,fiberContent:nutrition.fiber,sugarContent:nutrition.sugar}}:{})};
}
function Ingredients({items}:{items:string[]}) {
 const [checked,setChecked]=useState<Set<number>>(()=>new Set());
 return <><p className="cp-recipe-check-hint">Check off as you go.</p><ul className="cp-recipe-ingredients">{items.map((item,index)=><li key={index}><label><input type="checkbox" checked={checked.has(index)} onChange={()=>setChecked(previous=>{const next=new Set(previous);if(next.has(index))next.delete(index);else next.add(index);return next;})}/><span>{item}</span></label></li>)}</ul></>;
}
function Time({label,minutes}:{label:string;minutes:number|null}) {return minutes===null?null:<div><dt>{label}</dt><dd>{minutes}<span> min</span></dd></div>;}
export default defineDataBlock("gallery/recipe-card","recipes.recipe",({data})=>{
 const recipe=data.recipe;
 if(!recipe)return <div className="cp-recipe-empty" data-recipe-state="empty"><P.Heading level={3}>This recipe is unavailable.</P.Heading><P.Text tone="muted">Please check back later.</P.Text></div>;
 const nutritionLabels={calories:"Calories",protein:"Protein",carbs:"Carbohydrates",fat:"Fat",fiber:"Fiber",sugar:"Sugar"};
 const json=JSON.stringify(recipeStructuredData(recipe)).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");
 return <article className="cp-recipe-card" data-recipe-state="ready">
  <header className="cp-recipe-header"><div><P.Eyebrow>From the recipe book</P.Eyebrow><P.Heading>{recipe.title}</P.Heading>{recipe.description&&<p className="cp-recipe-description">{recipe.description}</p>}
   <dl className="cp-recipe-facts"><Time label="Prep" minutes={recipe.prepMinutes}/><Time label="Cook" minutes={recipe.cookMinutes}/><Time label="Total" minutes={recipe.totalMinutes}/>{recipe.servings&&<div><dt>Servings</dt><dd>{recipe.servings}</dd></div>}{recipe.difficulty&&<div><dt>Difficulty</dt><dd className="cp-recipe-difficulty">{recipe.difficulty}</dd></div>}</dl>
   {recipe.yieldText&&<p className="cp-recipe-yield">Makes {recipe.yieldText}</p>}
  </div>{recipe.image&&<figure className="cp-recipe-photo"><img src={recipe.image.src} alt={recipe.image.alt} loading="lazy" width={recipe.image.width} height={recipe.image.height}/></figure>}</header>
  <div className="cp-recipe-method"><section className="cp-recipe-pantry"><h3>Ingredients</h3>{recipe.ingredients.length?<Ingredients key={JSON.stringify([recipe.id,recipe.ingredients])} items={recipe.ingredients}/>:<p>Ingredients have not been provided.</p>}</section>
   <section className="cp-recipe-directions"><h3>In the kitchen</h3>{recipe.instructions.length?<ol>{recipe.instructions.map((step,index)=><li key={index}><span aria-hidden="true" className="cp-recipe-step">{String(index+1).padStart(2,"0")}</span><p>{step}</p></li>)}</ol>:<p>Instructions have not been provided.</p>}</section></div>
  {recipe.notes&&<aside className="cp-recipe-notes"><h3>Cook’s notes</h3><p>{recipe.notes}</p></aside>}
  {recipe.nutrition&&Object.values(recipe.nutrition).some(Boolean)&&<section className="cp-recipe-nutrition"><h3>Nutrition</h3><dl>{Object.entries(recipe.nutrition).filter(([,value])=>value).map(([key,value])=><div key={key}><dt>{nutritionLabels[key as keyof typeof nutritionLabels]}</dt><dd>{value}</dd></div>)}</dl></section>}
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:json}}/>
 </article>;
});
