# Block visual acceptance

The owner's quality requirement applies to every shipped block and default template: deliberate typography and composition, smooth motion, and no visibly pixelated gradients. A renderer count or successful screenshot capture alone does not establish this quality.

Review each new block in the discovered packs at desktop and mobile widths. Use authored content that demonstrates its purpose, with realistic short and long copy, optional media present and absent, and meaningful interactive states. The demo must preserve empty media fields; it must not substitute stock images for an author's deliberate omission. Nested composition blocks need actual prepared children rather than hardcoded renderer content or placeholder headings.

Judge the rendered result: readable text and controls, clear hierarchy, useful image crops, balanced spacing, no horizontal overflow, no empty layout regions left by optional content, and visible focus. A compact action such as closing an announcement should retain an accessible name and a usable pointer target without becoming the largest element in the notice. Cosmetic fixes must preserve authored fields and behavior.

Use motion where it helps the composition or interaction. Favor opacity and transform for movement; avoid animating layout dimensions, heavy filters, or per-frame React state. Content remains usable with reduced motion and unavailable observers. Offscreen entrances wait for viewport entry; keyboard focus must not land in visually hidden content. Continuous motion needs a usable pause control and must not create duplicate accessible links or controls.

Measure actual animated components on a visible hardware-accelerated browser when establishing motion acceptance. Record the device, renderer, viewport, DPR, sample interval and frame timing; inspect the exact composited element where possible. Headless screenshots and software compositing are useful regressions but are not evidence of hardware smoothness. The existing Section and marquee measurements are scoped examples, not a guarantee for every block or device.

Prefer vector/CSS treatments for gradients and icons. Inspect gradient transitions and any raster effects at their intended display size and DPR; do not enlarge a small gradient bitmap to fill a hero. Investigate visible banding, blur or stutter at its source before accepting the design.

Keep renderer implementation, functional checks, visual review, live data integration and complete block acceptance separate in MagicTables. A polished isolated specimen does not close unresolved editor, migration, plugin, permission or production-runtime work.
