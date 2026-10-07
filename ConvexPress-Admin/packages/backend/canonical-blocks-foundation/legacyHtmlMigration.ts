import {Parser} from 'htmlparser2';

type Element = {tag:string; attrs:Record<string,string>; children:(Element|string)[]};
type Mark = {type:string; attrs?:Record<string,string>};
type Inline = {type:'text'; text:string; marks?:Mark[]} | {type:'hardBreak'};
const marks:Record<string,string>={strong:'bold',b:'bold',em:'italic',i:'italic',s:'strike',strike:'strike',u:'underline',code:'code'};
const isBlock=(name:string)=>name==='p'||/^h[1-6]$/u.test(name);

/** Parse a declared HTML subset into editable rich text. This is deliberately
 * not a sanitizer: unrepresentable authoring and parser repairs reject the
 * entire import. The caller retains the exact source in revision history. */
export function legacyHtmlDocument(source:string,fail:(message:string)=>never):unknown {
 const roots:Element[]=[], stack:Element[]=[];
 let cursor=0,nodes=0,attributes=new Set<string>();
 const consume=()=>{
  if(parser.startIndex!==cursor)fail('Unparsed HTML requires a lossless adapter');
  cursor=parser.endIndex+1;
 };
 const parser=new Parser({
  onopentagname(){attributes=new Set();},
  onattribute(name){if(attributes.has(name))fail('Duplicate HTML attributes require review');attributes.add(name);},
  onopentag(tag,attrs,implied){
   if(implied)fail('Repaired HTML requires review');
   consume();
   if(++nodes>10000||stack.length>=16)fail('HTML exceeds the migration node/depth budget');
   if(!isBlock(tag)&&!Object.prototype.hasOwnProperty.call(marks,tag)&&tag!=='a'&&tag!=='br')fail(`A lossless HTML ${tag} adapter is required`);
   const allowed=tag==='a'?['href','target']:[];
   if(Object.keys(attrs).some(key=>!allowed.includes(key)))fail('An authored HTML attribute requires a lossless adapter');
   if(tag==='a'&&(!attrs.href||stack.some(node=>node.tag==='a')))fail('HTML links require one explicit destination');
   if(isBlock(tag)?stack.length>0:stack.length===0)fail('HTML nesting requires a lossless adapter');
   const node:Element={tag,attrs,children:[]};
   if(stack.length)stack[stack.length-1].children.push(node);else roots.push(node);
   if(tag!=='br')stack.push(node);
  },
  ontext(text){
   consume();
   if(!stack.length){if(text.trim())fail('Unwrapped HTML text requires a lossless adapter');return;}
   const children=stack[stack.length-1].children;
   if(typeof children[children.length-1]==='string')children[children.length-1]+=text;
   else children.push(text);
  },
  onclosetag(tag,implied){
   if(tag==='br'&&implied)return;
   if(implied||stack[stack.length-1]?.tag!==tag)fail('Repaired or unclosed HTML requires review');
   consume();stack.pop();
  },
  oncomment(){fail('HTML comments require a lossless adapter');},
  onprocessinginstruction(){fail('HTML declarations require a lossless adapter');},
  oncdatastart(){fail('HTML CDATA requires a lossless adapter');},
 },{decodeEntities:true});
 parser.end(source);
 if(cursor!==source.length||stack.length)fail('Incomplete HTML requires review');
 function inline(children:(Element|string)[],active:Mark[]=[]):Inline[]{
  return children.flatMap((child):Inline[]=>{
   if(typeof child==='string')return child?[{type:'text',text:child,...(active.length?{marks:active}:{})}]:[];
   if(child.tag==='br')return [{type:'hardBreak'}];
   const mark:Mark=child.tag==='a'?{type:'link',attrs:child.attrs}:{type:marks[child.tag]};
   // Repeated identical marks have no extra rendered meaning, but conflicting
   // values must never silently replace an author's decision.
   const previous=active.find(item=>item.type===mark.type);
   if(previous&&JSON.stringify(previous)!==JSON.stringify(mark))fail('Conflicting inline HTML marks require review');
   return inline(child.children,previous?active:[...active,mark]);
  });
 }
 return {type:'doc',content:roots.map(node=>({type:node.tag==='p'?'paragraph':'heading',...(node.tag==='p'?{}:{attrs:{level:Number(node.tag.slice(1))}}),content:inline(node.children)}))};
}
