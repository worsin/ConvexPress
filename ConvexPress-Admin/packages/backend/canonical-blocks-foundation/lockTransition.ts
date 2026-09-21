/** Pure candidate-transition policy, not yet activated in the mutation service.
 * Validation/auth/CAS remain caller responsibilities; lock changes need a
 * separate trusted authority decision, never a request-supplied bypass flag. */
import {z} from 'zod';
import {encodedBytes} from './contracts';
import {canonicalJson} from './shared/fingerprints';
const lockSchema=z.strictObject({move:z.boolean().optional(),remove:z.boolean().optional(),edit:z.boolean().optional()});
export interface LockNode {id:string;children?:LockNode[];lock?:{move?:boolean;remove?:boolean;edit?:boolean};[field:string]:unknown}
export class LockTransitionError extends Error {constructor(readonly code:string,readonly blockId:string,message:string){super(message);this.name='LockTransitionError';}}
function index(tree:readonly LockNode[]){
 const result=new Map<string,{node:LockNode;parent:string|null;siblings:readonly string[]}>();let count=0;
 const visit=(nodes:readonly LockNode[],parent:string|null,depth:number)=>{
  if(!Array.isArray(nodes)||depth>8)throw new LockTransitionError('LOCK_TREE_BUDGET',parent??'root','Expected bounded canonical children');
  const siblings=nodes.map(node=>node.id);
  for(const node of nodes){
   if(++count>80)throw new LockTransitionError('LOCK_TREE_BUDGET',node.id,'Maximum 80 canonical nodes');
   if(typeof node.id!=='string'||!node.id||result.has(node.id))throw new LockTransitionError('INVALID_BLOCK_ID',String(node.id),'Unique block IDs are required');
   if(node.lock!==undefined)lockSchema.parse(node.lock);
   result.set(node.id,{node,parent,siblings});
   if(node.children!==undefined)visit(node.children,node.id,depth+1);
  }
 };
 visit(tree,null,1);return result;
}
export function assertLockTransition(previous:readonly LockNode[],next:readonly LockNode[],authority:{mayChangeLocks:boolean}={mayChangeLocks:false}):void{
 if(encodedBytes(previous)>512*1024||encodedBytes(next)>512*1024)throw new LockTransitionError('LOCK_TREE_BUDGET','root','Lock transitions require bounded authoring documents');
 const mayChangeLocks=z.strictObject({mayChangeLocks:z.boolean()}).parse(authority).mayChangeLocks;
 const before=index(previous),after=index(next);
 for(const [id,current] of after){const old=before.get(id);if(!mayChangeLocks&&canonicalJson(old?.node.lock??{})!==canonicalJson(current.node.lock??{}))throw new LockTransitionError('LOCK_CHANGE_FORBIDDEN',id,'Lock flags require a separate trusted authority decision');}
 for(const [id,old] of before){
  const current=after.get(id),lock=old.node.lock;
  if(!current){if(lock?.remove)throw new LockTransitionError('BLOCK_REMOVE_LOCKED',id,'This block or a containing subtree cannot be removed');continue;}
  if(lock?.move){
   const retained=new Set(old.siblings.filter(sibling=>after.get(sibling)?.parent===old.parent));
   const oldOrder=old.siblings.filter(sibling=>retained.has(sibling)),newOrder=current.siblings.filter(sibling=>retained.has(sibling));
   if(current.parent!==old.parent||oldOrder.some(sibling=>(oldOrder.indexOf(sibling)<oldOrder.indexOf(id))!==(newOrder.indexOf(sibling)<newOrder.indexOf(id))))throw new LockTransitionError('BLOCK_MOVE_LOCKED',id,'A move-locked block must retain its parent and relative order among retained siblings');
  }
  if(lock?.edit){
   const {lock:_oldLock,...oldContent}=old.node,{lock:_newLock,...newContent}=current.node;
   if(canonicalJson(oldContent)!==canonicalJson(newContent))throw new LockTransitionError('BLOCK_EDIT_LOCKED',id,'An edit-locked block retains its complete authored content and descendants');
  }
 }
}
