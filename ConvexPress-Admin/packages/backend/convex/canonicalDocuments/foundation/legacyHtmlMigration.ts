import {Parser} from 'htmlparser2';

type Element = {tag:string; attrs:Record<string,string>; children:(Element|string)[]};
type Mark = {type:string; attrs?:Record<string,string>};
type Inline = {type:'text'; text:string; marks?:Mark[]} | {type:'hardBreak'};
/** The TipTap document the declared HTML subset parses into. */
export type LegacyHtmlParagraph = {type:'paragraph'; content:Inline[]};
export type LegacyHtmlHeading = {type:'heading'; attrs:{level:number}; content:Inline[]};
export type LegacyHtmlList = {type:'bulletList'|'orderedList'; attrs?:{start:number}; content:LegacyHtmlListItem[]};
export type LegacyHtmlListItem = {type:'listItem'; content:(LegacyHtmlParagraph|LegacyHtmlList)[]};
export type LegacyHtmlDocument = {type:'doc'; content:(LegacyHtmlParagraph|LegacyHtmlHeading|LegacyHtmlList)[]};
const marks:Record<string,string>={strong:'bold',b:'bold',em:'italic',i:'italic',s:'strike',strike:'strike',u:'underline',code:'code'};
const isHeading=(name:string)=>/^h[1-6]$/u.test(name);
const isList=(name:string)=>name==='ul'||name==='ol';
/** Elements that hold inline content (text, marks, links, line breaks). */
const holdsInline=(name:string)=>name==='p'||isHeading(name)||name==='li'||Object.prototype.hasOwnProperty.call(marks,name)||name==='a';
/** Where each structural element may appear: '' is the document root. */
const allowedParents:Record<string,readonly string[]>={p:['','li'],ul:['','li'],ol:['','li'],li:['ul','ol']};

/** Parse a declared HTML subset into editable rich text. This is deliberately
 * not a sanitizer: unrepresentable authoring and parser repairs reject the
 * entire import. The caller retains the exact source in revision history. */
export function legacyHtmlDocument(source:string,fail:(message:string)=>never):LegacyHtmlDocument {
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
   const structural=Object.prototype.hasOwnProperty.call(allowedParents,tag)||isHeading(tag);
   if(!structural&&!Object.prototype.hasOwnProperty.call(marks,tag)&&tag!=='a'&&tag!=='br')fail(`A lossless HTML ${tag} adapter is required`);
   const allowed=tag==='a'?['href','target']:tag==='ol'?['start']:[];
   if(Object.keys(attrs).some(key=>!allowed.includes(key)))fail('An authored HTML attribute requires a lossless adapter');
   if(tag==='ol'&&attrs.start!==undefined&&!/^[1-9][0-9]{0,8}$/u.test(attrs.start))fail('An ordered-list start must be a positive integer');
   if(tag==='a'&&(!attrs.href||stack.some(node=>node.tag==='a')))fail('HTML links require one explicit destination');
   const parent=stack.length?stack[stack.length-1].tag:'';
   if(isHeading(tag)?parent!=='':structural?!allowedParents[tag].includes(parent):!holdsInline(parent))fail('HTML nesting requires a lossless adapter');
   const node:Element={tag,attrs,children:[]};
   if(stack.length)stack[stack.length-1].children.push(node);else roots.push(node);
   if(tag!=='br')stack.push(node);
  },
  ontext(text){
   consume();
   // Whitespace between top-level blocks or list items is formatting.
   if(!stack.length||isList(stack[stack.length-1].tag)){if(text.trim())fail('Unwrapped HTML text requires a lossless adapter');return;}
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
 function list(node:Element):LegacyHtmlList{
  const items=node.children.map(child=>{
   if(typeof child==='string'||child.tag!=='li')fail('HTML lists may only contain list items');
   return listItem(child);
  });
  if(!items.length)fail('Empty HTML lists require review');
  const start=node.tag==='ol'&&node.attrs.start!==undefined?Number(node.attrs.start):undefined;
  return {type:node.tag==='ul'?'bulletList':'orderedList',...(start!==undefined?{attrs:{start}}:{}),content:items};
 }
 /** A list item's inline runs become paragraphs; nested paragraphs and lists keep their place. */
 function listItem(node:Element):LegacyHtmlListItem{
  const content:(LegacyHtmlParagraph|LegacyHtmlList)[]=[];let run:(Element|string)[]=[];
  const flush=()=>{
   const meaningful=run.some(child=>typeof child!=='string'||child.trim());
   if(meaningful)content.push({type:'paragraph',content:inline(run)});
   run=[];
  };
  for(const child of node.children){
   if(typeof child!=='string'&&(child.tag==='p'||isList(child.tag))){
    flush();
    content.push(child.tag==='p'?{type:'paragraph',content:inline(child.children)}:list(child));
   }else run.push(child);
  }
  flush();
  if(!content.length)fail('Empty HTML list items require review');
  return {type:'listItem',content};
 }
 return {type:'doc',content:roots.map(node=>isList(node.tag)?list(node):node.tag==='p'?{type:'paragraph',content:inline(node.children)}:{type:'heading',attrs:{level:Number(node.tag.slice(1))},content:inline(node.children)})};
}
