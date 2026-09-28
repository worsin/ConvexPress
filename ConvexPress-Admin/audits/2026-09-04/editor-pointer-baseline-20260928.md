# Native pointer and mixed-tree baseline — 2026-09-28

E01 passes the current scoped native baseline; the previously reported pointer/account-menu instability was not reproduced. No product repair or new regression test was warranted by this acceptance run. E19 durability/autosave is separately accepted in the device/site recovery reports. The complete E06 field/picker/reusable/composed matrix remains open.

## Observed acceptance

Owned Electron33.4.11 PID77285 used the exact hardening checkout executable, renderer4105 and disposable staging4860, under profile `electron-editor-pointer-20260928/-dev`. Created owned page `g18ahff2aqhd12c1zz4b7m9a8n8f89nx` through native Add a Page and initialized canonical content.

- Authored24 nodes using native controls: a Section with Heading, Paragraph and Divider, plus20 root Paragraph nodes. Typed the title and rich-text heading/body with real keyboard events; insertion, selection and Save stayed responsive.
- Moved the nested Heading below the Paragraph. Undo restored the exact original whole draft; Redo restored the exact moved tree; a final Undo restored the intended order. Keyboard ArrowDown selected the following Paragraph.
- Explicit Save produced accepted revision2. Authoritative readback exactly matched the title and every node/attribute in the native draft. The page remained a draft.
- Real mouse wheel moved the main scroll offset0→950. Dragging the actual visible scrollbar thumb moved it0→2747. Sidebar wheel scrolling independently moved0→381. Returning to the top retained the title and content. No direct scrollTop assignment was used to produce these measurements.
- Reloaded the real Electron renderer. The fresh editor base exactly matched the entire saved tree. Typing after reload/scrolling and undo both worked. Both native account menus opened and exposed Sign out, then closed with Escape.
- Actual Website iframe rendered the authored heading and paragraph; the native screenshot was visually reviewed. Scrolling, selection, menus, reload and undone typing left the accepted document, revision2, history and publication status unchanged.
- Signed out and closed only the owned Electron session, removed the owned page and revoked the owned API session. All42 original pages and appearance identity/values matched the baseline. User Electron PID39198 remained running.

Evidence: `output/editor-pointer-20260928/{qa-inventory.md,native-session.json,native-before-save.json,server-saved.json,scroll-proof.json,reopen-proof.json,server-after-reopen.json,cleanup.json}`, plus native drag/reopen screenshots. The24-node count includes three nested children; the saved root array has21 entries.

## Limits

This establishes the requested current pointer/scroll/menu/nesting baseline; it is not a maximum-size performance claim or proof against every intermittent freeze. No platform-wide settings, user process or original content was changed. One harness check incorrectly assumed the macOS End key moved a text caret to the input's end; the inserted string showed it did not. Undo restored the input, then native select-all/typing supplied a deterministic check. This was not a lost-input or pointer defect.

The first delivery task remains open for the per-row requirement/evidence reconciliation and the complete handoff clause map. No block tracker status changed:60Verified/77Inprogress. No push.
