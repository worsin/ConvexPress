import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
const category={id:'demo-help-start',name:'Getting started',slug:'getting-started'};
const articles=[['Your first page, from idea to published','Create a page, shape the content and share it when you are ready.'],['Find the right template','Choose a starting point that gives your content room to shine.'],['Make it feel like you','Bring your colors, typography and photographs into the picture.'],['Connect your domain','Give your website an address of its own.']].map(([title,excerpt],index)=>({id:'demo-help-'+index,title,excerpt,slug:'guide-'+index,categorySlug:category.slug,categoryName:category.name,href:'/help/'+category.slug+'/guide-'+index}));
export function resolveKnowledgeBaseDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy){
 const args:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
 args[30]=async request=>request.category&&request.category!==category.id?{available:false,category:null,articles:[]}:{available:true,category:request.category?category:null,articles};
 return resolveCanonicalData(...args);
}
