import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import workshop from "./assets/ceramic-workshop-editorial.png";
import { navigationTreeIndex } from "../src/templates/sdk/block-data/portable/navigationTree";
import type {
	DataScope,
	ResolverPolicy,
} from "../src/templates/sdk/block-data/portable/contracts";
import type { BlockInstance } from "../src/templates/sdk/block-renderer/model";
/** Explicit isolated specimens. No fixture is an authenticated backend result. */
export const navigationNames = [
  "core/account-teaser",
  "core/latest-posts",
  "core/menu",
	"core/breadcrumbs",
	"core/anchor-nav",
	"core/table-of-contents",
	"core/site-info",
	"core/child-pages",
];
export function navigationSpecimenTree(
	instance: BlockInstance,
): BlockInstance[] {
	if (!["core/anchor-nav", "core/table-of-contents"].includes(instance.name))
		return [instance];
	const rich = (text: string) => ({
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text }] }],
	});
	return [
		instance,
		...[
			"Materials and intention",
			"A considered process",
			"Details worth keeping",
		].flatMap((text, index) => [
			{
				id: `navigation-heading-${index}`,
				name: "core/heading",
				version: 2,
				attrs: {
					text: rich(text),
					level: index === 1 ? 3 : 2,
					anchor: `study-section-${index + 1}`,
				},
				layout: { spacing: "compact" as const },
			},
			{
				id: `navigation-copy-${index}`,
				name: "core/paragraph",
				version: 2,
				attrs: {
					body: rich(
						[
							"A fictional studio study of familiar materials, natural light, and objects made to last.",
							"Start with a useful question. Keep the process thoughtful, the surface honest, and the result simple.",
							"The final details are authored content. These links navigate the actual headings rendered below.",
						][index],
					),
				},
			},
		]),
	];
}
export async function resolveNavigationDemo(
	tree: unknown,
	scope: DataScope,
	policy: ResolverPolicy,
	logoSrc?: string,
  viewerState: 'signed-in' | 'signed-out' = 'signed-out',
) {
	const index = navigationTreeIndex(tree);
	return resolveCanonicalData(
		tree,
		scope,
		policy,
		async () => ({ page: null }),
		async (resolver, args) => {
			switch (resolver) {
        case "site.viewer": return viewerState === 'signed-in'
          ? {state:'signed-in',href:'/dashboard'}
          : {state:'signed-out',href:'/login?returnTo=%2Fdashboard'};
        case "site.menu": {
          const selected=args as {source:string;menu?:string};
          return {menu:{id:selected.source === 'menu' ? selected.menu : 'demo-menu',name:'Explore Aster House'},items:[
            {id:'stay',parentId:null,depth:0,kind:'link',label:'A place to slow down',description:'Thoughtful spaces, quiet mornings, and room to make yourself at home.',href:'/page/stay',target:'_self',rel:null},
            {id:'house',parentId:null,depth:0,kind:'heading',label:'Around the house',description:null,href:null,target:'_self',rel:null},
            {id:'rooms',parentId:'house',depth:1,kind:'link',label:'Rooms & suites',description:null,href:'/page/rooms',target:'_self',rel:null},
            {id:'table',parentId:'house',depth:1,kind:'link',label:'At the table',description:null,href:'/page/dining',target:'_self',rel:null},
            {id:'journal',parentId:null,depth:0,kind:'link',label:'Notes from the mountains',description:'Seasonal stories and the details we keep coming back to.',href:'https://example.invalid/journal',target:'_blank',rel:'noopener noreferrer'},
          ]};
        }
                case "content.childPages": {
                    const depth = (args as {depth: number}).depth;
                    return {parentLabel: "Studio field notes", items: [
                        {id: "materials", parentId: null, depth: 1, label: "Materials & care", href: "/page/journal/materials"},
                        ...(depth > 1 ? [{id: "ceramics", parentId: "materials", depth: 2, label: "Living with ceramics", href: "/page/journal/materials/ceramics"}] : []),
                        {id: "process", parentId: null, depth: 1, label: "Our considered process", href: "/page/journal/process"},
                        {id: "visiting", parentId: null, depth: 1, label: "Visit the studio", href: "/page/journal/visiting"},
                    ]};
                }
				case "content.headings":
					return { items: index.headings };
				case "content.anchors":
					return { items: index.anchors };
				case "content.breadcrumbs":
					return {
						items: [
							{ label: "Journal", href: "/page/journal", current: false },
							{
								label: "Studio field notes",
								href: "/page/journal/studio-field-notes",
								current: true,
							},
						],
						currentPath: "/page/journal/studio-field-notes",
					};
				case "site.info":
					return {
						name: "Aster House",
						tagline:
							"A fictional mountain retreat and a study in considered living.",
						logo: logoSrc
							? {
									src: logoSrc,
									alt: "Aster House demonstration identity",
									width: 160,
									height: 160,
								}
							: null,
					};
			}
		},
    async args => ({items:[
      {id:"demo-post-1",title:"The quiet work of making",href:"/blog/the-quiet-work",excerpt:"A morning in the studio, where familiar materials become objects worth keeping.",publishedAt:1788566400000,author:"Aster Journal",image:{src:workshop.startsWith('/') ? workshop : `/${workshop}`,alt:"Sunlit ceramic workshop with handmade vessels"}},
      {id:"demo-post-2",title:"A table for the changing season",href:"/blog/changing-season",excerpt:"Simple rituals, thoughtful details, and a little room for the unexpected.",publishedAt:1788307200000,author:"Aster Journal",image:null},
      {id:"demo-post-3",title:"Notes from a slower afternoon",href:"/blog/slower-afternoon",excerpt:"Finding a different pace in the places and practices closest to home.",publishedAt:1787961600000,author:"Aster Journal",image:null},
    ].slice(0,args.count).map(post=>({...post,author:args.showAuthors?post.author:null,excerpt:args.showExcerpts?post.excerpt:null}))}),
	);
}
