/**
 * Core · system.restricted — membership gate: teaser (hide / excerpt / custom
 * message) plus the sign-in or upgrade call to action.
 */
import {
  RestrictedContent,
  type RestrictedRule,
  type RestrictedTeaserMode,
  type RestrictedUserState,
} from "@/components/membership/RestrictedContent";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface RestrictedSurfaceData {
  mode: RestrictedTeaserMode;
  rule: RestrictedRule;
  /** Pre-computed plain-text excerpt (only used when mode === "excerpt"). */
  excerpt?: string;
  userState: RestrictedUserState;
  /** When set, the gate stands alone on the page under this heading (pages); omitted when embedded in a post body. */
  title?: string;
  className?: string;
}

export default function CoreSystemRestricted({ data }: SurfaceProps<RestrictedSurfaceData>) {
  const gate = (
    <RestrictedContent
      mode={data.mode}
      rule={data.rule}
      excerpt={data.excerpt}
      userState={data.userState}
      className={data.className}
    />
  );
  if (data.title === undefined) return gate;
  return (
    <div data-slot="restricted-page" className="mx-auto flex max-w-3xl flex-col gap-6 px-4">
      <h1 className="text-lg font-bold leading-tight md:text-xl">{data.title}</h1>
      {gate}
    </div>
  );
}
