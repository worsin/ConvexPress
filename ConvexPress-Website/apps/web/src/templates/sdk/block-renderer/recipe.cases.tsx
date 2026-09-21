import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import recipeBlock,{recipeStructuredData} from "../../../../../../../blocks/gallery/recipe-card/render";
import {prepareBlocks} from "./model";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import {planCanonicalData} from "../block-data/portable/planner";
import {recipeResultSchema,type RecipeResult} from "../block-data/portable/recipeContracts";
const policy={enabledPlugins:["recipes"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"recipe-test",instanceKey:"isolated"},documentKey:"recipe",revision:"1",viewerKey:"visitor"};
const recipe:NonNullable<RecipeResult["recipe"]>={id:"recipe-1",title:"Beans & </script><script>alert(1)</script>",slug:"beans",href:"/recipes/beans",description:"A slow Sunday supper.",image:null,prepMinutes:0,cookMinutes:120,totalMinutes:null,servings:"4",yieldText:null,difficulty:"easy",ingredients:["Beans","Water"],instructions:["Soak.","Simmer."],notes:"Keep the cooking liquid.",nutrition:{protein:"12 g"}};
const tree=[{id:"recipe-block",name:"gallery/recipe-card",version:1,attrs:{recipe:"recipe-1"}}];
async function install(value:unknown){const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>({recipe:value}));const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});return {host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"gallery/recipe-card":recipeBlock},policy,{media:{}},{grant,current:context}))};}
test("recipe contract requires its real plugin and exact saved identity",async()=>{
 expect(planCanonicalData(tree,current.scope,policy).jobs[0]?.args).toEqual({recipe:"recipe-1"});expect(()=>planCanonicalData(tree,current.scope,{...policy,enabledPlugins:[]})).toThrow();
 await expect(install({...recipe,id:"different"})).rejects.toThrow();expect(()=>recipeResultSchema.parse({recipe:{...recipe,href:"https://evil.invalid"}})).toThrow();
});
test("recipe renders safe ordered content with non-executable structured metadata",async()=>{
 const {render}=await install(recipe);const html=render();
 expect(html).toContain('data-recipe-state="ready"');expect(html).toContain('type="checkbox"');expect(html.indexOf("Soak.")).toBeLessThan(html.indexOf("Simmer."));
 expect(html).not.toContain('<script>alert');const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];expect(scripts).toHaveLength(1);const json=JSON.parse(scripts[0]![1]!);expect(json.name).toBe(recipe.title);expect(json.prepTime).toBe("PT0S");expect(json.cookTime).toBe("PT7200S");expect(json.totalTime).toBeUndefined();expect(json.recipeInstructions).toEqual([{ "@type":"HowToStep",text:"Soak."},{"@type":"HowToStep",text:"Simmer."}]);expect(json.nutrition.proteinContent).toBe("12 g");expect(json.aggregateRating).toBeUndefined();
});
test("recipe access withdrawal and viewer replacement cannot retain recipe details",async()=>{
 const {render,host}=await install(recipe);expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
 const empty=await install(null);const html=empty.render();expect(html).toContain('data-recipe-state="empty"');expect(html).not.toContain('application/ld+json');expect(html).not.toContain('type="checkbox"');expect(html).not.toContain(recipe.title);
});
test("recipe metadata does not invent nutrition, timing or yield",()=>{const result=recipeStructuredData({...recipe,nutrition:null,prepMinutes:null,cookMinutes:null,servings:null});expect(result.nutrition).toBeUndefined();expect(result.prepTime).toBeUndefined();expect(result.cookTime).toBeUndefined();expect(result.recipeYield).toBeUndefined();});
