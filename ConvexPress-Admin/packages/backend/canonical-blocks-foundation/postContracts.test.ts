import {test,expect} from 'bun:test';
import {latestPostsArgsSchema,latestPostsResultSchema} from './postContracts';
const card={id:'post-1',title:'Public story',href:'/blog/story',excerpt:null,publishedAt:10,author:null,image:null};
test('post discovery contracts reject unknown fields and unsupported source arguments',()=>{
  expect(latestPostsArgsSchema.parse({})).toEqual({count:3,categorySlug:'',tagSlug:'',showAuthors:true,showExcerpts:true});
  for(const value of [{count:0},{count:25},{count:1.2},{functionName:'private:list'}, {query:{status:'draft'}}, {categorySlug:'x'.repeat(121)}])
    expect(latestPostsArgsSchema.safeParse(value).success).toBe(false);
  expect(latestPostsResultSchema.safeParse({items:[{...card,content:'private body'}]}).success).toBe(false);
  expect(latestPostsResultSchema.safeParse({items:[{...card,author:{email:'private@example.invalid'}}]}).success).toBe(false);
});
test('post cards bind unique ordered identities and browser-safe URLs',()=>{
  expect(latestPostsResultSchema.parse({items:[card]})).toEqual({items:[card]});
  for(const items of [[card,card],[card,{...card,id:'second',publishedAt:20}],[{...card,href:'https://external.invalid'}],[{...card,image:{src:'javascript:alert(1)',alt:''}}]])
    expect(latestPostsResultSchema.safeParse({items}).success).toBe(false);
});
