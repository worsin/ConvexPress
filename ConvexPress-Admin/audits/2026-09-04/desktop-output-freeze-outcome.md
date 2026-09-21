# Electron input freeze after launcher disconnect

User reported non-working links and scrollbar during live acceptance. The window had no active modal or pointer-events lock; renderer DOM/CDP remained responsive, but screenshots and native accessibility timed out. Main process19702 used102-104%CPU with stdout/stderr pipes showing no peer; renderer/GPU children were idle and system memory pressure was healthy.

A native sample placed the busy main thread in Node exception reporting. Main inspector pause captured `warn → safeError → uncaughtException → emit`. A temporary breakpoint at the exception logger confirmed `{code:"EPIPE",name:"Error",syscall:"write"}`. The Playwright REPL controller had timed out/reset while Electron survived as an orphan, closing its output pipes. Existing safeLog/safeError only caught synchronous console failures; asynchronous stream errors recursed through the uncaughtException handler and starved native event handling.

`safe-log.ts` now installs non-logging stdout/stderr error and close listeners before app startup. Failed output streams are remembered and skipped by safeLog/safeError. Window-manager renderer/load/crash logging uses these wrappers. No authentication, mouse settings, GPU flags, or CSS changed.

Regression first failed before implementation, then passed: asynchronous EPIPE events with a forwarding console cannot enter the global exception logger or starve an event-loop heartbeat. Scoped desktop TypeScript and Electron build pass.

Native acceptance: terminated only the stuck isolated test process (SIGTERM could not complete in its loop; SIGKILL required), restarted rebuilt33.4.11 from the hardening worktree using the same copied acceptance profile. Deliberately destroyed the new Playwright process stdout/stderr reader pipes and triggered renderer logging. Navigation to Integrations worked, screenshot completed, wheel scroll moved main.scrollTop0→640, native CUA Dashboard click changed page content, and scrollbar thumb drag moved0→259. Main process41989 sampled0.0%CPU sleeping afterward. Native accessibility completed in0.435seconds versus the prior120second timeout. Saved synthetic operator session and cloud records survived.

Evidence under output/aster-house: desktop-recovered.png, desktop-detached-output-navigation.png, desktop-scroll-recovered.png, desktop-scrollbar-drag-recovered.png. Native sample in /tmp/convexpress-electron-main-spin.sample contains no credentials; artifact should be treated as local diagnostic evidence rather than portable tests.
