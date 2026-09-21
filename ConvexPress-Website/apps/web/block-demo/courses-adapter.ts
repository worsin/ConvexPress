import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
import type {BlockPageRequest} from '../src/templates/sdk/block-data/portable/postGridContracts';
import workshop from './assets/ceramic-workshop-editorial.png';
import notebook from './assets/aster-house-field-notebook.png';
const media=(src:string)=>src.startsWith('/')?src:`/${src}`;
export const demoCourses=['Working with clay','Everyday typography','A practice of observation','A study in colour','Keeping a field notebook','Finding your creative rhythm','Designing with purpose'].map((title,i)=>({id:`demo-course-${i}`,title,slug:`studio-course-${i}`,href:`/courses/studio-course-${i}`,excerpt:['A thoughtful introduction to clay, from the first handful of earth to a form that feels your own.','Discover how small choices in letterforms, spacing, and rhythm change the way we read.','Slow down, pay attention, and find fresh ideas in the details of everyday life.','Explore colour through small experiments in harmony, contrast, and the changing light.','Build a habit of recording what you notice, with words, sketches, and collected details.','Find a sustainable pace for making things, returning to ideas, and beginning again.','Learn to turn a clear intention into useful, considered design.'][i],image:i===0?{src:media(workshop),alt:'A sunlit ceramic workshop with handmade vessels'}:i===1||i===4?{src:media(notebook),alt:'A clothbound field notebook resting on stone'}:null,progress:i===0?{completed:5,total:12,percent:42}:i===1?{completed:8,total:8,percent:100}:null}));
export function resolveCoursesDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
 return resolveCanonicalData(tree,scope,policy,async()=>null,undefined,undefined,undefined,request,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async args=>{
  const offset=args.cursor?Number(args.cursor.slice('demo-courses:'.length)):0;
  if(!Number.isInteger(offset)||offset<0||offset>demoCourses.length||(args.cursor&&args.cursor!==`demo-courses:${offset}`))throw Error('Invalid synthetic course cursor');
  return {state:'ready',items:demoCourses.slice(offset,offset+args.limit),cursor:args.cursor,nextCursor:offset+args.limit<demoCourses.length?`demo-courses:${offset+args.limit}`:null};
 });
}
