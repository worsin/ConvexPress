import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia } from "../_shared/rendering";
import { fieldGuideAttrsSchema, type FieldGuideAttrs } from "./schema";
import { FieldGuideView } from "./View";
function Renderer({attrs}:BlockRendererProps<FieldGuideAttrs>) { return <FieldGuideView attrs={attrs} image={attrs.mediaId?<BlockMedia mediaId={attrs.mediaId} alt={attrs.mediaAlt}/>:undefined}/>; }
export const definition = {name:"reference/field-guide",title:"Field Guide",version:1,schema:fieldGuideAttrsSchema,Renderer,rendererStatus:"ready"} satisfies WebsiteBlockDefinition;
export default definition;
