import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { BlockPageRequest } from "../src/templates/sdk/block-data/portable/postGridContracts";
import workshop from "./assets/ceramic-workshop-editorial.png";
import mug from "./assets/aster-house-camp-mug.png";
import notebook from "./assets/aster-house-field-notebook.png";
export const demoStories = [
  ["The quiet work of making", "A morning in the studio, where familiar materials become objects worth keeping.", workshop, "A sunlit ceramic workshop"],
  ["Objects with a place", "A well-used cup. A generous table. Small things that make a room feel like yours.", mug, "A ceramic camp mug"],
  ["The pages we come back to", "A field notebook for observations, unfinished ideas, and the details of an ordinary day.", notebook, "An open field notebook"],
  ["A table for the changing season", "Simple rituals, thoughtful details, and a little room for the unexpected.", workshop, "Handmade vessels in the studio"],
  ["The first hour of the day", "Before the world asks for our attention, a warm cup and a window full of light.", mug, "A quiet morning cup"],
  ["Notes from a slower afternoon", "Finding a different pace in the places and practices closest to home.", notebook, "A notebook for afternoon observations"],
  ["Materials that tell a story", "Marks of use, traces of care, and the beauty that arrives with time.", workshop, "A studio of natural materials"],
  ["Room for a little ritual", "A small collection of everyday practices that help a house become a home.", mug, "An everyday handmade mug"],
  ["Keep something unfinished", "Leave a page open. There is always another detail worth paying attention to.", notebook, "A notebook waiting for a new idea"],
];
const subjects = demoStories;
/** Explicit synthetic records for BlockDemo only. Production readers never import this module. */
export function resolvePostGridDemo(tree: unknown, scope: DataScope, policy: ResolverPolicy, request: BlockPageRequest = {}, storyHref?: (index: number) => string) {
  return resolveCanonicalData(tree,scope,policy,async()=>({page:null}),undefined,undefined,async args=>{
    const offset=args.cursor ? Number(args.cursor.replace(/^demo-grid:/u,'')) : 0;
    if(!Number.isInteger(offset)||offset<0||offset>subjects.length || (args.cursor && args.cursor!==`demo-grid:${offset}`)) throw Error('Invalid synthetic grid position');
    const selected=subjects.map(([title,excerpt,src,alt],index)=>({id:`demo-grid-post-${index}`,title,href:storyHref?.(index) ?? `/blog/demo-story-${index}`,excerpt:args.showExcerpt?excerpt:null,publishedAt:1788566400000-index*86400000,author:'Aster Journal',image:{src:src.startsWith('/')?src:`/${src}`,alt},
      category:'demo-category',tag:index%2?'demo-process':'demo-materials',authorId:'demo-author'}))
      .filter(post=>(!args.query.category||post.category===args.query.category)&&(!args.query.tag||post.tag===args.query.tag)&&(!args.query.author||post.authorId===args.query.author));
    return {items:selected.slice(offset,offset+args.limit).map(({category:_category,tag:_tag,authorId:_authorId,...post})=>post),cursor:args.cursor,
      nextCursor:offset+args.limit<selected.length?`demo-grid:${offset+args.limit}`:null};
  },request);
}
