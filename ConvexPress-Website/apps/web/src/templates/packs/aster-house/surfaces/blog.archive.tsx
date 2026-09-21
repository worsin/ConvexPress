import {DateArchiveSurface,type BlogArchiveSurfaceData} from "@/components/blog/DateArchiveSurface";
import type {SurfaceProps} from "@/templates/sdk/types";
export type {BlogArchiveSurfaceData} from "@/components/blog/DateArchiveSurface";
export default function BlogArchive({data,packId}:SurfaceProps<BlogArchiveSurfaceData>){return <DateArchiveSurface data={data} packId={packId}/>;}
