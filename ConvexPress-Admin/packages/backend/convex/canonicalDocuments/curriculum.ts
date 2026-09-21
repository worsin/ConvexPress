import {z} from 'zod';
import {streamQuery} from 'convex-helpers/server/pagination';
import {sha256Hex} from '@convexpress/site-contract';
import schema from '../schema';
import type {Doc,Id} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {isPluginEnabled} from '../helpers/plugins';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {createMembershipAccessEvaluator} from '../membership/access';
import {CanonicalDataError,stableKey,type DataScope} from './foundation/contracts';
import {curriculumArgsSchema,curriculumResultSchema,type CurriculumResult} from './foundation/curriculumContracts';
const keySchema=z.tuple([z.number().finite(),z.number().finite(),z.string().min(1).max(256)]);
const stateSchema=z.strictObject({root:keySchema.nullable(),topic:z.strictObject({id:z.string().min(1).max(256),after:keySchema.nullable()}).nullable()});
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),position:stateSchema});
type Position=z.infer<typeof stateSchema>;
/** Published outlines are public course metadata. Lesson payloads and claims of
 * lesson availability are deliberately absent; the course player owns access. */
export async function readCurriculum(ctx:QueryCtx,input:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger()):Promise<CurriculumResult>{
 const args=curriculumArgsSchema.parse(input),empty=():CurriculumResult=>({course:null,groups:[],cursor:args.cursor,nextCursor:null});
 const binding=sha256Hex(stableKey({scope,documentId,course:args.course??null}));
 let position:Position={root:null,topic:null};
 if(args.cursor){
  let cursor:z.infer<typeof cursorSchema>;try{cursor=cursorSchema.parse(JSON.parse(args.cursor));}catch{throw new CanonicalDataError('CURRICULUM_CURSOR_FORMAT','cursor','Invalid curriculum cursor');}
  position=cursor.position;
  if(cursor.binding!==binding||[position.root,position.topic?.after].some(key=>key&&!ctx.db.normalizeId('lms_nodes',key[2]))||position.topic&&(!ctx.db.normalizeId('lms_nodes',position.topic.id)||position.root?.[2]!==position.topic.id))throw new CanonicalDataError('CURRICULUM_CURSOR_SCOPE','cursor','Curriculum cursor belongs to another course, document or environment');
 }
 if(!args.course||!await isPluginEnabled(ctx,'lms',budget))return empty();
 const courseId=ctx.db.normalizeId('lms_courses',args.course);if(!courseId)return empty();
 budget.beforeRead();const course=budget.record(await ctx.db.get('lms_courses',courseId));if(!course||course.status!=='published')return empty();
 const evaluate=createMembershipAccessEvaluator(ctx,budget),href='/courses/'+course.slug;
 for(const route of ['/courses',href])if(!(await evaluate({resourceType:'route',resourceIdOrKey:route})).allowed)return empty();
 let activeTopic:Doc<'lms_nodes'>|null=null;
 if(position.topic){
  budget.beforeRead();const topic=budget.record(await ctx.db.get('lms_nodes',position.topic.id as Id<'lms_nodes'>));
  if(topic&&topic.courseId===courseId&&topic.kind==='topic'&&!topic.parentId){
   if(topic.position!==position.root![0]||topic._creationTime!==position.root![1])throw new CanonicalDataError('CURRICULUM_CHANGED','cursor','The curriculum changed. Return to its first page.');
   activeTopic=topic;
  }else position.topic=null;
 }
 const nextSibling=async(parent:Id<'lms_nodes'>|undefined,after:z.infer<typeof keySchema>|null)=>{
  const iterator=streamQuery(ctx,{schema,table:'lms_nodes',index:'by_course_parent_position',order:'asc',startIndexKey:after?[courseId,parent,...after]:[courseId,parent],startInclusive:after===null,endIndexKey:[courseId,parent],endInclusive:true});
  try{budget.beforeRead();const next=await iterator.next();if(next.done)return null;const [node,key]=next.value;budget.record(node);return {node,key:keySchema.parse(key.slice(2))};}finally{await iterator.return(undefined);}
 };
 const nextNode=async()=>{
  if(position.topic){
   const child=await nextSibling(position.topic.id as Id<'lms_nodes'>,position.topic.after);
   if(child){position.topic.after=child.key;return {node:child.node,parent:activeTopic};}
   position.topic=null;activeTopic=null;
  }
  const root=await nextSibling(undefined,position.root);if(!root)return null;
  position.root=root.key;
  if(root.node.kind==='topic'){position.topic={id:root.node._id,after:null};activeTopic=root.node;}
  return {node:root.node,parent:null};
 };
 const groups:CurriculumResult['groups']=[];let nextCursor:string|null=null;
 for(let visited=0;visited<=8;visited++){
  const bookmark=stateSchema.parse(position),next=await nextNode();if(!next)break;
  if(visited===8){nextCursor=JSON.stringify({version:1,binding,position:bookmark});if(next.parent){const group=groups.find(g=>g.topic?.id===next.parent!._id);if(group?.topic)group.topic.continues=true;}break;}
  const {node,parent}=next;
  if(node.courseId!==courseId)continue;
  if(node.kind==='topic'&&!node.parentId){groups.push({topic:{id:node._id,title:node.title,continued:false,continues:false},entries:[]});continue;}
  if(node.kind!=='lesson'&&node.kind!=='section_heading')continue;
  if(node.parentId&&(!parent||parent._id!==node.parentId))continue;
  let group=groups[groups.length-1];
  if(!group||(group.topic?.id??null)!==(parent?._id??null)){
   group={topic:parent?{id:parent._id,title:parent.title,continued:true,continues:false}:null,entries:[]};groups.push(group);
  }
  group.entries.push({id:node._id,title:node.title,kind:node.kind});
 }
 return curriculumResultSchema.parse({course:{id:course._id,title:course.title,slug:course.slug,href},groups,cursor:args.cursor,nextCursor});
}
