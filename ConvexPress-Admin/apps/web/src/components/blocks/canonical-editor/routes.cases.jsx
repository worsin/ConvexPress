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
