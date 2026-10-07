import type { ReactNode } from "react";
import * as P from "../primitives";

/** Preserve the original DOM order at both stacked and wide widths. */
export function OriginalMediaText({ side, media, copy }: { side: "left" | "right"; media: ReactNode; copy: ReactNode }) {
 return <P.Split gap="lg" align="center">
  {side === "left" ? media : copy}
  {side === "left" ? copy : media}
 </P.Split>;
}
