import {expect,mock,test} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
let hero=false;
mock.module('@/templates/sdk/block-public/PublicCanonicalBody',()=>({PublicCanonicalBody:({documentId,renderLayout})=>{const body=<p data-canonical-id={documentId}>Authorized canonical content</p>;return renderLayout?renderLayout(body,hero):body;}}));
const actualRouter=await import('@tanstack/react-router');
mock.module('@tanstack/react-router',()=>({...actualRouter,Link:({children})=><a>{children}</a>}));
mock.module('@/templates/sdk/Surface',()=>({Surface:({name})=><p data-gate={name}>Restricted</p>}));
for(const name of ['AuthorBox','PostFooter','PostHeader','RelatedPosts','ShareButtons'])mock.module('@/components/blog/'+name,()=>({[name]:()=>null}));
mock.module('@/components/comments/CommentSection',()=>({CommentSection:()=>null}));
for(const [file,name] of [['blocks/BlockListRenderer','BlockListRenderer'],['blog/BlockContentRenderer','BlockContentRenderer'],['blog/PostContent','PostContent'],['blog/StructuredContent','StructuredContent']])mock.module('@/components/'+file,()=>({[name]:()=>{throw Error('Legacy body dispatch remains active');}}));
const page={_id:'page',title:'Page title',slug:'page',path:'/page',template:'default',children:[],breadcrumbs:[],content:{type:'doc',content:[]},blocksVersion:1,contentMode:'blocks',blocks:[{name:'core/paragraph',attrs:{}}]};
const post={...page,_id:'post',categories:[],tags:[],author:{_id:'author',displayName:'Author',slug:'author'},commentCount:0};
for(const pack of ['core','journal','depot','aster-house']){
 const Page=(await import('../packs/'+pack+'/surfaces/page')).default;
 const Post=(await import('../packs/'+pack+'/surfaces/blog.post')).default;
 for(const variant of ['default','blank','landing','sidebar-left','full-width'])test(`${pack} ${variant} uses only the authorized canonical body despite retained source fields`,()=>{
  hero=false;const html=renderToStaticMarkup(<Page data={{page}} variant={variant}/>);expect(html).toContain('data-canonical-id="page"');expect(html).toContain('Authorized canonical content');
  hero=true;const withHero=renderToStaticMarkup(<Page data={{page}} variant={variant}/>);expect(withHero).not.toContain('>Page title</h1>');
 });
 test(`${pack} blog post uses canonical content and preserves membership gate precedence`,()=>{
  const data={post,author:post.author,relatedPosts:[],shareUrl:'/blog/post',structured:{hero:{title:'Archived hero'}},restricted:null,comments:{postId:'post',commentStatus:'closed',isLoggedIn:false}};
  expect(renderToStaticMarkup(<Post data={data}/>)).toContain('data-canonical-id="post"');
  const restricted=renderToStaticMarkup(<Post data={{...data,restricted:{mode:'hide'}}}/>);expect(restricted).toContain('data-gate="system.restricted"');expect(restricted).not.toContain('Authorized canonical content');
 });
}
