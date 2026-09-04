/** Core · system.passwordGate — password prompt for protected pages and posts. */
import { PasswordGate } from "@/components/blog/PasswordGate";
import { PagePasswordForm } from "@/components/pages/PagePasswordForm";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface PasswordGateSurfaceData {
  /** Which protected resource is being unlocked; Core styles posts and pages slightly differently. */
  kind: "page" | "post";
  title: string;
  onSubmit: (password: string) => void;
  /** True while the submitted password is being verified. */
  isVerifying: boolean;
  error?: string;
}

export default function CoreSystemPasswordGate({ data }: SurfaceProps<PasswordGateSurfaceData>) {
  if (data.kind === "post") {
    return <PasswordGate title={data.title} onSubmit={data.onSubmit} error={data.error} isVerifying={data.isVerifying} />;
  }
  return <PagePasswordForm pageTitle={data.title} onSubmit={data.onSubmit} isLoading={data.isVerifying} error={data.error} />;
}
