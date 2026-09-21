import { expect, test } from "bun:test";
import { migrateLegacyDocument } from "../../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacyDocumentMigration";
import { migrateStructuredArticle } from "../../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacyStructuredMigration";
import { validateBlockAttrs } from "../../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/schemas";

const paragraph = (text: string) => ({type:"paragraph",content:[
  {type:"text",text,marks:[{type:"bold"}]},
  {type:"hardBreak"},
  {type:"text",text:"Read the source",marks:[{type:"link",attrs:{href:"https://example.org/study",target:"_blank"}}]},
]});

test("long original paragraphs migrate as one editable paragraph with exact marks, breaks and links", () => {
  const source={type:"doc",content:[paragraph("A lasting paragraph. ".repeat(300)),{type:"paragraph",content:[]}]};
  const content=JSON.stringify(source);
  const converted=migrateLegacyDocument({postId:"long-original",content});
  expect(converted.map(block=>block.name)).toEqual(["core/paragraph","core/paragraph"]);
  expect(converted[0].attrs.body).toEqual({type:"doc",content:[source.content[0]]});
  expect(converted[1].attrs.body).toEqual({type:"doc",content:[source.content[1]]});
  expect(JSON.stringify(source)).toBe(content);
  expect(converted[0].version).toBe(2);
});

test("structured long prose retains its paragraph boundary and linkification", () => {
  const text="An uninterrupted thought. ".repeat(240)+"https://example.org/study";
  const tree=migrateStructuredArticle({postId:"structured",path:"/blog/long-copy",hero:{content:text}});
  expect(tree).toHaveLength(1);
  expect(tree[0].children).toHaveLength(1);
  const body=tree[0].children![0].attrs.body as any;
  expect(body.content).toHaveLength(1);
  expect(body.content[0].content.map((node:any)=>node.text).join("")).toBe(text);
  expect(body.content[0].content.at(-1).marks).toEqual([{type:"link",attrs:{href:"https://example.org/study",target:"_blank"}}]);
});

test("paragraph capacity stays bounded without splitting Unicode or accepting unsafe marks", () => {
  const text="🌲".repeat(9999)+"ok";
  const body={type:"doc",content:[{type:"paragraph",content:[{type:"text",text}]}]};
  expect(validateBlockAttrs("core/paragraph",{body})).toEqual({body});
  expect(()=>validateBlockAttrs("core/paragraph",{body:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:text+"!"}]}]}})).toThrow();
  const unsafe={type:"paragraph",content:[{type:"text",text:"a".repeat(3000),marks:[{type:"link",attrs:{href:"javascript:alert(1)"}}]}]};
  expect(()=>migrateLegacyDocument({postId:"unsafe",content:JSON.stringify({type:"doc",content:[unsafe]})})).toThrow();
});
