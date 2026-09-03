import { describe, expect, test } from "bun:test";

import {
  acceptanceProxyArguments,
  buildElectronAcceptanceEnvironment,
} from "./electron-acceptance-environment.mjs";

describe("Electron acceptance environment", () => {
  test("passes only runtime necessities and explicit acceptance origins", () => {
    const result = buildElectronAcceptanceEnvironment(
      {
        PATH: "/usr/bin:/bin",
        HOME: "/Users/tester",
        TMPDIR: "/tmp/",
        LANG: "en_US.UTF-8",
        AIRTABLE_API_KEY: "must-not-leak",
        OPENROUTER_API_KEY: "must-not-leak",
        ORCA_AGENT_HOOK_TOKEN: "must-not-leak",
        CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN: "http://192.168.1.246:4720",
        CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN: "http://192.168.1.246:4820",
        CONVEXPRESS_ACCEPTANCE_UNRECOGNIZED_SECRET: "must-not-leak",
        ELECTRON_RUN_AS_NODE: "1",
      },
      {
        CONVEXPRESS_DESKTOP_DEV: "1",
        CONVEXPRESS_DESKTOP_DEV_URL: "http://127.0.0.1:4105",
      },
    );

    expect(result).toEqual({
      PATH: "/usr/bin:/bin",
      HOME: "/Users/tester",
      TMPDIR: "/tmp/",
      LANG: "en_US.UTF-8",
      CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN: "http://192.168.1.246:4720",
      CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN: "http://192.168.1.246:4820",
      CONVEXPRESS_DESKTOP_DEV: "1",
      CONVEXPRESS_DESKTOP_DEV_URL: "http://127.0.0.1:4105",
    });
  });

  test("accepts only a credential-free loopback SOCKS proxy", () => {
    expect(
      acceptanceProxyArguments({
        CONVEXPRESS_ACCEPTANCE_PROXY_SERVER: "socks5://127.0.0.1:17890",
      }),
    ).toEqual(["--proxy-server=socks5://127.0.0.1:17890"]);
    expect(() =>
      acceptanceProxyArguments({
        CONVEXPRESS_ACCEPTANCE_PROXY_SERVER: "http://proxy.example:8080",
      }),
    ).toThrow("loopback SOCKS5");
    expect(() =>
      acceptanceProxyArguments({
        CONVEXPRESS_ACCEPTANCE_PROXY_SERVER: "socks5://name:secret@127.0.0.1:17890",
      }),
    ).toThrow("loopback SOCKS5");
  });
});
