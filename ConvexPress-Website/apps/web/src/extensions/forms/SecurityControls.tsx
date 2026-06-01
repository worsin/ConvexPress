import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import {
  captchaConfigProblem,
  captchaIsRequired,
  type CaptchaProvider,
  type PublicFormSecurity,
} from "./security";

type CaptchaWidgetId = string | number;

declare global {
  interface Window {
    turnstile?: CaptchaRenderer;
    hcaptcha?: CaptchaRenderer;
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (
        siteKey: string,
        options: { action: string },
      ) => Promise<string>;
    };
  }
}

interface CaptchaRenderer {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => CaptchaWidgetId;
  remove?: (id: CaptchaWidgetId) => void;
  reset?: (id: CaptchaWidgetId) => void;
}

interface FormSecurityControlsProps {
  formId: string;
  security?: PublicFormSecurity;
  honeypotValue: string;
  onHoneypotChange: (value: string) => void;
  onCaptchaTokenChange: (token: string) => void;
  onCaptchaErrorChange: (message: string | null) => void;
}

const scriptCache = new Map<string, Promise<void>>();

function scriptId(src: string): string {
  let hash = 0;
  for (let i = 0; i < src.length; i += 1) {
    hash = (hash * 31 + src.charCodeAt(i)) | 0;
  }
  return `forms-captcha-${Math.abs(hash)}`;
}

function loadScript(src: string): Promise<void> {
  if (scriptCache.has(src)) return scriptCache.get(src)!;
  const promise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("CAPTCHA cannot load during server render."));
      return;
    }

    const id = scriptId(src);
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("CAPTCHA script failed to load.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("CAPTCHA script failed to load."));
    document.head.appendChild(script);
  });

  scriptCache.set(src, promise);
  return promise;
}

function providerScriptUrl(provider: CaptchaProvider, siteKey: string): string {
  if (provider === "turnstile") {
    return "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  }
  if (provider === "hcaptcha") {
    return "https://js.hcaptcha.com/1/api.js?render=explicit";
  }
  if (provider === "recaptcha") {
    return `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
  }
  return "";
}

export function FormSecurityControls({
  formId,
  security,
  honeypotValue,
  onHoneypotChange,
  onCaptchaTokenChange,
  onCaptchaErrorChange,
}: FormSecurityControlsProps) {
  return (
    <>
      <HoneypotInput
        formId={formId}
        security={security}
        value={honeypotValue}
        onChange={onHoneypotChange}
      />
      <CaptchaChallenge
        security={security}
        onTokenChange={onCaptchaTokenChange}
        onErrorChange={onCaptchaErrorChange}
      />
    </>
  );
}

function HoneypotInput({
  formId,
  security,
  value,
  onChange,
}: {
  formId: string;
  security?: PublicFormSecurity;
  value: string;
  onChange: (value: string) => void;
}) {
  if (security?.honeypotEnabled === false) return null;
  const fieldName = security?.honeypotFieldName?.trim() || "website_url";
  const inputId = `forms-hp-${formId}`;

  return (
    <div
      aria-hidden="true"
      className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
    >
      <label htmlFor={inputId}>Leave this field blank</label>
      <input
        id={inputId}
        name={fieldName}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function CaptchaChallenge({
  security,
  onTokenChange,
  onErrorChange,
}: {
  security?: PublicFormSecurity;
  onTokenChange: (token: string) => void;
  onErrorChange: (message: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onTokenChange("");
    onErrorChange(null);

    if (!captchaIsRequired(security)) return;
    const problem = captchaConfigProblem(security);
    if (problem) {
      onErrorChange(problem);
      return;
    }

    const siteKey = security?.captchaSiteKey?.trim();
    const provider = security?.captchaProvider;
    if (!siteKey || !provider || provider === "none") return;

    let cancelled = false;
    let widgetId: CaptchaWidgetId | null = null;
    const src = providerScriptUrl(provider, siteKey);

    const fail = () => {
      if (cancelled) return;
      onTokenChange("");
      onErrorChange("Verification could not load. Please refresh and try again.");
    };

    void loadScript(src)
      .then(() => {
        if (cancelled) return;
        if (provider === "recaptcha") {
          if (!window.grecaptcha) {
            fail();
            return;
          }
          window.grecaptcha.ready(() => {
            if (cancelled) return;
            void window.grecaptcha!
              .execute(siteKey, { action: "form_submit" })
              .then((token) => {
                if (cancelled) return;
                onTokenChange(token);
                onErrorChange(null);
              })
              .catch(fail);
          });
          return;
        }

        const renderer =
          provider === "turnstile" ? window.turnstile : window.hcaptcha;
        const container = containerRef.current;
        if (!renderer || !container) {
          fail();
          return;
        }

        widgetId = renderer.render(container, {
          sitekey: siteKey,
          callback: (token: string) => {
            onTokenChange(token);
            onErrorChange(null);
          },
          "expired-callback": () => {
            onTokenChange("");
          },
          "error-callback": fail,
        });
      })
      .catch(fail);

    return () => {
      cancelled = true;
      if (provider === "turnstile" && widgetId != null) {
        window.turnstile?.remove?.(widgetId);
      }
      if (provider === "hcaptcha" && widgetId != null) {
        window.hcaptcha?.remove?.(widgetId);
      }
    };
  }, [security, onTokenChange, onErrorChange]);

  if (!captchaIsRequired(security)) return null;

  const problem = captchaConfigProblem(security);
  if (problem) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {problem}
      </p>
    );
  }

  if (security?.captchaProvider === "recaptcha") {
    return (
      <div
        className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        data-slot="forms-captcha"
      >
        Verification is running in the background.
      </div>
    );
  }

  return (
    <div
      data-slot="forms-captcha"
      className={cn("min-h-16", "overflow-hidden")}
      ref={containerRef}
    />
  );
}
