import {defineDataBlock} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import {LeadMagnetForm} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/lead-magnet";
import {RichText} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
function fileSize(bytes:number){return bytes>=1024*1024?`${(bytes/(1024*1024)).toFixed(1)} MB`:bytes>=1024?`${Math.ceil(bytes/1024)} KB`:`${bytes} bytes`;}
export default defineDataBlock("core/lead-magnet","forms.leadMagnet",({attrs,data,resources})=>{
 const image=attrs.media?.id?resources.media[attrs.media.id]:null;
 return <section className="cp-lead" aria-label={attrs.title||"Download a guide"}>
  <div className="cp-lead-art"><span className="cp-lead-edition">A guide to keep</span>
   {image?<img src={image.src} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async"/>:<div className="cp-lead-book" aria-hidden="true"><span>Field<br/>Notes.</span><i/><small>Ideas worth returning to.</small></div>}
   <div className="cp-lead-art-footer"><span>Make room for a new idea.</span><span aria-hidden="true">↙</span></div>
  </div>
  <div className="cp-lead-content"><div className="cp-lead-intro"><p className="cp-lead-eyebrow">The reading room</p><h2>{attrs.title||"Something worth keeping."}</h2>{attrs.body&&<div className="cp-lead-body"><RichText content={attrs.body}/></div>}{data.offer&&<p className="cp-lead-meta">Downloadable guide <span aria-hidden="true">·</span> {fileSize(data.offer.file.bytes)}</p>}</div><LeadMagnetForm key={data.offer?.digest||"preview"} offer={data.offer}/></div>
 </section>;
});
