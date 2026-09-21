// Copy through create:template into packs/<id> before compiling.
// Core owns loading, empty and authored-page rendering until this pack replaces
// those compositions. The view model is forwarded intact, including access gates.
import CoreHome, { type HomeSurfaceData } from "../../core/surfaces/home";
import type { SurfaceProps } from "../../../sdk/types";
export default function ReferenceHome(props: SurfaceProps<HomeSurfaceData>) {
  return <section className="bg-background text-foreground"><CoreHome {...props} /></section>;
}
