import "./original-utilities.generated.css";
import { validateCanonicalTree } from "../src/templates/sdk/block-data/portable/generated/instances";
import { getBlockDefinition } from "../src/lib/blocks/registry";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";
const cases = [
  ...["small", "medium", "large", "xlarge"].map(value => ({name:"core/spacer" as const,field:"size",value})),
  ...["default", "section", "subtle"].map(value => ({name:"core/divider" as const,field:"variant",value})),
];
export function OriginalUtilitiesStudy({packId}:{packId:string}) {
  return <details className="canonical-study" data-original-utilities>
    <summary>Original spacing and divider comparison</summary>
    <p className="specimen-note">The actual original renderer beside its canonical conversion. Saved choices stay intact when templates change.</p>
    {cases.map(({name,field,value})=>{
      const definition=getBlockDefinition(name)!;
      const attrs=definition.schema.parse({[field]:value});
      const Original=definition.Renderer;
      const block={id:`original-${field}-${value}`,name,version:1,attrs};
      const tree = validateCanonicalTree([{id:`converted-${field}-${value}`,name,version:2,attrs:{},layout:{spacing:"none",width:"full"},treatment:{name:"original",values:{[field]:value}}}]);
      return <section key={name+value} data-utility-case={`${field}-${value}`}>
        <h3>{name === "core/spacer" ? "Spacer" : "Divider"} · {value}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div data-original-view><Original block={block} attrs={attrs}/></div>
          <div data-converted-view>{prepareBlocks(tree,stagedRenderers,{enabledPlugins:[],capabilities:[],disabledBlocks:[]},{media:{}},undefined,packId)}</div>
        </div>
      </section>;
    })}
  </details>;
}
