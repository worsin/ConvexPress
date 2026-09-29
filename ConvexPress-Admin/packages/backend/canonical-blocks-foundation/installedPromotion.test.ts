import {expect,test} from 'bun:test';
import {installedPromotionDefinition} from './installedPromotion';
import {authoredPresentationSearchText,resolvedCompositionSearchText} from './searchText';
import {parseComposedDefinition} from './composedDefinitions';
import {resolveComposedPresentation} from './composedPresentation';
test('reviewed promotion candidates include authored loops and pack alternatives, exclude destinations and unused settings',()=>{
 const original=installedPromotionDefinition('blocks/studio-services')!;
 const definition=parseComposedDefinition({...original,composition:{version:1,root:{el:'Stack',children:[
  {el:'Text',bind:'attrs.headline',if:'false'},
  {el:'Grid',each:'attrs.services',as:'service',children:[{el:'Text',bind:'service.title'}]},
  {el:'Link',props:{label:'Visible link',href:'https://example.invalid/Privatedestination'}},
 ]}},packTreatments:{journal:{version:1,root:{el:'Text',bind:'attrs.introduction'}}}});
 const attrs={headline:'Hiddenalternative',eyebrow:'Unusedsetting',introduction:'Journalcopy',services:[{title:'Firstcard',description:'Unuseddescription'},{title:'Secondcard',description:'Unuseddescription'}]};
 expect(authoredPresentationSearchText(definition,attrs)).toBe('Hiddenalternative Firstcard Secondcard Visible link Journalcopy');
 const current=resolveComposedPresentation(definition,attrs,{packId:'core',readMedia:()=>undefined});expect(resolvedCompositionSearchText(current.root,'')).toBe('Firstcard Secondcard Visible link');
 expect(installedPromotionDefinition('core/paragraph')).toBeUndefined();
});
test('candidate projection does not fabricate resolver data or traverse dependent aliases',()=>{
 const original=installedPromotionDefinition('blocks/studio-services')!;
 const definition={...original,composition:{version:1 as const,root:{el:'Stack' as const,children:[{el:'Text' as const,bind:'attrs.headline'},{el:'Grid' as const,each:'data.items',as:'item',children:[{el:'Text' as const,bind:'item.title'}]}]}}};
 expect(authoredPresentationSearchText(definition,{headline:'Authored'})).toBe('Authored');
});

test('candidate alternatives tolerate an absent optional parent without weakening current validation',()=>{
 const original=installedPromotionDefinition('blocks/studio-services')!;
 const definition=parseComposedDefinition({...original,spec:{...original.spec,fields:[...original.spec.fields,{id:'enabled',type:'boolean',default:false},{id:'optional',type:'object',nullable:true,default:null,fields:[{id:'title',type:'text'}]}]},composition:{version:1,root:{el:'Stack',children:[{el:'Text',bind:'attrs.headline'},{el:'Text',if:'attrs.enabled',bind:'attrs.optional.title'}]}}});
 expect(authoredPresentationSearchText(definition,{headline:'Visible'})).toBe('Visible');
 expect(authoredPresentationSearchText(definition,{headline:'Visible',optional:{title:'Alternative'}})).toBe('Visible Alternative');
});
