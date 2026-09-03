/**
 * Environment identity helpers.
 *
 * The full-width environment strip was folded into the shell: the topbar's
 * `EnvironmentSwitch` picks the database, `EnvironmentChip` names it beside
 * the title, and `EnvironmentMenu` carries health, contract, the public link,
 * site operations, and transfer. This module keeps the shared label logic.
 */

export function environmentIdentityLabel(
  websiteTitle: string | null,
  environment: {
    instanceKey: string;
    kind: string;
    label: string | null;
  },
) {
  if (!websiteTitle) return environment.instanceKey;
  return `${websiteTitle} — ${environment.label || environment.kind}`;
}
