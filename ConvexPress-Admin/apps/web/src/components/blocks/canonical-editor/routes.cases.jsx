import {expect,mock,test} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
mock.module('@backend/convex/_generated/api',()=>({api:{posts:{queries:{get:{}}}}}));
let record={_id:'document',title:'Retained source',status:'draft',content:'Unconverted source',contentMode:'article',blocksVersion:1};
const router=await import('@tanstack/react-router');
mock.module('@tanstack/react-router',()=>({...router,createLazyFileRoute:()=>options=>({options,useSearch:()=>({})}),useParams:()=>({pageId:'document',postId:'document'}),Link:({children})=><a>{children}</a>}));
mock.module('@/components/blocks/canonical-editor/NativeCanonicalEditor',()=>({NativeCanonicalEditor:({postId})=><section data-document={postId}>Canonical editor and import review</section>}));
mock.module('@/hooks/pages/usePage',()=>({usePage:()=>({page:record,isLoading:record===undefined,notFound:record===null})}));
mock.module('@/hooks/pages/usePageMutations',()=>({usePageMutations:()=>({restorePage:()=>{throw Error('Unexpected restore')}})}));
mock.module('@/hooks/posts/usePostMutations',()=>({usePostMutations:()=>({restorePost:()=>{throw Error('Unexpected restore')}})}));
mock.module('convex-helpers/react/cache',()=>({useQuery:()=>record}));
const {Route:page}=await import('../../../routes/_authenticated/_admin/pages/$pageId/edit.lazy');
const {Route:post}=await import('../../../routes/_authenticated/_admin/posts/$postId/edit.lazy');
for(const [name,route] of [['page',page],['post',post]]){
 const Component=route.options.component;
 for(const version of [undefined,1,2])test(`${name} version ${version} opens canonical authoring or deliberate import without a legacy editor`,()=>{record={_id:'document',title:'Retained source',status:'draft',content:'Unconverted source',contentMode:'article',blocksVersion:version};const html=renderToStaticMarkup(<Component/>);expect(html).toContain('data-document="document"');expect(html).toContain('Canonical editor and import review');});
 test(`${name} loading, unavailable and trash states do not mount editable content`,()=>{for(const value of [undefined,null,{_id:'document',title:'Trashed',status:'trash'}]){record=value;expect(renderToStaticMarkup(<Component/>)).not.toContain('data-document=');}});
}

// Neither legacy nor malformed records may mount any Quick Edit write/query hooks.
mock.module('@/hooks/useCanonicalMetadata',()=>({useCanonicalMetadata:()=>{throw Error('Quick Edit mutation mounted before review')}}));
mock.module('@/hooks/pages/usePageTree',()=>({usePageTree:()=>{throw Error('Quick Edit tree mounted before review')}}));
mock.module('@/hooks/pages/usePageTemplates',()=>({usePageTemplates:()=>{throw Error('Quick Edit templates mounted before review')}}));
mock.module('@/components/ui/button',()=>({Button:({children,...props})=><button {...props}>{children}</button>}));
mock.module('@tanstack/react-router',()=>({...router,Link:({children,to,params})=><a href={to.replace(/\$(postId|pageId)/,()=>params.postId??params.pageId)}>{children}</a>}));
const {PostQuickEdit}=await import('../../posts/PostQuickEdit');
const {PageQuickEdit}=await import('../../pages/PageQuickEdit');
for(const [kind,Component] of [['post',PostQuickEdit],['page',PageQuickEdit]]) {
  test(`${kind} Quick Edit sends legacy and incomplete records to the editor without mounting a writer`,()=>{
    for(const fields of [{},{blocksVersion:1,blocksRevision:8},{blocksVersion:2},{blocksVersion:2,blocksRevision:0},{blocksVersion:2,blocksRevision:1.5}]) {
      const value={_id:'retained-document',title:'Saved content',slug:'saved',status:'draft',...fields};
      const html=renderToStaticMarkup(<Component {...{[kind]:value}} onClose={()=>{}}/>);
      expect(html).toContain(`href="/${kind}s/retained-document/edit"`);
      expect(html).toContain('Your existing content is preserved');
      expect(html).not.toContain('<input');
    }
  });
}
